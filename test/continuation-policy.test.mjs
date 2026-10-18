import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/complete-moves.mjs';
import {nativeContinuationPolicy,continuationValue} from '../analysis/continuation-policy.mjs';
const mon=(moves,extra={})=>({species:'Mew',current_hp:100,actual_stats:{hp:100,atk:60,def:60,spa:60,spd:60,spe:50},build:{level:30,nature:'Serious',ability:'',item:'',boosts:{},moves,...extra},effects:{first_turn:false}});
for(const [name,moves,foeMoves,extra,preferred] of [
 ['sleep immunity',['Hypnosis','Tackle'],['Tackle'],{ability:'Insomnia'},1],
 ['ability immunity',['Thunderbolt','Tackle'],['Tackle'],{ability:'Volt Absorb'},1],
 ['conditional attack failure',['Sucker Punch','Tackle'],['Splash'],{},1],
 ['defensive setup',['Iron Defense','Tackle'],['Tackle'],{},0],
 ['attack reduction',['Charm','Tackle'],['Tackle'],{},0],
 ['accuracy reduction',['Kinesis','Tackle'],['Tackle'],{},0],
 ['offensive setup',['Swords Dance','Tackle'],['Tackle'],{},0],
 ['stat-drop immunity',['Charm','Tackle'],['Tackle'],{ability:'Clear Body'},1],
 ['accuracy-drop immunity',['Kinesis','Tackle'],['Tackle'],{ability:'Keen Eye'},1],
 ['reversed stat drops',['Charm','Tackle'],['Tackle'],{ability:'Contrary'},1],
])test(`Native continuation policy accounts for ${name}`,()=>{
 const state=createCompleteBattle({player:mon(moves),opponent:mon(foeMoves,extra),field:{}});
 const policy=nativeContinuationPolicy(state,new Map());
 assert.ok(policy.probabilities[0][preferred]>0.9);
 assert.ok(policy.matrix[preferred][0]>policy.matrix[1-preferred][0]);
});
test('Evaluating a continuation does not alter live stats, effects, RNG or requests',()=>{
 const battle=restoreCompleteBattle(createCompleteBattle({player:mon(['Low Kick','Hypnosis']),opponent:mon(['Tackle']),field:{}}));
 const before=JSON.stringify(battle.toJSON());continuationValue(battle);
 assert.equal(JSON.stringify(battle.toJSON()),before);
});
test('Native policy preserves partial work at a deadline and resumes it',()=>{
 const state=createCompleteBattle({player:mon(['Tackle','Charm']),opponent:mon(['Tackle']),field:{}}),cache=new Map();
 assert.equal(nativeContinuationPolicy(state,cache,{deadline:0}),null);
 assert.equal(cache.size,1);
 const policy=nativeContinuationPolicy(state,cache);
 assert.ok(policy);assert.equal(nativeContinuationPolicy(state,cache),policy);
});
test('An exhausted first-turn move is not chosen when another action exists',()=>{
 const state=createCompleteBattle({player:mon(['Fake Out','Tackle']),opponent:mon(['Tackle']),field:{}});
 assert.deepEqual(nativeContinuationPolicy(state,new Map()).actions[0],[2]);
});
test('Imported live stats also become the native baseline for later stat restoration',()=>{
 const state=createCompleteBattle({player:mon(['Tackle']),opponent:mon(['Tackle']),field:{}});
 const p=state.saved.sides[0].pokemon[0];assert.deepEqual(p.baseStoredStats,p.storedStats);
});
