import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {fileURLToPath} from 'node:url';

const workspace=fileURLToPath(new URL('../',import.meta.url));
const packaged=process.argv.includes('--package');
const root=packaged?join(workspace,'dist','Run-and-Bun-Automatic'):workspace;
const bridge=await mkdtemp(join(tmpdir(),'pokepulse-test-ground-'));
const port=await new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const n=s.address().port;s.close(()=>resolve(n));});});
const runtime=packaged?join(root,'node.exe'):process.execPath;
const child=spawn(runtime,[join(root,'run-bun/server.mjs')],{cwd:root,stdio:['ignore','ignore','pipe'],env:{...process.env,PORT:String(port),POKETHREAT_DIAGNOSTICS:'1',POKETHREAT_BRIDGE_DIR:bridge,POKETHREAT_SCRIPT_PATH:join(bridge,'integration.lua')}});
let stderr='';child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
const base=`http://127.0.0.1:${port}`;
async function waitForServer(){for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error(`Test server exited: ${stderr}`);try{const r=await fetch(`${base}/api/state`);if(r.ok)return await r.json();}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(`Test server did not start: ${stderr}`);}
const post=async(snapshot)=>fetch(`${base}/api/snapshot`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(snapshot)});
try{
 const initial=await waitForServer();
 const snapshot={schema_version:1,game:'run-bun',player:{species:initial.player,hp_percent:100,build:{...structuredClone(initial.builds.player),moves:['Tackle'],level:5,ability:''},effects:{}},opponent:{species:initial.player,hp_percent:100,build:{...structuredClone(initial.builds.player),moves:['Tackle'],level:5,ability:''},effects:{}},field:initial.field};
 const baseline=await post(snapshot);assert.equal(baseline.status,200);const baseState=await baseline.json();
 assert.equal(baseState.result.outlook.algorithm,'bounded-stochastic-game-search');assert.equal(baseState.result.outlook.unresolved,0);assert.equal(baseState.result.victory,50);
 const lowered=structuredClone(snapshot);lowered.player.build.boosts.accuracy=-1;
 const acc=await post(lowered);assert.equal(acc.status,200);const accState=await acc.json();assert.equal(accState.result.outgoing_moves[0].effective_accuracy,75);assert.ok(accState.result.victory<baseState.result.victory);
 const par=structuredClone(snapshot);par.player.build.status='par';const para=await post(par);assert.equal(para.status,200);assert.equal((await para.json()).result.outgoing_moves[0].action_chance,0.75);
 const confused=structuredClone(snapshot);confused.player.effects={confusion_turns:3};const conf=await post(confused);assert.equal(conf.status,200);assert.equal((await conf.json()).result.outgoing_moves[0].action_chance,2/3);
 const asleep=structuredClone(snapshot);asleep.opponent.build.status='slp';asleep.opponent.effects={sleep_counter:1};const sleep=await post(asleep);assert.equal(sleep.status,200);const sleepState=await sleep.json();
 const struck=structuredClone(snapshot);struck.opponent.hp_percent=80;const hit=await post(struck);assert.equal(hit.status,200);const hitState=await hit.json();assert.ok(hitState.result.victory>sleepState.result.victory,'a landed hit as sleep ends should improve the active-matchup outlook');
 const invalid=structuredClone(snapshot);invalid.player.effects={confusion_turns:8};assert.equal((await post(invalid)).status,400);assert.equal((await(await fetch(`${base}/api/state`)).json()).result.victory,hitState.result.victory);
 const stall=structuredClone(snapshot);stall.player.build.moves=['Splash'];stall.opponent.build.moves=['Splash'];
 const unfinished=await post(stall);assert.equal(unfinished.status,200);const unfinishedState=await unfinished.json();
 assert.equal(unfinishedState.result.victory,null);assert.equal(unfinishedState.result.outlook.unresolved,1);
 assert.equal(unfinishedState.result.outlook.lower_bound,0);assert.equal(unfinishedState.result.outlook.upper_bound,100);
 const page=await(await fetch(base)).text();assert.ok(page.includes('POKÉPULSE'));assert.ok((await fetch(`${base}/?overlay=1`)).ok);
 console.log('Diagnostic API passed knockout outlook, unresolved bounds, sleep-wakeup hit, accuracy, paralysis, confusion, invalid-snapshot, control-page and overlay checks.');
}finally{child.kill();await new Promise(resolve=>child.once('exit',resolve));await rm(bridge,{recursive:true,force:true});}
