import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {decodeLiveEffects,effectLayout as L} from '../run-bun/live-effects.mjs';
import {createCompleteBattle,restoreCompleteBattle,requiresCompleteMoves} from '../analysis/complete-moves.mjs';
const maps=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url)));
function fixture(){const ram=Buffer.alloc(0x48000);ram[0x233fc+34]=11;ram[0x233fc+35]=4;return ram;}
const read=(ram,options={})=>decodeLiveEffects(ram,0,maps,{status:'',status2:0,fieldFlags:0,weather:'',ability:'',item:'',moves:['Tackle'],positions:[0,1],...options});
const mon=(moves,effects={})=>({species:'Mew',current_hp:100,actual_stats:{hp:100,atk:30,def:30,spa:30,spd:30,spe:50},build:{level:20,moves,nature:'Serious',boosts:{},ability:'',item:''},effects,pp:Object.fromEntries(moves.map(m=>[m,10]))});
function native(effects,moves=['Splash'],foeEffects={}){
 const a=mon(moves,effects),b=mon(['Splash'],foeEffects);b.actual_stats.spe=10;
 const battle=restoreCompleteBattle(createCompleteBattle({player:a,opponent:b,field:{}}));
 battle.prng.random=(a,b)=>b===undefined?0:a;battle.prng.randomChance=(n,d)=>n>=d;
 return battle;
}
function turn(b){assert.equal(b.choose('p1','move 1'),true);assert.equal(b.choose('p2','move 1'),true);}

