import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/native-battle.mjs';
import {nativePositionFeatures} from '../analysis/position-features.mjs';
import {nativeContinuationPolicy} from '../analysis/continuation-policy.mjs';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {recordHorizonSample,stratumMean,samplingConfidenceBounds} from '../analysis/sampled-search.mjs';
const snapshot=(move='Soft-Boiled',pp=10)=>({player:mon('Mew',[move,'Detect'],{hp:1,item:'Leftovers'}),opponent:mon('Blissey',['Seismic Toss'],{status:'psn',item:'Leftovers'}),field:{}});
function features(s){return nativePositionFeatures(createCompleteBattle(s));}
test('Recovery capability generalizes to other healing and protection moves',()=>{
 const s=snapshot(),f=features(s);
 assert.equal(f.actions[0].healing,1710);assert.equal(f.actions[0].protectPP,5);
 assert.ok(f.value>0.7);
 const p=nativeContinuationPolicy(createCompleteBattle(s),new Map());
 assert.deepEqual(p.probabilities[0],[1,0],'the safe healing action has no random inferior-action leakage');
});
test('Finite healing and protection resources affect endurance',()=>{
 const plentiful=snapshot(),scarce=structuredClone(plentiful);scarce.player.pp={'Soft-Boiled':1,Detect:1};
 const a=features(plentiful),b=features(scarce);
 assert.ok(a.actions[0].healing>b.actions[0].healing);assert.ok(a.lifetime[0].turns>b.lifetime[0].turns);assert.ok(a.value>b.value);
});
test('Native residual forecast accounts for poison healing, cures and Toxic counters',()=>{
 const s=snapshot();s.opponent.build.item='';s.opponent.current_hp=300;s.opponent.build.status='tox';s.opponent.effects.toxic_counter=2;
 const toxic=features(s);assert.ok(Number.isFinite(toxic.passive.clock[1]));assert.ok(toxic.passive.net[1]<0);
 const cure=structuredClone(s);cure.opponent.build.item='Lum Berry';assert.equal(features(cure).passive.clock[1],Infinity);
 const heal=structuredClone(s);heal.opponent.build.ability='Poison Heal';assert.equal(features(heal).passive.clock[1],Infinity);assert.ok(features(heal).passive.net[1]>0);
 const early=structuredClone(s);early.opponent.effects.toxic_counter=0;assert.ok(features(early).passive.clock[1]>toxic.passive.clock[1]);
});
test('Endure and side guards are not credited as full damage prevention resources',()=>{
 for(const guard of ['Endure','Wide Guard','Quick Guard']){
 const s=snapshot('Recover');s.player.build.moves=['Recover',guard];s.player.pp={Recover:10,[guard]:10};
 assert.equal(features(s).actions[0].protectPP,0);}
});
test('Incoming damage is measured before HP clipping at one remaining HP',()=>{
 const f=features(snapshot());assert.equal(f.actions[1].attack,100);
});
test('Temporal feature probes preserve native state and honor cancellation',()=>{
 const state=createCompleteBattle(snapshot('Slack Off')),before=JSON.stringify(state);
 assert.equal(nativePositionFeatures(state,{shouldStop:()=>true}),null);
 assert.ok(nativePositionFeatures(state));assert.equal(JSON.stringify(state),before);
 const b=restoreCompleteBattle(state);assert.equal(b.p1.active[0].hp,1);
});
test('A deeper estimator replaces shallow bias without mixing rollout targets',()=>{
 const c={n:100,sum:2};for(let i=0;i<4;i++)recordHorizonSample(c,1,0.02);
 assert.equal(stratumMean(c),0.02);recordHorizonSample(c,12,1);
 assert.equal(stratumMean(c),0.02,'keep a covered estimate while the deeper epoch warms');
 assert.equal(c.confidenceStats.n,1);assert.equal(samplingConfidenceBounds(c).lower,0);
 for(let i=0;i<3;i++)recordHorizonSample(c,12,1);
 assert.equal(stratumMean(c),1);assert.equal(c.n,100,'work counters are independent of estimator epochs');
 for(let i=0;i<4;i++)recordHorizonSample(c,4,0);
 assert.equal(stratumMean(c),1,'a later shallow retained prior must not displace deeper evidence');
});
test('Epoch promotion requires coverage and weights rare branches by probability',()=>{
 const c={n:0,sum:0,strata:[{probability:1/16,n:0,sum:0},{probability:15/16,n:0,sum:0}]};
 recordHorizonSample(c,1,0,0);recordHorizonSample(c,1,0,1);assert.equal(stratumMean(c),0);
 for(let i=0;i<4;i++)recordHorizonSample(c,24,1,0);
 assert.equal(stratumMean(c),0,'a rare branch alone cannot replace the earlier estimate');
 recordHorizonSample(c,24,0,1);assert.equal(stratumMean(c),1/16);
});
import {simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {stallFixtures} from '../scripts/stall-benchmark-fixtures.mjs';
test('Forced final turns integrate native rare outcomes instead of resampling them',()=>{
 const s=stallFixtures.find(f=>f.id==='stall-protect-risk').snapshot,session={};let result;
 for(let n=0;n<20;n++){result=simulateCompleteMoves(s,{session,approximateCompleteMoves:true,opponentModel:'npc-ai',passiveEndgames:false,samplesPerPair:16,timeMs:100});if(result.sampling_complete)break;}
 assert.ok(Math.abs(result.score-100/3)<1e-9);
 assert.equal(result.certified,false,'integrating a final turn does not certify heuristic policies');
});

import {backedValue} from '../analysis/retained-turn.mjs';
test('A shallow retained child cannot overwrite a deeper root estimate',()=>{
 const child={value:0.2,lower:0,upper:1,prior:{n:1},result:{provisional_usable:true,estimate_turns:4}};
 const node={result:{estimate_turns:12},pairs:[[{complete:true,terminal:0,edges:new Map([['child',{probability:1,node:child}]])}]]};
 assert.equal(backedValue(node),null);
 child.result.estimate_turns=11;assert.equal(backedValue(node),0.2);
 child.result.estimate_turns=0;child.lower=child.upper=0.2;assert.equal(backedValue(node),0.2,'a proven child is independent of forecast horizon');
});
test('Small work slices resume feature probes and passive clocks without double counting PP',()=>{
 const s=snapshot('Slack Off');s.player.current_hp=7;s.player.build.moves=['Slack Off','Detect','Tackle','Swords Dance'];s.player.pp={'Slack Off':10,Detect:5,Tackle:35,'Swords Dance':20};
 const state=createCompleteBattle(s),before=JSON.stringify(state);let f,attempts=0;
 while(!f&&attempts++<80){let checks=0;f=nativePositionFeatures(state,{shouldStop:()=>++checks>4});}
 assert.ok(f,'bounded slices must eventually finish');assert.ok(attempts>1);
 assert.equal(f.actions[0].pp,70);assert.equal(f.actions[0].healing,1710);assert.equal(f.actions[0].protectPP,5);
 assert.equal(JSON.stringify(state),before);
});

test('A consumable heal is a finite reserve, never recovery for every move PP or every turn',()=>{
 const s=snapshot('Splash');s.player.current_hp=s.player.actual_stats.hp;s.player.build.moves=['Splash'];s.player.pp={Splash:40};s.player.build.item='Sitrus Berry';s.opponent.build.status='';
 const f=features(s);assert.equal(f.actions[0].healing,0);assert.equal(f.passive.net[0],0);assert.equal(f.passive.burst[0],85);
 s.player.build.moves=['Recover'];s.player.pp={Recover:10};assert.equal(features(s).actions[0].healing,1710);
});
