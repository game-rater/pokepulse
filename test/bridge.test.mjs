import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startBridge} from '../run-bun/bridge.mjs';
import {ROM_CRC32} from '../run-bun/memory.mjs';
import {capture,maps,lookup,message} from '../test-ground/helpers/run-bun-capture.mjs';
test('Bridge rejects old/partial files, expires fresh data, and recovers without restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'pokethreat-bridge-'));let clock=Date.now(),updates=[];
 const seq=Buffer.alloc(4);seq.writeUInt32LE(1);
 const packet=Buffer.concat([Buffer.from('PTHREAT1'),Buffer.from(ROM_CRC32,'hex'),seq,Buffer.alloc(0x48000),seq]);
 const file=join(dir,'capture-0.bin');await writeFile(file,packet);await utimes(file,new Date(clock-1000),new Date(clock-1000));
 const bridge=await startBridge(dir,{}, {},s=>updates.push(s),{now:()=>clock,interval:60000,staleAfter:4000});
 const write=async data=>{clock+=100;await writeFile(file,data);await utimes(file,new Date(clock),new Date(clock));};
 try{
  await bridge.poll();assert.equal(updates.length,0);
  await write(packet.subarray(0,500));await bridge.poll();assert.equal(updates.length,0);
  await write(packet);await bridge.poll();assert.equal(updates.at(-1).status,'outside-battle');
  clock+=4001;await bridge.poll();assert.equal(updates.at(-1).status,'stale');
  await write(packet);await bridge.poll();assert.equal(updates.at(-1).status,'outside-battle');
  const other=Buffer.from(packet);other[8]^=1;await write(other);await bridge.poll();assert.equal(updates.at(-1).status,'unsupported');
 }finally{bridge.close();await rm(dir,{recursive:true,force:true});}
});

async function journalBridge(run){
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-journal-'));let clock=Date.now();const updates=[];
 const bridge=await startBridge(directory,maps,lookup,u=>updates.push(u),{now:()=>clock,interval:60000});
 const write=async(sequence,journal)=>{
  clock+=100;
  if(journal!==undefined)await writeFile(join(directory,`events-${sequence%2}.json`),typeof journal==='string'?journal:JSON.stringify({version:1,sequence,session:'test',events:[],...journal}));
  const file=join(directory,`capture-${sequence%2}.bin`);await writeFile(file,capture(sequence));await utimes(file,new Date(clock),new Date(clock));
  await bridge.poll();assert.equal(updates.at(-1).status,'battle');return updates.at(-1);
 };
 try{await run(write,updates,bridge);}finally{bridge.close();await rm(directory,{recursive:true,force:true});}
}

test('A real capture and matching sidecar deliver native outcomes exactly once across polls',async()=>{
 await journalBridge(async(write,updates,bridge)=>{
  const first=await write(1,{events:[message()]});assert.equal(first.snapshot.player.species,'wooper');assert.equal(first.battle_messages[0].kind,'critical-hit');
  await bridge.poll();assert.equal(updates.length,1,'unchanged files do not publish another update');
  assert.deepEqual((await write(2,{events:[message()]})).battle_messages,[]);
  const next=await write(3,{events:[message(),message(2)]});assert.deepEqual(next.battle_messages.map(e=>e.event_id),[2]);
 });
});

test('Partial or mismatched journals cannot advance the cursor; a subsequent valid journal recovers',async()=>{
 await journalBridge(async write=>{
  await write(1,{events:[message()]});
  assert.deepEqual((await write(2,'{"version":1')).battle_messages,[]);
  assert.deepEqual((await write(3,{sequence:2,events:[message(2)]})).battle_messages,[]);
  assert.deepEqual((await write(4,{events:[message(),message(2)]})).battle_messages.map(e=>e.event_id),[2]);
 });
});

test('Reloading the integration starts a fresh journal session instead of suppressing reused event IDs',async()=>{
 await journalBridge(async write=>{
  await write(10,{events:[message()]});
  const restarted=await write(1,{session:'reloaded',events:[message()]});assert.deepEqual(restarted.battle_messages.map(e=>e.event_id),[1]);
 });
});
