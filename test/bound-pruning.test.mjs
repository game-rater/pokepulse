import test from 'node:test';
import assert from 'node:assert/strict';
import {matrixBounds,matrixPruning,searchBattle,searchFrontier,thresholdDecision,searchProbabilityThresholds} from '../analysis/search.mjs';
import {samplingConfidenceBounds,allocation} from '../analysis/sampled-moves.mjs';
import {backupTurnBounds,turnPairBounds} from '../analysis/retained-turn.mjs';
test('Interval dominance preserves mixed-strategy moves and eliminates dominated mixtures',()=>{
 const m=[[0,1],[1,0],[0.4,0.4]],active=matrixPruning(m,m);
 assert.deepEqual(active.rows,[0,1]);assert.deepEqual(active.columns,[0,1]);
 const b=matrixBounds(m,m,4096);assert.ok(b.lower<=0.5&&b.upper>=0.5);assert.ok(b.upper-b.lower<0.02);
 const upper=[[1,1],[0.6,0.6]],lower=[[0,0],[0.6,0.6]];
 assert.equal(matrixPruning(lower,upper).rows.length,2,'an optimistic guess cannot dominate uncertain payoffs');
});
test('Matrix reductions retain independent analytic values over 625 games',()=>{
 const numbers=[0,0.25,0.5,0.75,1];
 for(const a of numbers)for(const b of numbers)for(const c of numbers)for(const d of numbers){
  const low=Math.max(Math.min(a,b),Math.min(c,d)),high=Math.min(Math.max(a,c),Math.max(b,d));
  const value=low===high?low:(a*d-b*c)/(a-b-c+d);
  const m=[[a,b],[c,d],[Math.max(0,(a+c)/2-0.01),Math.max(0,(b+d)/2-0.01)]];
  for(const row of m)row.push(Math.min(1,(row[0]+row[1])/2+0.01));
  const result=matrixBounds(m,m,256);
  assert.ok(result.lower<=value+1e-9&&result.upper>=value-1e-9,JSON.stringify({m,value,result}));
  assert.ok(result.upper-result.lower<=0.02,'returning [0,1] for every game is not a solver');
 }
});
test('Recursive chance pruning skips a dominated stochastic tail without losing probability',()=>{
 function run(prune){let tailVisits=0;
  const adapter={key:s=>s.id,terminal:s=>s.value??null,actions:s=>s.id==='root'?[[0,1],[0,1]]:[[0],[0]],
   transitions:(s,a,b)=>{
    if(s.id==='tail'){tailVisits++;return [{probability:1,state:{id:'tail-end',value:1}}];}
    if(a===0)return [{probability:1,state:{id:'a'+b,value:0.8}}];
    if(b===0)return [{probability:1,state:{id:'b0',value:0.2}}];
    return [{probability:0.9,state:{id:'miss',value:0}},{probability:0.1,state:{id:'tail'}}];
   }};
  return {result:searchBattle(adapter,{id:'root'},{maxDepth:4,timeMs:1000,boundPruning:prune}),tailVisits};
 }
 const pruned=run(true),baseline=run(false);
 assert.equal(pruned.result.lower,0.8);assert.equal(pruned.result.upper,0.8);
 assert.equal(pruned.tailVisits,0);assert.equal(baseline.tailVisits,1);assert.ok(pruned.result.pruned_chance_branches>0);
});
test('Frontier eliminates componentwise dominated choices even above the global lower bound',()=>{
 function run(prune){let bVisits=0;
  const adapter={key:s=>s.id,terminal:s=>s.value??null,actions:s=>s.id==='root'?[[0,1,2],[0,1]]:[[0],[0]],
   transitions:(s,a,b)=>{
    if(s.id!=='root'){if(s.id[0]==='B')bVisits++;const n=s.n||0;return [{probability:1,state:n===10?{id:s.id+'done',value:1}:{id:s.id[0]+(n+1),n:n+1}}];}
    if(a===0)return [{probability:1,state:{id:'a'+b,value:b?1:0.8}}];
    if(a===1)return b?[{probability:0.05,state:{id:'zero',value:0}},{probability:0.95,state:{id:'B0',n:0}}]:[{probability:1,state:{id:'b0',value:0.2}}];
    return [{probability:1,state:b?{id:'C0',n:0}:{id:'c0',value:0.9}}];
   }};
  return {result:searchFrontier(adapter,{id:'root'},{timeMs:1000,maxDepth:20,boundPruning:prune,workEstimate:s=>s.id[0]==='C'?100:1}),bVisits};
 }
 const pruned=run(true),baseline=run(false);
 assert.ok(Math.abs(pruned.result.lower-0.9)<1e-12);assert.ok(Math.abs(baseline.result.lower-0.9)<1e-12);
 assert.equal(pruned.bVisits,0);assert.ok(baseline.bVisits>0);
});
test('Sampling confidence uses actual stratum weights and fresh horizon evidence',()=>{
 const rare={n:200000,sum:100000,strata:[{probability:1/16,n:100000,sum:100000},{probability:15/16,n:100000,sum:0}]};
 const b=samplingConfidenceBounds(rare);assert.ok(b.lower<1/16&&b.upper>1/16);assert.ok(b.upper<0.1);
 const changed={n:100000,sum:100000,confidenceStats:{horizon:24,n:1,sum:0}};
 assert.equal(samplingConfidenceBounds(changed).lower,0);assert.equal(samplingConfidenceBounds(changed).upper,1);
 const cell=v=>({n:100000,sum:v*100000});
 const cells=[[cell(0),cell(1)],[cell(1),cell(0)],[cell(0.4),cell(0.4)]];
 const scheduled=allocation(cells,200000);assert.ok(scheduled.selected.r<2);assert.ok(scheduled.pruned>0);
});
test('Retained bounds respect missing mass and full native state identities',()=>{
 const child={nativeStateKey:'native-a',lower:0.8,upper:0.9};
 const p={terminal:0.1,missingMass:0.1,pending:[{probability:0.1}],edges:new Map([['child',{node:child,nativeKeys:new Map([['native-a',0.5],['other',0.2]])}]])};
 const b=turnPairBounds(p);assert.ok(Math.abs(b.lower-0.5)<1e-12);assert.ok(Math.abs(b.upper-0.95)<1e-12);
 const node={lower:0,upper:1,pairs:[[p]]};assert.equal(backupTurnBounds(node),true);assert.equal(node.lower,b.lower);
});
test('Threshold queries report uncertainty instead of inventing a binary result',()=>{
 assert.equal(thresholdDecision(0.6,0.8,0.5),'above');assert.equal(thresholdDecision(0.1,0.4,0.5),'below');
 assert.equal(thresholdDecision(0.4,0.6,0.5),'unresolved');
});
test('Threshold proofs stop early and probability bisection reuses their work',()=>{
 let visits=0;
 const adapter={key:s=>s.id,terminal:s=>s.value??null,actions:()=>[[0],[0]],transitions:s=>{
  visits++;
  if(s.id==='root')return [{probability:0.55,state:{id:'win',value:1}},{probability:0.3,state:{id:'lose',value:0}},
   {probability:0.15,state:{id:'future',n:0}}];
  return [{probability:1,state:s.n===20?{id:'end',value:0.6}:{id:'future'+(s.n+1),n:s.n+1}}];
 }};
 const session={},proof=searchFrontier(adapter,{id:'root'},{session,maxDepth:64,timeMs:1000,targetProbability:0.5});
 assert.equal(proof.threshold_answer,'above');assert.equal(proof.complete,false);assert.equal(visits,1);
 const completed=searchProbabilityThresholds(adapter,{id:'root'},{session,progressive:true,maxDepth:64,timeMs:1000});
 assert.ok(completed.lower<=0.64+1e-12&&completed.upper>=0.64-1e-12);
 assert.equal(completed.complete,true);assert.ok(completed.threshold_queries>=2);
 visits=0;
 const recursive=searchBattle(adapter,{id:'root'},{maxDepth:64,timeMs:1000,targetProbability:0.5});
 assert.equal(recursive.threshold_answer,'above');assert.equal(recursive.complete,false);assert.equal(visits,1);
 const binary=searchProbabilityThresholds(adapter,{id:'root'},{maxDepth:64,timeMs:1000});
 assert.ok(binary.lower<=0.64+1e-12&&binary.upper>=0.64-1e-12);assert.equal(binary.complete,true);
});
