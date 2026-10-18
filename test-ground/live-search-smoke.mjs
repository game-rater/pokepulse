// Synthetic captures only: exercise bridge -> engine phases -> persistent search -> API.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
import {layout,phaseLayout,ROM_CRC32} from '../run-bun/memory.mjs';
import {decodeMemory} from '../run-bun/memory.mjs';
import {pack,catalog} from '../run-bun/profile.mjs';
const workspace=fileURLToPath(new URL('../',import.meta.url));
const root=process.argv.includes('--package')?join(workspace,'dist','Run-and-Bun-Automatic'):workspace;
const maps=JSON.parse(await readFile(join(root,'run-bun/reference/mappings.json'),'utf8'));
const bridge=await mkdtemp(join(tmpdir(),'pokepulse-live-search-'));
const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
const child=spawn(process.execPath,[join(root,'run-bun/server.mjs')],{cwd:root,stdio:['ignore','ignore','pipe'],env:{...process.env,PORT:String(port),POKETHREAT_REPORT_DIR:join(bridge,'reports'),POKETHREAT_BRIDGE_DIR:bridge,POKETHREAT_SCRIPT_PATH:join(bridge,'integration.lua')}});
let stderr='';child.stderr.on('data',s=>stderr+=s);
const state=async()=>{const response=await fetch(`http://127.0.0.1:${port}/api/state?compact=1`,{signal:AbortSignal.timeout(2000)});return response.json();};
async function until(predicate){
 const deadline=Date.now()+15000;let last;
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw Error(stderr);
  try{const s=await state();last=s;if(predicate(s))return s;}catch(error){if(error.name==='AssertionError')throw error;}
  await new Promise(r=>setTimeout(r,40));
 }
 throw Error(`Live search timed out: ${stderr} ${JSON.stringify(last?.tracking)} ${JSON.stringify(last?.result?.outlook)}`);
}
const ram=Buffer.alloc(0x48000);ram[layout.inBattle]=2;ram[layout.battlersCount]=2;ram[layout.positions+1]=1;
ram.writeUInt32LE(phaseLayout.selection,phaseLayout.callback);ram[phaseLayout.action]=2;
for(let index=0;index<2;index++){
 const p=layout.battleMons+index*layout.battlerSize;
 ram.writeUInt16LE(maps.mons.indexOf('Garchomp')+1,p);
 [index?5:25,10,index?5:10,10,10].forEach((n,i)=>ram.writeUInt16LE(n,p+2+2*i));
 ram.writeUInt16LE(maps.move.indexOf('Tackle'),p+12);ram.fill(6,p+24,p+32);ram[p+37]=10;
 ram.writeUInt16LE(Number(Object.entries(maps.abilityIds).find(([,name])=>name==='Run Away')[0]),p+32);
 ram.writeUInt16LE(index?16:30,p+42);ram[p+44]=5;ram.writeUInt16LE(index?16:30,p+46);
}
let sequence=0;
let keepAlive;
async function capture(){
 const seq=Buffer.alloc(4);seq.writeUInt32LE(++sequence);
 await writeFile(join(bridge,`capture-${sequence%2}.bin`),Buffer.concat([Buffer.from('PTHREAT1'),Buffer.from(ROM_CRC32,'hex'),seq,ram,seq]));
}
try{
 const c=catalog();
 const decoded=decodeMemory(ram,maps,{species:new Set(pack.species.map(s=>s.id)),moves:new Set(c.moves.map(s=>s.name)),abilities:new Set(c.abilities),items:new Set(c.items)});
 assert.equal(decoded.status,'battle');
 await until(s=>s.tracking.status==='disconnected');await capture();
 keepAlive=setInterval(()=>{capture().catch(()=>{});},500);
 const initial=await until(s=>s.result?.outlook.complete);
 assert.equal(initial.result.victory,100);
 const p=layout.battleMons,q=p+layout.battlerSize;
 ram.writeUInt32LE(phaseLayout.actions,phaseLayout.callback);ram[phaseLayout.action]=0;
 ram[p+37]--;await capture();
 const pending=await until(s=>s.result?.pending&&s.battle_phase?.kind==='resolving');
 assert.equal(pending.result.display_score,100);
 ram[q+37]--;ram.writeUInt16LE(30-initial.result.incoming_moves[0].min,p+42);
 ram.writeUInt16LE(16-initial.result.outgoing_moves[0].min,q+42);await capture();
 const intermediate=await until(s=>s.battle_phase?.kind==='resolving');
 assert.equal(intermediate.result.based_on_state_id,initial.result.based_on_state_id,'animation snapshots must not start another turn');
 assert.equal(intermediate.result.pending,true);
 ram.writeUInt32LE(phaseLayout.selection,phaseLayout.callback);ram[phaseLayout.turn]++;ram[phaseLayout.action]=2;await capture();
 const next=await until(s=>s.result&&!s.result.pending&&s.live.opponent.pp.Tackle===9);
 assert.equal(next.result.victory,100);assert.equal(next.result.display_score,100);
 assert.equal(next.result.outlook.root_reused,true);assert.equal(next.result.outlook.nodes,0);
 const post=async(path,body,headers={})=>fetch(`http://127.0.0.1:${port}/api/${path}`,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('display',{score:101,mode:'wins'})).status,400);
 assert.equal((await post('report',{}, {Origin:'http://untrusted.example'})).status,403);
 assert.equal((await post('display',{score:100,target_score:100,mode:'losses',vertical:false,visible:true,state_id:next.recording_state_id,labels:['0.0']})).status,200);
 const response=await post('report',{note:'Synthetic recorder regression',source:'api'});assert.equal(response.status,200);
 const saved=await response.json(),report=JSON.parse(await readFile(saved.report_path,'utf8'));
 for(const kind of ['battle-state','estimate','display'])assert.ok(report.events.some(e=>e.kind===kind),`Missing ${kind}`);
 assert.ok(report.events.some(e=>e.kind==='display'&&e.state_id===next.recording_state_id));
 await new Promise((resolve,reject)=>{const replay=spawn(process.execPath,[join(workspace,'scripts/replay-bug-report.mjs'),saved.report_path,'--time-ms','200'],{stdio:['ignore','ignore','pipe']});let error='';replay.stderr.on('data',s=>error+=s);replay.on('exit',code=>code===0?resolve():reject(Error(error)));});
 assert.ok(JSON.parse(await readFile(join(saved.directory,'replay.json'),'utf8')));
 ram.writeUInt16LE(0,p+42);await capture();
 const lost=await until(s=>s.result&&!s.result.pending&&s.result.victory===0);
 assert.equal(lost.result.display_score,0);
 ram[layout.inBattle]=0;await capture();
 const outside=await until(s=>s.tracking.status==='outside-battle');assert.equal(outside.result,null);
 console.log('PASS: live bridge holds the display through animation snapshots, reroots with zero expansion, reports genuine losses, and clears outside battle.');
}finally{
 clearInterval(keepAlive);
 const exited=new Promise(resolve=>child.exitCode!==null?resolve():child.once('exit',resolve));
 child.kill();await exited;
 await rm(bridge,{recursive:true,force:true});
}
