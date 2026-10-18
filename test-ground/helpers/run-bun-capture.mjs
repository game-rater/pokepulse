// Synthetic protocol fixture: kept outside test/ to avoid Node counting a helper as a test.
import {readFileSync} from 'node:fs';
import {ROM_CRC32} from '../../run-bun/memory.mjs';
export const maps=JSON.parse(readFileSync(new URL('../../run-bun/reference/mappings.json',import.meta.url),'utf8'));
export const lookup={species:new Set(['wooper','rattata']),moves:new Set(['Earthquake','Hyper Fang']),abilities:new Set(),items:new Set()};
export function capture(sequence=1){
 const ram=Buffer.alloc(0x48000);ram[0x426f9]=2;ram[0x233e4]=2;ram[0x233ef]=1;
 ram.writeUInt32LE(0x0803be39,0x45d04);
 for(const [i,species,move,hp] of [[0,194,89,58],[1,19,158,48]]){
  const p=0x233fc+92*i;ram.writeUInt16LE(species,p);for(let stat=0;stat<5;stat++)ram.writeUInt16LE(30,p+2+stat*2);
  ram.writeUInt16LE(move,p+12);ram.fill(6,p+25,p+32);ram[p+37]=10;ram.writeUInt16LE(hp,p+42);ram[p+44]=20;ram.writeUInt16LE(hp,p+46);
 }
 const serial=Buffer.alloc(4);serial.writeUInt32LE(sequence);
 return Buffer.concat([Buffer.from('PTHREAT1'),Buffer.from(ROM_CRC32,'hex'),serial,ram,serial]);
}
export const message=(id=1)=>({id,code:217,move:158,attacker:1,target:0,turn:0,player_index:0,hp:[21,48],species:[194,19]});
