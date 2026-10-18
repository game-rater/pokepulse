import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape} from '../analysis/native-battle.mjs';
import {selectContinuationChoices,continuationActionFlags} from '../analysis/action-usefulness.mjs';
import {nativeContinuationPolicy} from '../analysis/continuation-policy.mjs';
function position(moves,edit=()=>{}){
 const s={player:mon('Mew',moves),opponent:mon('Machamp',['Tackle']),field:{}};
 edit(s);const state=createCompleteBattle(s),battle=restoreCompleteBattle(state);
 return {state,battle,p:battle.p1.active[0],q:battle.p2.active[0]};
}
const cap=s=>{s.player.build.boosts.atk=6;};
test('Pure capped setup is flagged and removed from both optimized sides symmetrically',()=>{
 const {p,q}=position(['Swords Dance','Tackle'],s=>{cap(s);s.opponent=mon('Machamp',['Swords Dance','Tackle']);s.opponent.build.boosts.atk=6;});
 for(const a of [p,q]){const r=selectContinuationChoices(a);assert.deepEqual(r.choices.map(c=>c.id),['tackle']);assert.deepEqual(r.flags[0].reasons,['stat-limit']);}
});
test('Partial boosts, mixed boost effects and Contrary use actual remaining effects',()=>{
 for(const [moves,edit,expected] of [
  [['Swords Dance','Tackle'],s=>{s.player.build.boosts.atk=4;},false],
  [['Cosmic Power','Tackle'],s=>{s.player.build.boosts.def=6;},false],
  [['Swords Dance','Tackle'],s=>{cap(s);s.player.build.ability='Contrary';},false],
  [['Swords Dance','Tackle'],s=>{s.player.build.boosts.atk=-6;s.player.build.ability='Contrary';},true],
 ]){const {p}=position(moves,edit);assert.equal(continuationActionFlags(p,{id:moves[0].toLowerCase().replaceAll(' ','')}).includes('stat-limit'),expected);}
});
test('A full-HP heal is removed only when every opponent choice happens later',()=>{
 const {p}=position(['Recover','Tackle']);assert.deepEqual(selectContinuationChoices(p).filtered,[1]);
 for(const edit of [s=>{s.player.current_hp=100;},s=>{s.player.actual_stats.spe=1;},s=>{s.player.actual_stats.spe=s.opponent.actual_stats.spe;},
  s=>{s.opponent=mon('Machamp',['Quick Attack']);},s=>{s.opponent.build.item='Quick Claw';},s=>{s.field.isTrickRoom=true;}]){
  const {p}=position(['Recover','Tackle'],edit);assert.deepEqual(continuationActionFlags(p,{id:'recover'}),[]);
 }
});
test('Redundant statuses are flagged without assuming the enemy chooses a particular move',()=>{
 const {p}=position(['Hypnosis','Tackle'],s=>{s.opponent.build.status='par';});
 assert.deepEqual(continuationActionFlags(p,{id:'hypnosis'}),['target-already-statused']);
 const slow=position(['Hypnosis','Tackle'],s=>{s.player.actual_stats.spe=1;s.opponent.build.status='slp';s.opponent.effects.sleep_counter=1;});
 assert.deepEqual(continuationActionFlags(slow.p,{id:'hypnosis'}),[],'enemy may wake before a slower Hypnosis');
});
test('Static status immunities are flags; ability interactions remain native',()=>{
 for(const [move,species,ability,reason] of [['Will-O-Wisp','Charmander','','status-type-immunity'],['Hypnosis','Machamp','Insomnia','status-ability-immunity']]){
  const {p}=position([move,'Tackle'],s=>{s.opponent=mon(species,['Tackle'],{level:20,ability});});
  assert.deepEqual(continuationActionFlags(p,{id:move.toLowerCase().replaceAll(/[^a-z]/g,'')}),[reason]);
 }
 const {p}=position(['Thunder Wave','Tackle'],s=>{s.opponent.build.ability='Volt Absorb';});
 assert.deepEqual(continuationActionFlags(p,{id:'thunderwave'}),[],'type-triggered healing still executes natively');
 const dynamic=position(['Thunder Wave','Tackle'],s=>{s.opponent=mon('Pikachu',['Tackle']);});
 assert.deepEqual(continuationActionFlags(dynamic.p,{id:'thunderwave'}),[],'Run & Bun move callbacks remain in native execution');
 const corrosion=position(['Poison Gas','Tackle'],s=>{s.player.build.ability='Corrosion';s.opponent=mon('Steelix',['Tackle']);});
 assert.deepEqual(continuationActionFlags(corrosion.p,{id:'poisongas'}),[],'Corrosion bypasses poison type immunity');
});
test('Poison, recovery items, timers, recoil, counters and scarce attack PP preserve waiting',()=>{
 for(const edit of [s=>{s.opponent.build.status='tox';s.opponent.effects.toxic_counter=3;},s=>{s.player.build.item='Leftovers';},
  s=>{s.player.effects.protect_streak=1;},s=>{s.opponent=mon('Machamp',['Double-Edge']);},
  s=>{s.opponent=mon('Machamp',['Counter']);},s=>{s.player.pp.Tackle=1;}]){
  const {p}=position(['Swords Dance','Tackle'],s=>{cap(s);edit(s);}),r=selectContinuationChoices(p);
  assert.ok(r.waiting);assert.deepEqual(r.choices.map(c=>c.slot),[1,2]);
 }
});
test('An expired first-turn move can be the winning wait against poison and contact damage',()=>{
 const {state,p}=position(['Fake Out','Tackle'],s=>{
  s.player.current_hp=1;s.opponent=mon('Machamp',['Splash'],{hp:1,status:'tox',ability:'Rough Skin',effects:{toxic_counter:0}});
 });
 assert.deepEqual(continuationActionFlags(p,{id:'fakeout'}),['first-turn-expired']);
 assert.deepEqual(selectContinuationChoices(p).choices.map(c=>c.slot),[1,2]);
 const policy=nativeContinuationPolicy(state,new Map());assert.ok(policy.probabilities[0][0]>0.9);
});
test('Every-failure and exhausted PP positions retain native legal fallback choices',()=>{
 const all=position(['Swords Dance','Splash'],cap);assert.deepEqual(selectContinuationChoices(all.p).choices.map(c=>c.slot),[1,2]);
 const exhausted=position(['Tackle'],s=>{s.player.pp.Tackle=0;});assert.equal(selectContinuationChoices(exhausted.p).choices[0].id,'struggle');
 const mixed=position(['Splash','Tackle']);assert.deepEqual(selectContinuationChoices(mixed.p).filtered,[1]);
});
test('Flags and policy construction preserve the input and segregate enabled/disabled caches',()=>{
 const {state,p,battle}=position(['Swords Dance','Tackle'],cap),before=JSON.stringify(battle.toJSON()),cache=new Map();
 selectContinuationChoices(p);assert.equal(JSON.stringify(battle.toJSON()),before);
 const enabled=nativeContinuationPolicy(state,cache),disabled=nativeContinuationPolicy(state,cache,{filterUselessTurns:false});
 assert.deepEqual(enabled.actions[0],[2]);assert.deepEqual(disabled.actions[0],[1,2]);assert.notEqual(enabled,disabled);
 assert.deepEqual(enabled.actionFlags[0].filtered,[1]);assert.equal(nativeContinuationPolicy(state,cache),enabled);
});
test('Flagged failures agree with native execution while noncapped setup still changes stats',()=>{
 for(const [moves,edit,action] of [[['Swords Dance','Tackle'],cap,1],[['Recover','Tackle'],()=>{},1],[['Splash','Tackle'],()=>{},1]]){
  const {p,battle,state}=position(moves,edit),before={hp:p.hp,boosts:{...p.boosts}};
  assert.ok(continuationActionFlags(p,{id:p.moveSlots[action-1].id}).length);
  installChanceTape(battle,[],state.unknownNature,state,()=>0.99);
  battle.actions.runMove(battle.dex.getActiveMove(p.moveSlots[action-1].id),p,1);
  assert.equal(p.hp,before.hp);assert.deepEqual(p.boosts,before.boosts);
 }
 const {p,battle,state}=position(['Swords Dance','Tackle']);installChanceTape(battle,[],state.unknownNature,state,()=>0.99);
 battle.actions.runMove(battle.dex.getActiveMove('swordsdance'),p,1);assert.equal(p.boosts.atk,2);
});