test('ROM status flags decode into named effects and their actual counters',()=>{
 const r=fixture();r[L.disable+14]=25;r[L.disable+18]=0x32;r[L.disable+31]=4;
 r.writeUInt32LE(0x20|0x4000000|4,L.status3);
 const result=read(r,{status2:0x100000|0x1000000|0x40000000});
 assert.equal(result.effects.focus_energy,true);assert.equal(result.effects.substitute_hp,25);
 assert.equal(result.effects.defense_curl,true);assert.equal(result.effects.native_volatiles.perishsong.duration,3);
 assert.equal(result.effects.native_volatiles.magnetrise.duration,4);assert.equal(result.effects.leech_seed,true);
 assert.deepEqual(result.unknown,[]);
});
test('Screens, weather, terrain and room counters survive decoding',()=>{
 const r=fixture();r.writeUInt32LE(1|2|0x400,0x23610);r[L.sideTimers]=4;r[L.sideTimers+2]=3;r[L.sideTimers+15]=2;
 r[L.fieldTimers+4]=4;r[L.fieldTimers+5]=3;r[L.fieldTimers+6]=2;r[L.weatherTimer]=4;
 const e=read(r,{fieldFlags:2|0x40|32,weather:'Rain'}).effects;
 assert.equal(e.reflect_turns,4);assert.equal(e.light_screen_turns,3);assert.equal(e.tailwind_turns,2);
 assert.equal(e.trick_room_turns,4);assert.equal(e.terrain_turns,3);assert.equal(e.weather_turns,4);
 assert.equal(e.native_field_conditions.gravity.duration,2);
});
test('Bide, Rollout, Choice lock and ability activation use verified storage',()=>{
 const r=fixture();r.writeUInt32LE(0x02000010,L.battleStructPointer);r.writeUInt16LE(maps.move.indexOf('Tackle'),0x10+L.choiceOffset);
 r.writeUInt32LE(17,L.takenDamage);r[L.disable+20]=0x54;r.writeUInt16LE(maps.move.indexOf('Rollout'),L.lockedMoves);
 r.writeUInt32LE(0x02001000,L.resourcesPointer);r.writeUInt32LE(0x02001100,0x1004);r.writeUInt32LE(5,0x1100);
 const e=read(r,{status2:0x1200,item:'Choice Band'}).effects;
 assert.equal(e.native_volatiles.bide.duration,2);assert.equal(e.native_volatiles.bide.totalDamage,17);
 assert.equal(e.locked_move,'Tackle');assert.equal(e.flash_fire,true);assert.equal(e.unburden,true);
 const roll=read(r,{status2:0x1000}).effects;assert.equal(roll.rolling_hits,1);assert.equal(roll.native_volatiles.rollout.contactHitCount,1);
});
test('Stockpile hydration preserves existing boosts and removes them correctly on release',()=>{
 const r=fixture();r[L.disable+9]=2;r[L.disable+10]=2;r[L.disable+11]=2;
 const e=read(r).effects,b=native(e,['Swallow']);b.p1.active[0].boosts.def=2;b.p1.active[0].boosts.spd=2;
 assert.equal(b.p1.active[0].volatiles.stockpile.layers,2);
 turn(b);assert.equal(b.p1.active[0].boosts.def,0);assert.equal(b.p1.active[0].boosts.spd,0);
});
test('Hydrated Yawn and Perish Song expire on the correct next turn',()=>{
 const b=native({native_volatiles:{yawn:{duration:1,source:'foe'}}});turn(b);assert.equal(b.p1.active[0].status,'slp');
 const perish=native({native_volatiles:{perishsong:{duration:1}}});turn(perish);assert.equal(perish.p1.active[0].hp,0);
});
test('Hydrated charge continues the attack rather than charging again',()=>{
 const b=native({charging_move:'Fly',semi_invulnerable:'air'},['Fly']);turn(b);
 assert.ok(b.p2.active[0].hp<100);assert.equal(b.p1.active[0].volatiles.twoturnmove,undefined);
});
test('Hydrated Wish heals once and retains its saved amount',()=>{
 const b=native({pending_wish:{turns:1,hp:25}});b.p1.active[0].hp=40;turn(b);
 assert.equal(b.p1.active[0].hp,65);turn(b);assert.equal(b.p1.active[0].hp,65);
});
test('Hydrated Future Sight keeps its cast-time source and cannot add a switch target',()=>{
 const effect={pending_future:{turns:1,move:'Future Sight',source:'foe',snapshot:{species:'Mew',level:20,actual_stats:{hp:100,atk:30,def:30,spa:100,spd:30,spe:50},boosts:{},ability:'',item:''}}};
 const b=native({},['Splash'],effect),hp=b.p2.active[0].hp;
 assert.equal(b.canSwitch(b.p1),0);turn(b);assert.ok(b.p2.active[0].hp<hp);
 const restored=restoreCompleteBattle(createCompleteBattle({player:mon(['Splash']),opponent:mon(['Splash'],effect),field:{}}));
 assert.equal(restored.p2.slotConditions[0].futuremove.source.storedStats.spa,100);
});
test('Existing native effects select the complete engine even for ordinary attacks',()=>{
 assert.equal(requiresCompleteMoves({player:mon(['Tackle'],{native_volatiles:{torment:{}}}),opponent:mon(['Tackle'])}),true);
});
test('Existing protection streak reduces success instead of granting a fresh Protect',()=>{
 const b=native({protect_streak:2},['Protect']);assert.equal(b.p1.active[0].volatiles.stall.counter,9);
});
test('Micle activation survives a status turn and is consumed by an accuracy check',()=>{
 const b=native({micle_boost:true},['Splash','Tackle']);
 turn(b);assert.ok(b.p1.active[0].volatiles.micleberry);
 b.choose('p1','move 2');b.choose('p2','move 1');assert.equal(b.p1.active[0].volatiles.micleberry,undefined);
});
test('Copycat receives the previous battle move from the shared ROM history',()=>{
 const r=fixture();r.writeUInt16LE(maps.move.indexOf('Tackle'),L.lastUsedMove);
 const e=read(r).effects;assert.equal(e.battle_last_move,'Tackle');
 const b=native(e,['Copycat']);turn(b);assert.ok(b.p2.active[0].hp<100);
});
