import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import {setTimeout as pause} from 'node:timers/promises';

test('Optimizer API validates and persists the menu selection',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-optimizer-'));
 const reserve=net.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
 const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 let child,output='';
 const url=`http://127.0.0.1:${port}`;
 async function start(){
  child=spawn(process.execPath,['run-bun/server.mjs'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),POKETHREAT_BRIDGE_DIR:directory,POKETHREAT_REPORT_DIR:join(directory,'reports'),POKETHREAT_SCRIPT_PATH:join(directory,'integration.lua')},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  for(let i=0;i<160;i++){try{const r=await fetch(url+'/api/optimizer');if(r.ok)return;}catch{}await pause(50);}
  throw Error('Server did not start: '+output);
 }
 async function stop(){const previous=child;if(previous?.exitCode===null){const done=new Promise(resolve=>previous.once('exit',resolve));previous.kill();await done;}child=null;}
 const post=body=>fetch(url+'/api/optimizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 try{
  await start();assert.deepEqual(await (await fetch(url+'/api/optimizer')).json(),{opponent_model:'minimax'});
  const invalid=await post({opponent_model:'garbage'});assert.equal(invalid.status,400);
  const wrongOrigin=await fetch(url+'/api/optimizer',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({opponent_model:'npc-ai'})});assert.equal(wrongOrigin.status,403);
  assert.equal((await post({opponent_model:'npc-ai'})).status,200);
  assert.equal((await (await fetch(url+'/api/state?compact=1')).json()).optimizer,'npc-ai');
  assert.equal(JSON.parse(await readFile(join(directory,'optimizer-settings.json'),'utf8')).opponent_model,'npc-ai');
  await stop();await start();assert.equal((await (await fetch(url+'/api/optimizer')).json()).opponent_model,'npc-ai');
  await post({opponent_model:'minimax'});assert.equal((await (await fetch(url+'/api/state?compact=1')).json()).optimizer,'minimax');
 }finally{await stop();await rm(directory,{recursive:true,force:true});}
});
