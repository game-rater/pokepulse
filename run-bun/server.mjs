import {SearchService} from './search-service.mjs';
import http from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep,basename,dirname,join} from 'node:path';
import {makeRules,normalizePack} from '../engine.mjs';
import {catalog,defaultBuild,defaultField,scoreBattle,pack as runBunPack} from '../run-bun/profile.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {startBridge} from './bridge.mjs';
import {integrationScript} from './integration.mjs';
import {BattleRecorder} from './battle-recorder.mjs';
import {annotateEntryTurns} from './move-history.mjs';
import {createHash} from 'node:crypto';
const root = resolve('.');
const reportsDirectory=resolve(process.env.POKETHREAT_REPORT_DIR||join(basename(root)==='Run-and-Bun-Automatic'&&basename(dirname(root))==='dist'?resolve(root,'../..'):root,'bug-reports'));
const engineFiles=['run-bun/memory.mjs','run-bun/search-service.mjs','run-bun/profile.mjs','run-bun/search-worker.mjs','run-bun/refinement.mjs','run-bun/display-estimate.mjs','run-bun/accuracy.mjs','run-bun/move-effects.json','analysis/search.mjs','analysis/outlook.mjs','analysis/threat.mjs','analysis/held-items.mjs','analysis/secondary-effects.mjs','analysis/damage-distribution.mjs','analysis/turn-mechanics.mjs','run-bun/input.mjs','vendor/run-bun/mechanics/gen789.js','run-bun/reference/mappings.json','analysis/complete-moves.mjs','analysis/sampled-moves.mjs','analysis/retained-turn.mjs','run-bun/identity.mjs','run-bun/live-effects.mjs','run-bun/move-history.mjs','run-bun/move-coverage.json','vendor/showdown/source.json','vendor/showdown/dist/data/mods/runbun/moves.js','vendor/showdown/dist/data/mods/runbun/abilities.js','vendor/showdown/dist/data/mods/runbun/items.js','vendor/showdown/dist/sim/battle-actions.js'];
engineFiles.push('run-bun/npc-ai.mjs','vendor/npc-ai/predictor.mjs','vendor/npc-ai/source.json');
engineFiles.push('analysis/continuation-policy.mjs','analysis/exact-endgame.mjs');
engineFiles.push('analysis/observation-key.mjs');
engineFiles.push('analysis/mechanics-contract.mjs');
engineFiles.push('analysis/result-contract.mjs','run-bun/battle-state.mjs');
const hashes=Object.fromEntries(await Promise.all(engineFiles.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])));
const recorder=new BattleRecorder({directory:reportsDirectory,metadata:{engine_hashes:hashes,node:process.version,game:'Run & Bun 1.07',search_slices_ms:[150,250]}});
let recordedTracking='';
const chart = JSON.parse(await readFile('data/type-chart.json','utf8'));
const bundled = runBunPack;
let rules = makeRules(chart,'gen8'), pack = normalizePack(bundled,rules), player = 'garchomp', opponent = 'weavile';
let battle = {player_hp:100,opponent_hp:100};
let builds = {player:defaultBuild(pack.species.find(p=>p.id === player),rules.generation),opponent:defaultBuild(pack.species.find(p=>p.id === opponent),rules.generation)};
let field = defaultField();
let effects = {player:{},opponent:{}};
let live={};
let cachedResult=null,lastBattle='',lastObservation='',currentPhase=null,analysisStateId=0,entryHistory={};
let predictionError=null;
let predictionActors=null;
const actorsOf=snapshot=>JSON.stringify([snapshot.player,snapshot.opponent].map(side=>[side.species,side.effects?.personality??null]));
const searchService=new SearchService({parallel:process.env.POKEPULSE_SEARCH_MODE==='race'});
const searchArgs=next=>[pack.species.find(p=>p.id===next.player),pack.species.find(p=>p.id===next.opponent),rules,next.battle,next.builds,next.field,next.effects,{...next.live,opponent_model:optimizer}];
let tracking={status:'disconnected',message:'Load the mGBA integration to connect',received_at:null};
const bridgeDirectory=resolve(process.env.POKETHREAT_BRIDGE_DIR||'run-bun/live');
await mkdir(bridgeDirectory,{recursive:true});
const optimizerPath=join(bridgeDirectory,'optimizer-settings.json');
let optimizer='minimax';
try{const saved=JSON.parse(await readFile(optimizerPath,'utf8'));if(saved.opponent_model==='npc-ai')optimizer='npc-ai';}catch(error){if(error.code!=='ENOENT')console.warn('Could not read optimizer settings:',error.message);}
searchService.preload({opponentModel:optimizer}).catch(error=>console.warn('Search worker preload failed:',error.message));
let latestSnapshot=null,latestWarnings=[];
const lua=integrationScript(bridgeDirectory);
await writeFile(resolve(process.env.POKETHREAT_SCRIPT_PATH||'run-bun/PokeThreat.lua'),lua);
const listeners = new Set();
function state(compact=false) {
  const a = pack.species.find(p => p.id === player), b = pack.species.find(p => p.id === opponent);
  const result=tracking.status==='battle'?cachedResult:null;
  if(compact)return {optimizer,pack:{species:[a,b].map(p=>({id:p.id,name:p.name}))},player,opponent,live,tracking,result,recording_state_id:recorder.stateId,prediction_state_id:analysisStateId,battle_phase:currentPhase};
  return {optimizer,pack,rules,player,opponent,battle,builds,field,effects,live,tracking,catalog:catalog(rules.generation),result};
}
function broadcast(){const snapshot=state(true);const key=JSON.stringify([tracking.status,tracking.message]);if(key!==recordedTracking){recordedTracking=key;recorder.append('tracking',{tracking});}for(const stream of listeners)stream.write(`data: ${JSON.stringify(snapshot)}\n\n`);}
const maps=JSON.parse(await readFile('run-bun/reference/mappings.json','utf8'));
const c=catalog();
function resetPrediction() {
  predictionActors=null;
  predictionError=null;
  latestSnapshot=null;latestWarnings=[];
  entryHistory={};
  searchService.cancel({keepWorkers:true});
  lastBattle='';
  lastObservation='';
  cachedResult=null;
  currentPhase=null;
  analysisStateId=0;
}

