import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeMemory,decodeCapture,layout,ROM_CRC32} from '../run-bun/memory.mjs';
import {pack,catalog,scoreBattle} from '../run-bun/profile.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {makeRules} from '../engine.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape} from '../analysis/complete-moves.mjs';
const maps=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url)));
const c=catalog(), lookup={species:new Set(pack.species.map(p=>p.id)),moves:new Set(c.moves.map(m=>m.name)),abilities:new Set(c.abilities),items:new Set(c.items)};
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function memory(){
 const ram=Buffer.alloc(0x48000);ram[layout.inBattle]=2;ram[layout.battlersCount]=2;ram[layout.positions]=0;ram[layout.positions+1]=1;
 for(const [index,species,level,hp,stats,moves,ability] of [[0,387,10,31,[21,19,12,15,20],[44,45,71,590],75],[1,829,2,13,[6,7,5,6,7],[633,47,0,0],238]]){
  const p=layout.battleMons+index*layout.battlerSize;ram.writeUInt16LE(species,p);stats.forEach((s,i)=>ram.writeUInt16LE(s,p+2+i*2));moves.forEach((m,i)=>ram.writeUInt16LE(m,p+12+i*2));ram.fill(6,p+24,p+32);ram.writeUInt16LE(ability,p+32);ram[p+34]=12;ram[p+35]=12;[25,10,25,10].forEach((pp,i)=>ram[p+37+i]=pp);ram.writeUInt16LE(hp,p+42);ram[p+44]=level;ram.writeUInt16LE(hp,p+46);
 }
 // Map Leafage from the creator's script instead of assuming its numeric ID.
 ram.writeUInt16LE(maps.move.indexOf('Leafage'),layout.battleMons+layout.battlerSize+12);
 return ram;
}
const decode=ram=>decodeMemory(ram,maps,lookup);
const score=ram=>{const s=normalizeSnapshot(decode(ram).snapshot,pack,c);return scoreBattle(pack.species.find(p=>p.id===s.player),pack.species.find(p=>p.id===s.opponent),rules,s.battle,s.builds,s.field,s.effects,s.live);};

