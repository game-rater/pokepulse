import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import net from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';
import {capture} from '../test-ground/helpers/run-bun-capture.mjs';

test('Status API follows real synthetic bridge updates, prediction timestamps, staleness and recovery',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-reader-status-'));
 const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));
 const port=reserve.address().port;await new Promise(r=>reserve.close(r));
 const child=spawn(process.execPath,['run-bun/server.mjs'],{cwd:process.cwd(),windowsHide:true,stdio:['ignore','pipe','pipe'],
  env:{...process.env,PORT:String(port),POKETHREAT_BRIDGE_DIR:directory,POKETHREAT_REPORT_DIR:join(directory,'reports'),POKETHREAT_SCRIPT_PATH:join(directory,'integration.lua')}});
 let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 const read=async()=>{const r=await fetch(`http://127.0.0.1:${port}/api/state?compact=1`);assert.equal(r.status,200);return r.json();};
 async function until(predicate,ms=15000){
  const deadline=Date.now()+ms;while(Date.now()<deadline){
   if(child.exitCode!==null)throw Error('Isolated reader exited: '+output);
   try{const state=await read();if(predicate(state))return state;}catch(e){if(e.code!=='ECONNREFUSED'&&!String(e).includes('fetch failed'))throw e;}
   await pause(80);
  }throw Error('Isolated status did not reach expected state: '+output);
 }
 try{
  const initial=await until(s=>s.reader_status?.kind==='disconnected');assert.equal(initial.result,null);assert.equal(initial.reader_status.last_game_at,null);
  let sequence=1;
  const write=async()=>{const n=sequence++;await writeFile(join(directory,`capture-${n%2}.bin`),capture(n));};
  await write();
  const battle=await until(s=>s.tracking.status==='battle');
  assert.equal(battle.reader_status.connection,'connected');assert.ok(battle.reader_status.prediction_started_at>0);
  let prediction=null;
  for(let i=0;i<100;i++){
   if(i%3===0)await write();
   const s=await read();
   if(s.reader_status.last_prediction_at!==null){prediction=s;break;}
   await pause(80);
  }
  assert.ok(prediction,'Synthetic battle should publish a prediction timestamp');
  assert.ok(prediction.reader_status.last_prediction_at>=prediction.reader_status.prediction_started_at);
  const stale=await until(s=>s.tracking.status==='stale'&&s.reader_status.kind==='stale',10000);
  assert.equal(stale.reader_status.connection,'stale');assert.ok(stale.reader_status.last_game_at>0);assert.equal(stale.result,null);
  assert.ok(stale.reader_status.last_prediction_at>=prediction.reader_status.last_prediction_at);
  await write();const recovered=await until(s=>s.tracking.status==='battle'&&s.reader_status.connection==='connected');
  assert.ok(recovered.reader_status.last_game_at>stale.reader_status.last_game_at);
 }finally{
  if(child.exitCode===null){const stopped=new Promise(r=>child.once('exit',r));child.kill();await stopped;}
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep));await rm(directory,{recursive:true,force:true});
 }
});