function startPrediction(snapshot,signature,warnings) {
  predictionActors=actorsOf(snapshot);
  predictionError=null;
  const next=normalizeSnapshot(snapshot,pack,c,{source:'emulator'});
  const rootStateId=recorder.stateId;
  analysisStateId=rootStateId;
  const {sameContext}=searchService.start(searchArgs(next),result=>{
    cachedResult={
      ...result,
      pending:currentPhase?.kind!=='selection',
      based_on_state_id:rootStateId,
      warnings:[...result.warnings,...warnings]
    };
    recorder.recordResult(cachedResult,rootStateId);
    broadcast();
  },error=>{
    predictionError=error.message;
    cachedResult=null;
    tracking={...tracking,message:`Search failed: ${predictionError}`};
    recorder.append('search-error',{message:predictionError,stack:error.stack,based_on_state_id:rootStateId});
    broadcast();
  });
  // Preserve the last display while the retained tree advances to this root.
  cachedResult=sameContext&&cachedResult
    ? {...cachedResult,pending:true,refining:true}
    : null;
  lastBattle=signature;
  ({player,opponent,battle,builds,field,effects,live}=next);
}

function observeBattle(snapshot,warnings) {
  annotateEntryTurns(snapshot,entryHistory);
  latestSnapshot=structuredClone(snapshot);latestWarnings=[...warnings];
  const observation=JSON.stringify(snapshot);
  if(observation!==lastObservation) {
    recorder.recordState(snapshot);
    lastObservation=observation;
  }
  const {battle_phase,...decisionState}=snapshot;
  currentPhase=battle_phase;
  // A resolved old matchup cannot describe a newly entering opponent. RAM
  // can briefly combine the new identity with the fainted Pokémon's zero HP.
  if(battle_phase?.kind!=='selection'&&predictionActors!==null&&actorsOf(snapshot)!==predictionActors){
    searchService.cancel({keepWorkers:true});cachedResult=null;lastBattle='';analysisStateId=0;
    return;
  }
  const terminal=snapshot.player.current_hp===0||snapshot.opponent.current_hp===0;
  // Animation frames continue the previous decision tree, never start a turn.
  if(battle_phase?.kind!=='selection'&&!terminal) {
    if(cachedResult)cachedResult={...cachedResult,pending:true};
    return;
  }
  const signature=JSON.stringify([decisionState,battle_phase?.turn]);
  if(signature!==lastBattle)startPrediction(snapshot,signature,warnings);
}

