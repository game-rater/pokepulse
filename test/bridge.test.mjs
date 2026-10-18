import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startBridge} from '../run-bun/bridge.mjs';
import {ROM_CRC32} from '../run-bun/memory.mjs';
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
