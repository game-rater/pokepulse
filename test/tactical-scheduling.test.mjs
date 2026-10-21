import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationStrategies,nativeContinuationPolicy,continuationPolicyValue} from '../analysis/continuation-policy.mjs';
import {rolloutHorizon,allocation,recordHorizonSample,stratumMean,DEFAULT_ROLLOUT_TURNS,nextChanceStratum} from '../analysis/sampled-search.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape} from '../analysis/complete-moves.mjs';
import {referenceMon} from '../scripts/accuracy-benchmark-fixtures.mjs';

test('Four-turn tactical coverage follows the broad pass and never grows to long rollouts',()=>{
 assert.equal(DEFAULT_ROLLOUT_TURNS,4);
 assert.equal(rolloutHorizon(0,true),1);
 for(const n of [1,2,7,8,16,32,128,1000])assert.equal(rolloutHorizon(n,true),4);
 assert.equal(rolloutHorizon(1,true,1),1);
 assert.equal(rolloutHorizon(0,false),4);
 assert.equal(rolloutHorizon(128,true,4),4,'an explicitly configured depth never doubles');
});
test('The last-turn action table is integrated without sampling a new action pair',()=>{
 assert.equal(continuationPolicyValue({matrix:[[0,1],[0.4,0.4]],probabilities:[[0,1],[0.5,0.5]]}),0.4);
 assert.equal(continuationPolicyValue({matrix:[[0,1]],probabilities:[[1],[0.25,0.75]]}),0.75);
 assert.equal(continuationPolicyValue({matrix:null,estimatedValue:0}),0);
 assert.equal(continuationPolicyValue({matrix:null,probabilities:[[1],[1]]}),null,'unprobed forced actions still execute natively');
});
test('Common chance outcomes go first without starving or reweighting rare outcomes',()=>{
 const strata=[{n:0,sum:0,probability:1/16},{n:0,sum:0,probability:15/16}];
 assert.equal(nextChanceStratum(strata),1);
 strata[1].n=1;
 assert.equal(nextChanceStratum(strata),0);
 strata[0].n=1;strata[0].sum=1;
 assert.equal(stratumMean({strata}),1/16);
});
test('A decisive reply receives no losing-move pseudocounts in either orientation',()=>{
 assert.deepEqual(continuationStrategies([[0,0.4],[0,1]]),[[0.5,0.5],[1,0]]);
 assert.deepEqual(continuationStrategies([[1,1],[0.4,0]]),[[1,0],[0.5,0.5]]);
 assert.deepEqual(continuationStrategies([[1,0],[0,1]]).map(a=>a.every(p=>p>0)),[true,true]);
});
test('NPC probabilities remain fixed even when another reply is decisive',()=>{
 const [,q]=continuationStrategies([[0,1],[0.5,0.5]],[0.2,0.8]);
 assert.deepEqual(q,[0.2,0.8]);
});
test('Covered tactical pairs receive deeper work before ordinary replies, then yield',()=>{
 const cell=()=>({n:3,sum:1.5,estimateStats:{n:3,sum:1.5,horizon:1}}),cells=Array.from({length:2},()=>Array.from({length:2},cell));
 const options={tacticalCoverage:true,tacticalColumns:[0,4],tacticalRows:[0,0]};
 assert.equal(allocation(cells,128,options).selected.c,1);
 for(const row of cells)row[1].estimateStats.horizon=2;
 assert.equal(allocation(cells,128,options).selected.c,0);
});
test('Terminal-depth promotion still waits for every small chance stratum',()=>{
 const cell={strata:[{probability:0.2},{probability:0.3},{probability:0.5}],estimateStats:{horizon:1,n:4,sum:2}};
 recordHorizonSample(cell,2,0,0,true);recordHorizonSample(cell,2,0,1,true);
 assert.equal(stratumMean(cell),0.5);
 recordHorizonSample(cell,2,0,2,true);
 assert.equal(stratumMean(cell),0);
 assert.equal(cell.estimateStats.horizon,2);
});
test('A sleeping target cannot distract the policy from a guaranteed Wake-Up Slap KO',()=>{
 const target=referenceMon('Farfetch’d-Galar',['Pluck','Brutal Swing','Focus Energy','Rock Smash'],{level:21,hp:50,status:'slp',ability:'Inner Focus',item:'Leek',effects:{sleep_counter:1}});
 const attacker=referenceMon('Breloom',['Wake-Up Slap','Bullet Seed','Mach Punch','Spore'],{level:19,ability:'Poison Heal',item:'Toxic Orb'});
 for(const reverse of [false,true]){
  const state=createCompleteBattle({player:reverse?attacker:target,opponent:reverse?target:attacker,field:{}});
  const policy=nativeContinuationPolicy(state,new Map());
  const side=reverse?0:1,slot=policy.actions[side].indexOf(1);
  assert.equal(policy.probabilities[side][slot],1);
  assert.equal(continuationPolicyValue(policy),reverse?1:0);
 }
});
test('Spore then Wake-Up Slap defeats each available reply at both chance extremes',()=>{
 const target=referenceMon('Farfetch’d-Galar',['Pluck','Brutal Swing','Focus Energy','Rock Smash'],{level:21,hp:50,ability:'Inner Focus',item:'Leek'});
 const attacker=referenceMon('Breloom',['Wake-Up Slap','Bullet Seed','Mach Punch','Spore'],{level:19,ability:'Poison Heal',item:'Toxic Orb'});
 for(const draw of [0,0.999999])for(let first=1;first<=4;first++)for(let second=1;second<=4;second++){
  const state=createCompleteBattle({player:target,opponent:attacker,field:{}}),battle=restoreCompleteBattle(state);
  installChanceTape(battle,[],state.unknownNature,state,()=>draw);
  assert.ok(battle.choose('p1',`move ${first}`));assert.ok(battle.choose('p2','move 4'));
  assert.equal(battle.p1.active[0].status,'slp');
  assert.ok(battle.choose('p1',`move ${second}`));assert.ok(battle.choose('p2','move 1'));
  assert.equal(battle.p1.active[0].hp,0);
 }
});
test('The same species at full HP can survive a damage roll: names alone cannot prove a KO',()=>{
 const target=referenceMon('Farfetch’d-Galar',['Pluck'],{level:21,ability:'Inner Focus',item:'Leek'});
 const attacker=referenceMon('Breloom',['Wake-Up Slap','Spore'],{level:19,ability:'Poison Heal',item:'Toxic Orb'});
 const state=createCompleteBattle({player:target,opponent:attacker,field:{}}),battle=restoreCompleteBattle(state);
 installChanceTape(battle,[],state.unknownNature,state,()=>0.999999);
 battle.choose('p1','move 1');battle.choose('p2','move 2');
 battle.choose('p1','move 1');battle.choose('p2','move 1');
 assert.equal(battle.p1.active[0].hp,1);
});
