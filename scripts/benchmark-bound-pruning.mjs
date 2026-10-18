import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {searchBattle,searchFrontier} from '../analysis/search.mjs';
import {createCompleteBattle,simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {searchFixtures} from './search-benchmark-fixtures.mjs';
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
function abstractCase(kind,enabled){
 let callbacks=0;
 const adapter={key:s=>s.id,terminal:s=>s.value??null,
  actions:s=>s.id==='root'?[kind==='frontier'?[0,1,2]:[0,1],[0,1]]:[[0],[0]],
  transitions:(s,a,b)=>{
   callbacks++;
   if(s.id!=='root'){const n=s.n||0;return [{probability:1,state:n===63?{id:s.id+'end',value:1}:{id:s.id[0]+(n+1),n:n+1}}];}
   if(a===0)return [{probability:1,state:{id:'a'+b,value:kind==='frontier'&&b?1:0.8}}];
   if(a===1)return b?[{probability:kind==='frontier'?0.05:0.9,state:{id:'zero',value:0}},{probability:kind==='frontier'?0.95:0.1,state:{id:'B0',n:0}}]:[{probability:1,state:{id:'b0',value:0.2}}];
   return [{probability:1,state:b?{id:'C0',n:0}:{id:'c0',value:0.9}}];
  }};
 const options={boundPruning:enabled,timeMs:1000,maxDepth:128,workEstimate:s=>s.id[0]==='C'?100:1};
 const r=(kind==='frontier'?searchFrontier:searchBattle)(adapter,{id:'root'},options);
 return {callbacks,nodes:r.nodes,lower:r.lower,upper:r.upper,pruned_actions:r.pruned_actions,pruned_chance_branches:r.pruned_chance_branches};
}
if(process.argv.includes('--native-worker')){
 const enabled=arg('pruning')==='on',seconds=Number(arg('seconds')||2);
 const snapshot=searchFixtures.find(f=>f.id==='herdier-wingull').snapshot;
 createCompleteBattle(snapshot);
 const session={},start=performance.now();let first=null,r,maxSlice=0;
 do{
  const before=performance.now();r=simulateCompleteMoves(snapshot,{session,approximateCompleteMoves:true,boundPruning:enabled,timeMs:100});
  maxSlice=Math.max(maxSlice,performance.now()-before);
  if(first===null&&r.provisional_usable)first=performance.now()-start;
 }while(!r.sampling_complete&&performance.now()-start<seconds*1000);
 console.log(JSON.stringify({enabled,first_estimate_ms:first,elapsed_ms:performance.now()-start,score:r.score,samples:r.samples,
  total_rollouts:r.total_native_rollouts,next_turn_expansions:r.next_turn_expansions,retained_states:r.retained_states,max_slice_ms:maxSlice}));
}else{
 const root=fileURLToPath(new URL('../',import.meta.url)),seconds=Number(arg('seconds')||2),trials=Number(arg('trials')||3);
 if(!(seconds>0&&seconds<=120&&Number.isInteger(trials)&&trials>0&&trials<=20))throw Error('Invalid seconds/trials');
 const abstract=[];
 for(const kind of ['recursive','frontier'])for(const enabled of [false,true]){
  for(let i=0;i<10;i++)abstractCase(kind,enabled);
  const start=performance.now();let last;for(let i=0;i<200;i++)last=abstractCase(kind,enabled);
  abstract.push({kind,enabled,mean_ms:(performance.now()-start)/200,...last});
 }
 const native=[];
 for(let trial=0;trial<trials;trial++)for(const enabled of trial%2?[true,false]:[false,true]){
  const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--native-worker',`--pruning=${enabled?'on':'off'}`,`--seconds=${seconds}`],{cwd:root,encoding:'utf8',timeout:seconds*1000+30000});
  if(result.status!==0)throw Error(result.stderr||result.error||result.stdout);
  const row={trial,...JSON.parse(result.stdout)};native.push(row);
  console.log(`native pruning ${enabled?'on':'off'}: first ${row.first_estimate_ms?.toFixed(0)??'none'} ms; root samples ${row.samples}; total ${row.total_rollouts}`);
 }
 const source_hashes=Object.fromEntries(['analysis/search.mjs','analysis/position-features.mjs','analysis/continuation-policy.mjs','analysis/position-evaluator.mjs','analysis/native-battle.mjs','analysis/native-search.mjs','analysis/sampled-search.mjs','analysis/sampled-moves.mjs','analysis/retained-turn.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
 const destination=resolve(root,arg('out')||`.local-tools/search-benchmarks/pruning-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
 mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify({created_at:new Date().toISOString(),source_hashes,seconds,trials,
  method:'Abstract games compare equal solved values and actual transition callbacks. Native pruning on/off uses isolated processes, alternating order and equal wall budgets; native startup initialization is excluded. Scores remain estimates.',abstract,native},null,2));
 console.log(JSON.stringify(abstract));console.log(`Saved ${destination}`);
}