const bridge=await startBridge(bridgeDirectory,maps,{species:new Set(pack.species.map(p=>p.id)),moves:new Set(c.moves.map(m=>m.name)),abilities:new Set(c.abilities),items:new Set(c.items)},update=>{
  try {
    if(update.status!=='battle')resetPrediction();
    else if(update.snapshot)observeBattle(update.snapshot,update.warnings||[]);
    tracking={
      status:update.status,
      message:predictionError?`Search failed: ${predictionError}`:update.message||'Connected · live battle · experimental estimate',
      received_at:update.received_at,
      warnings:update.warnings||[],
      battle_phase:currentPhase
    };
  }catch(error) {
    resetPrediction();
    tracking={status:'waiting',message:error.message,received_at:update.received_at};
  }
  broadcast();
},{acceptedRomCrc32:(process.env.POKETHREAT_ACCEPTED_ROM_CRC32||'').split(',').filter(Boolean)});
function json(res,code,obj) {res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store',...(process.env.POKETHREAT_ACCEPTED_ROM_CRC32?{'X-PokePulse-ROM':process.env.POKETHREAT_ACCEPTED_ROM_CRC32}:{})});res.end(JSON.stringify(obj));}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    if(url.pathname==='/api/optimizer'&&req.method==='GET')return json(res,200,{opponent_model:optimizer});
    if(url.pathname==='/api/optimizer'&&req.method==='POST'){
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Use the local application.'});
      if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required.'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1000)throw Error('Optimizer request too large.');}
      const model=JSON.parse(body).opponent_model;
      if(!['minimax','npc-ai'].includes(model))throw Error('Unknown opponent model.');
      await writeFile(optimizerPath,JSON.stringify({opponent_model:model})+'\n');
      if(model!==optimizer){
        optimizer=model;searchService.cancel({keepWorkers:true});cachedResult=null;lastBattle='';
        recorder.append('optimizer',{opponent_model:optimizer});
        if(latestSnapshot&&tracking.status==='battle')observeBattle(structuredClone(latestSnapshot),latestWarnings);
        broadcast();
      }
      return json(res,200,{opponent_model:optimizer});
    }
    if(url.pathname==='/api/recorder'&&req.method==='GET')return json(res,200,{...recorder.status(),reports_directory:reportsDirectory});
    if(['/api/display','/api/report'].includes(url.pathname)&&req.method==='POST'){
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`)return json(res,403,{error:'Use the local application.'});
      if(req.headers['content-type']?.split(';')[0]!=='application/json')return json(res,415,{error:'JSON required.'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>16000)throw Error('Report request too large.');}
      const payload=JSON.parse(body||'{}');
      if(url.pathname==='/api/display'){
        for(const name of ['score','target_score'])if(payload[name]!==null&&(!Number.isFinite(payload[name])||payload[name]<0||payload[name]>100))throw Error('Invalid display score.');
        if(!['wins','losses','both'].includes(payload.mode)||typeof payload.vertical!=='boolean'||typeof payload.visible!=='boolean')throw Error('Invalid display mode.');
        recorder.recordDisplay({score:payload.score,target_score:payload.target_score,mode:payload.mode,vertical:payload.vertical,visible:payload.visible,width:payload.width,height:payload.height,frame:payload.frame,client_at:payload.client_at,labels:payload.labels,state_received_at:payload.state_received_at,state_id:payload.state_id});
        return json(res,200,{recorded:true});
      }
      if(typeof(payload.note??'')!=='string'||(payload.note||'').length>2000)throw Error('Note must be at most 2000 characters.');
      return json(res,200,await recorder.save({note:payload.note||'',source:['hotkey','menu','api'].includes(payload.source)?payload.source:'api'}));
    }
    if(url.pathname==='/api/integration.lua'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="PokeThreat.lua"','Cache-Control':'no-store'});return res.end(lua);
    }
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      listeners.add(res);res.write(`data: ${JSON.stringify(state(true))}\n\n`);
      const heartbeat = setInterval(() => res.write(': heartbeat\n\n'),20000);
      req.on('close',() => {listeners.delete(res);clearInterval(heartbeat);});return;
    }
    if(url.pathname === '/api/snapshot' && req.method === 'POST') {
      if(process.env.POKETHREAT_DIAGNOSTICS!=='1')return json(res,409,{error:'Snapshot injection is available only with POKETHREAT_DIAGNOSTICS=1. Normal play uses the read-only emulator bridge.'});
      if(req.headers.origin && req.headers.origin !== `http://${req.headers.host}`)return json(res,403,{error:'Use the local application.'});
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>2500000)throw Error('Snapshot too large.');}
      const next=normalizeSnapshot(JSON.parse(body),pack,catalog(),{source:'diagnostic'});
      searchService.cancel({keepWorkers:true});
      cachedResult=scoreBattle(...searchArgs(next),optimizer==='npc-ai'?{opponentModel:'npc-ai',forceNativeForecast:true,approximateCompleteMoves:true}:{});lastBattle='';
      ({player,opponent,battle,builds,field,effects,live}=next);
      tracking={status:'battle',message:'Diagnostic snapshot · not emulator data',received_at:Date.now(),warnings:['This snapshot was submitted manually for diagnostics.']};
      cachedResult.warnings.push(...tracking.warnings);
      const diagnosticReceived=tracking.received_at;
      setTimeout(()=>{if(tracking.received_at===diagnosticReceived){tracking={status:'stale',message:'Diagnostic snapshot expired · waiting for emulator',received_at:diagnosticReceived};broadcast();}},4000).unref();
      const snapshot=state();for(const stream of listeners)stream.write(`data: ${JSON.stringify(snapshot)}\n\n`);
      return json(res,200,snapshot);
    }
    if (url.pathname === '/api/state' && req.method === 'GET') return json(res,200,state(url.searchParams.get('compact') === '1'));
    if (url.pathname === '/api/state' && req.method === 'POST') return json(res,409,{error:'Automatic tracking controls the battle. Use the separate simple app for manual matchups.'});
    if (req.method !== 'GET') return json(res,405,{error:'Method not allowed.'});
    const allowed = new Set(['/','/index.html','/style.css','/app.mjs','/engine.mjs','/snapshot.mjs']);
    if (!allowed.has(url.pathname)) return json(res,404,{error:'Not found.'});
    const file = resolve(root,url.pathname === '/' || url.pathname === '/index.html' ? 'run-bun/live.html' : url.pathname === '/app.mjs' ? 'run-bun/live-app.mjs' : url.pathname === '/snapshot.mjs' ? 'run-bun/snapshot.mjs' : url.pathname.slice(1));
    if (!file.startsWith(root + sep)) throw Error('Invalid path.');
    const contents = await readFile(file);
    res.writeHead(200,{'Content-Type':({'.html':'text/html','.css':'text/css','.mjs':'text/javascript'})[extname(file)],'Cache-Control':'no-store'});res.end(contents);
  } catch (error) {json(res,400,{error:error.message});}
});
const port = Number(process.env.PORT || 3001);
server.listen(port,'127.0.0.1',() => console.log(`PokéThreat Run & Bun: http://127.0.0.1:${port}\nOBS: http://127.0.0.1:${port}/?overlay=1`));
server.on('error',error => {console.error(error.message);process.exitCode = 1;});
server.on('close',()=>{searchService.cancel();bridge.close();});