test('Zero ability ID normalizes to no ability rather than the mapping placeholder',()=>{
 const ram=memory();ram.writeUInt16LE(0,layout.battleMons+layout.battlerSize+32);
 const snapshot=decode(ram).snapshot;
 assert.equal(snapshot.opponent.build.ability,'');
 assert.doesNotThrow(()=>normalizeSnapshot(snapshot,pack,c));
});
test('Run & Bun capture decodes observed active battlers, HP, actual stats, ability and PP',()=>{
 const s=decode(memory()).snapshot;assert.equal(s.player.species,'turtwig');assert.equal(s.opponent.species,'gossifleur');assert.equal(s.player.current_hp,31);assert.equal(s.opponent.current_hp,13);assert.equal(s.player.build.ability,'Shell Armor');assert.equal(s.opponent.build.ability,'Cotton Down');assert.deepEqual(s.player.build.moves,['Bite','Growl','Absorb','Confide']);assert.equal(s.player.pp.Bite,25);
 const result=score(memory());assert.equal(result.stats.player.hp,31);assert.equal(result.stats.player.def,19);assert.equal(result.outgoing_moves[0].min,19);assert.equal(result.outgoing_moves[0].max,23);
});
test('Outside battle ignores persistent old battlers; doubles never produce a single battle score',()=>{
 const r=memory();r[layout.inBattle]=0;assert.equal(decode(r).status,'outside-battle');r[layout.inBattle]=2;r[layout.battlersCount]=4;assert.equal(decode(r).status,'unsupported');r[layout.battlersCount]=0;assert.equal(decode(r).status,'waiting');
});
test('HP changes, stat stages, PP exhaustion and fainting change damage/outlook',()=>{
 const r=memory(),p=layout.battleMons;const before=score(r);r[p+25]=5;assert.ok(score(r).outgoing_moves[0].max<before.outgoing_moves[0].max);r[p+37]=0;assert.equal(score(r).outgoing_moves[0].reason,'No PP');r.writeUInt16LE(0,p+42);assert.equal(score(r).victory,0);r.writeUInt16LE(0,p+layout.battlerSize+42);assert.equal(score(r).victory,0); // A mutual knockout is not a trainer-battle win.
});
test('Live accuracy and evasion stages are read from battler memory and affect hit chance',()=>{
 const r=memory(),p=layout.battleMons,q=p+layout.battlerSize;
 r[p+30]=5;r[q+31]=7;
 const s=decode(r).snapshot;assert.equal(s.player.build.boosts.accuracy,-1);assert.equal(s.opponent.build.boosts.evasion,1);
 const move=score(r).outgoing_moves[0];assert.equal(move.effective_accuracy,60);assert.equal(move.hit_chance,0.6);
 r[p+30]=0;r[q+31]=6;assert.equal(score(r).outgoing_moves[0].effective_accuracy,33);
 r[p+30]=6;r[q+31]=6;assert.equal(score(r).outgoing_moves[0].effective_accuracy,100);
});
test('Battler positions choose the player independently of array order',()=>{
 const r=memory();r[layout.positions]=1;r[layout.positions+1]=0;assert.equal(decode(r).snapshot.player.species,'gossifleur');
});
test('Invalid or half-written packets and unsupported ROMs fail closed',()=>{
 const ram=memory(),seq=Buffer.alloc(4);seq.writeUInt32LE(42);const b=Buffer.concat([Buffer.from('PTHREAT1'),Buffer.from(ROM_CRC32,'hex'),seq,ram,seq]);assert.equal(decodeCapture(b,maps,lookup).status,'battle');assert.throws(()=>decodeCapture(b.subarray(0,-1),maps,lookup),/Incomplete/);b[8]^=1;assert.equal(decodeCapture(b,maps,lookup).status,'unsupported');b[8]^=1;b[b.length-1]^=1;assert.throws(()=>decodeCapture(b,maps,lookup),/Incomplete/);
});
test('Exact stats and exact HP validation prevents impossible calculator overrides',()=>{
 const s=decode(memory()).snapshot;s.player.actual_stats.hp=0;assert.throws(()=>normalizeSnapshot(s,pack,c),/actual stats/);s.player.actual_stats.hp=31;s.player.current_hp=10;assert.throws(()=>normalizeSnapshot(s,pack,c),/disagrees/);
});
test('Verified field flags affect damage and the modeled turn-order report; unknown weather fails closed',()=>{
 const r=memory(),base=score(r);
 r.writeUInt32LE(1,layout.sideStatuses+4);
 assert.equal(decode(r).snapshot.field.opponent.reflect,true);
 assert.ok(score(r).outgoing_moves[0].max<base.outgoing_moves[0].max);
 // Equal-priority attacks isolate Trick Room's speed ordering from priority.
 r.writeUInt16LE(maps.move.indexOf('Tackle'),layout.battleMons+layout.battlerSize+12);
 const normalOrder=score(r);
 r.writeUInt32LE(2,layout.fieldStatuses);
 assert.equal(decode(r).snapshot.field.trick_room,true);
 assert.equal(score(r).outlook.algorithm,'bounded-stochastic-game-search');
 assert.match(score(r).model,/bounded stochastic game search/);
 for(const [flag,name] of [[1,'Rain'],[0x40,'Sun'],[0x10,'Sand'],[0x200,'Hail']]){r.writeUInt16LE(flag,layout.weather);assert.equal(decode(r).snapshot.field.weather,name);}
 for(const [flag,name] of [[0x40,'Grassy'],[0x80,'Misty'],[0x100,'Electric'],[0x200,'Psychic']]){r.writeUInt32LE(flag|2,layout.fieldStatuses);assert.equal(decode(r).snapshot.field.terrain,name);}
 r.writeUInt32LE(0x402,layout.sideStatuses);assert.deepEqual(decode(r).snapshot.field.player,{reflect:false,light_screen:true,tailwind:true});
 r.writeUInt16LE(0x8000,layout.weather);assert.equal(decode(r).status,'unsupported');
});
test('Live Taunt, Disable and Encore timers constrain available moves and expire',()=>{
 const r=memory();r[layout.tauntTimer]=0x43;
 assert.equal(score(r).outgoing_moves.find(m=>m.name==='Growl').reason,'Blocked by Taunt');
 r[layout.tauntTimer]=0x40;assert.equal(decode(r).snapshot.player.effects.taunted,false);
 r.writeUInt16LE(44,layout.disabledMove);r[layout.disableTimer]=0x43;
 assert.equal(score(r).outgoing_moves[0].reason,'Disabled');r[layout.disableTimer]=0x40;assert.equal(score(r).outgoing_moves[0].available,true);
 r.writeUInt16LE(45,layout.encoreMove);r[layout.encoreTimer]=0x32;
 assert.equal(score(r).outgoing_moves[0].reason,'Blocked by Encore');r[layout.encoreTimer]=0x30;assert.equal(score(r).outgoing_moves[0].available,true);
 r[layout.tauntTimer+layout.restrictionStride]=0x43;assert.equal(decode(r).snapshot.opponent.effects.taunted,true);
});
test('Active status bits preserve the sleep counter and decode freeze',()=>{
 const r=memory();r.writeUInt32LE(3,layout.battleMons+80);r.writeUInt32LE(32,layout.battleMons+layout.battlerSize+80);
 const s=decode(r).snapshot;assert.equal(s.player.build.status,'slp');assert.equal(s.player.effects.sleep_counter,3);assert.equal(s.opponent.build.status,'frz');
 const result=score(r);assert.equal(result.outgoing_moves[0].action_chance,0);assert.equal(result.incoming_moves[0].action_chance,0.2);
 // This level-10 Turtwig survives the delay and one-shots the level-2 opponent
 // after waking. Sleep must not erase Bite from all future turns.
 // Cotton Down now correctly selects native execution. An unfinished native
 // search need not certify this whole chance tree inside the default slice.
 assert.equal(result.outlook.move_engine,'pokemon-showdown 0.11.11 with Run & Bun overrides');
 assert.equal(result.outlook.upper_bound,100);
 const initial=createCompleteBattle(s),native=restoreCompleteBattle(initial);
 installChanceTape(native,[],initial.unknownNature,initial,()=>0);
 for(let turn=0;turn<4&&!native.ended;turn++){native.choose('p1','move 1');native.choose('p2','move 1');}
 assert.equal(native.p2.active[0].hp,0);assert.ok(native.p1.active[0].hp>0);
 r.writeUInt32LE(0,layout.battleMons+80);assert.equal(decode(r).snapshot.player.effects.sleep_counter,undefined);
});
test('Undecoded volatile battle flags are surfaced as a warning',()=>{
 const r=memory();r.writeUInt32LE(3,layout.battleMons+84);
 assert.equal(decode(r).snapshot.player.effects.confusion_turns,3);assert.equal(score(r).outgoing_moves[0].action_chance,2/3);
 r.writeUInt32LE(0x80,layout.battleMons+84);
 assert.ok(decode(r).warnings.some(w=>w.includes('unrecognized live effect data')));
 r.writeUInt32LE(0,layout.battleMons+84);assert.ok(!decode(r).warnings.some(w=>w.includes('unrecognized live effect data')));
});
