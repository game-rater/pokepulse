import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,packed} from '../analysis/native-battle.mjs';
import {nativePositionFeatures} from '../analysis/position-features.mjs';
import {searchFixtures,mon} from '../scripts/search-benchmark-fixtures.mjs';
import {createRequire} from 'node:module';
const {BattleActions}=createRequire(import.meta.url)('../vendor/showdown/dist/sim/battle-actions.js');

function compare(state){
 const before=JSON.stringify(state);
 const reference=nativePositionFeatures(state,{featureProbeReuse:false});
 const reused=nativePositionFeatures(state);
 assert.deepEqual({...reused,passive:{...reused.passive,steps:0}},{...reference,passive:{...reference.passive,steps:0}});
 assert.equal(JSON.stringify(state),before);
}
test('A changed HP observation actually reuses eligible native probes',()=>{
 const original=BattleActions.prototype.runMove;let calls=0;
 BattleActions.prototype.runMove=function(...args){calls++;return original.apply(this,args);};
 try{
  const s={player:mon(['Tackle','Recover','Swords Dance']),opponent:mon(['Tackle'],{spe:31}),field:{}};
  s.player.actual_stats.atk=137;s.opponent.actual_stats.def=73;
  nativePositionFeatures(createCompleteBattle(s));const first=calls;calls=0;
  s.player.current_hp=76;s.opponent.current_hp=47;
  const state=createCompleteBattle(s),reused=nativePositionFeatures(state),second=calls;
  assert.ok(first>0);assert.ok(second<first,`${second} should be fewer native probes than ${first}`);
  const reference=nativePositionFeatures(state,{featureProbeReuse:false});
  assert.deepEqual({...reused,passive:{...reused.passive,steps:0}},{...reference,passive:{...reference.passive,steps:0}});
 }finally{BattleActions.prototype.runMove=original;}
});
test('Only native timelines without Update/Residual handlers or clocks skip passive simulation',()=>{
 const s={player:mon(['Tackle']),opponent:mon(['Tackle']),field:{}};
 const state=createCompleteBattle(s);
 assert.equal(nativePositionFeatures(state).passive.steps,0);
 assert.ok(nativePositionFeatures(state,{featureProbeReuse:false}).passive.steps>0);
 for(const edit of [s=>{s.player.build.ability='Shed Skin';s.player.build.status='psn';},s=>{s.player.build.item='Leftovers';},
  s=>{s.opponent.build.status='tox';s.opponent.effects.toxic_counter=2;},s=>{s.field.weather='Rain';s.player.effects.weather_turns=3;}]){
  const v=structuredClone(s);edit(v);const state=createCompleteBattle(v);compare(state);
  assert.ok(nativePositionFeatures(state).passive.steps>0);
 }
});
test('Native capability reuse matches uncached probes across broad first-turn outcomes',()=>{
 for(const id of ['four-by-four','herdier-wingull','persistent-effects']){
  const initial=createCompleteBattle(searchFixtures.find(f=>f.id===id).snapshot);compare(initial);
  for(let a=1;a<=initial.saved.sides[0].pokemon[0].moveSlots.length;a++)for(let b=1;b<=initial.saved.sides[1].pokemon[0].moveSlots.length;b++){
   const game=restoreCompleteBattle(initial);installChanceTape(game,[],initial.unknownNature,initial,()=>0.8);
   assert.ok(game.choose('p1',`move ${a}`));assert.ok(game.choose('p2',`move ${b}`));
   if(game.p1.active[0].hp>0&&game.p2.active[0].hp>0)compare(packed(game,initial.unknownNature));
  }
 }
});
test('HP and PP changes preserve native damage, healing and future-Struggle profiles',()=>{
 for(const hp of [100,99,26,25,1])for(const pp of [20,1]){
  const s={player:mon(['Tackle','Recover','Swords Dance'],{hp,pp}),opponent:mon(['Seismic Toss'],{hp:hp===1?2:hp,spe:30,pp}),field:{}};
  compare(createCompleteBattle(s));
 }
});
test('HP-sensitive moves and effects retain the full native probe path',()=>{
 for(const change of [
  s=>{s.player.build.moves=['Flail','Endeavor'];},
  s=>{s.player.build.moves=['Pain Split','Super Fang'];},
  s=>{s.player.build.moves=['Double-Edge','Giga Drain'];},
  s=>{s.player.build.moves=['Steel Beam','High Jump Kick'];},
  s=>{s.player.build.moves=['Triple Axel','Present'];},
  s=>{s.opponent.build.ability='Multiscale';},
  s=>{s.player.build.ability='Defeatist';},
  s=>{s.opponent.build.item='Rocky Helmet';},
  s=>{s.player.build.item='Life Orb';},
  s=>{s.player.effects.confusion_turns=2;},
  s=>{s.opponent.effects.substitute_hp=10;},
  s=>{s.player.build.status='par';},
  s=>{s.player.build.status='brn';},
  s=>{s.field.weather='Rain';s.player.effects.weather_turns=3;},
 ])for(const hp of [100,37,1]){
  const s={player:mon(['Tackle','Recover'],{hp}),opponent:mon(['Tackle'],{spe:30}),field:{}};change(s);compare(createCompleteBattle(s));
 }
});
