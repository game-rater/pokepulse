import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readBattleIdentity,identityLayout} from '../run-bun/identity.mjs';
import {annotateEntryTurns} from '../run-bun/move-history.mjs';
import {createCompleteBattle,completeMoveAdapter} from '../analysis/complete-moves.mjs';
const maps=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url)));
test('Nature and friendship require a matching identity and decrypted checksum',()=>{
  const ram=Buffer.alloc(0x48000),battler=0x100,base=identityLayout.playerParty,pid=24,ot=1234,words=Array(12).fill(0);
  ram.writeUInt32LE(pid,battler+identityLayout.personality);ram.writeUInt32LE(ot,battler+identityLayout.otId);
  ram.writeUInt32LE(pid,base);ram.writeUInt32LE(ot,base+4);
  words[0]=1;words[2]=(26<<16)|(222<<8);
  const checksum=words.reduce((sum,w)=>sum+(w&65535)+(w>>>16),0)&65535;ram.writeUInt16LE(checksum,base+28);
  words.forEach((w,i)=>ram.writeUInt32LE((w^pid^ot)>>>0,base+32+i*4));
  assert.deepEqual(readBattleIdentity(ram,battler,maps),{personality:pid,nature:maps.nature[24],friendship:222});
  ram[base+32]^=1;assert.equal(readBattleIdentity(ram,battler,maps),null);
});
test('Hidden nature overrides personality nature as specified by Run & Bun data',()=>{
  const ram=Buffer.alloc(0x48000),base=identityLayout.playerParty,battler=0x100,words=Array(12).fill(0);words[0]=1;words[2]=3<<16;
  ram.writeUInt16LE(4,base+28);words.forEach((w,i)=>ram.writeUInt32LE(w,base+32+i*4));
  assert.equal(readBattleIdentity(ram,battler,maps).nature,maps.nature[3]);
});
test('Observed entry turns do not guess the history of a mid-battle attachment',()=>{
  const side=pid=>({species:'Tyrogue',build:{level:5,ivs:{}},effects:{personality:pid}}),history={};
  const snapshot={player:side(1),opponent:side(2),battle_phase:{kind:'selection',turn:10}};
  annotateEntryTurns(snapshot,history);assert.equal(snapshot.player.effects.first_turn,undefined);
  snapshot.battle_phase.turn=11;annotateEntryTurns(snapshot,history);assert.equal(snapshot.player.effects.first_turn,false);
  snapshot.player=side(3);annotateEntryTurns(snapshot,history);assert.equal(snapshot.player.effects.first_turn,true);
});
test('A live first-turn move with missing entry history stays unknown instead of being granted again',()=>{
  const side=(move,live)=>({species:'Mew',current_hp:100,actual_stats:{hp:100,atk:20,def:20,spa:20,spd:20,spe:live?60:20},build:{level:20,moves:[move],nature:'Serious',boosts:{},ability:'',item:''},effects:live?{live_data:true}:{}});
  const state=createCompleteBattle({player:side('Fake Out',true),opponent:side('Splash',false),field:{}}),reasons=new Set(),adapter=completeMoveAdapter(reasons);
  const chance=adapter.transitions(state,1,1)[0].state,result=adapter.transitions(chance,0,0);
  assert.equal(result[0].state,null);assert.ok([...reasons].some(r=>r.includes('First-turn')));
});
