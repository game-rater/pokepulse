import test from 'node:test';
import assert from 'node:assert/strict';
import {refineUntilResolved} from '../run-bun/refinement.mjs';
import {searchBattle} from '../analysis/search.mjs';
test('Live-style bounded refinement spends later passes at the same short depth',async()=>{
 const depths=[];
 await refineUntilResolved({depthLimit:4,pauseMs:0,obsolete:()=>depths.length>=10,
  run:options=>{depths.push(options.maxDepth);return {outlook:{elapsed_ms:20,budget_exhausted:false}};},publish:()=>{}});
 assert.deepEqual(depths,Array(10).fill(4));
});

test('Missing live input stops refinement after publishing the unresolved result',async()=>{
  let runs=0,published=0;
  await refineUntilResolved({pauseMs:0,obsolete:()=>false,
    run:()=>{runs++;return {outlook:{complete:false,input_blocked:true,elapsed_ms:0}};},
    publish:()=>published++});
  assert.equal(runs,1);assert.equal(published,1);
});

test('Continuous refinement publishes beyond the former three passes, then stops on resolution',async()=>{
  const passes=[];
  await refineUntilResolved({pauseMs:0,budgets:[1,2,3],obsolete:()=>false,
    run:options=>({outlook:{complete:options.maxDepth>=256,elapsed_ms:20}}),
    publish:(result,options)=>passes.push({result,...options})});
  assert.equal(passes.length,10);
  assert.deepEqual(passes.map(p=>p.timeMs),[1,2,3,3,3,3,3,3,3,3]);
  assert.ok(passes[4].maxDepth>passes[0].maxDepth);
  assert.ok(passes[4].matrixIterations>passes[0].matrixIterations);
});

test('A replaced state suppresses the in-flight result and ends refinement',async()=>{
  let obsolete=false,published=0,runs=0;
  await refineUntilResolved({obsolete:()=>obsolete,
    run:()=>{runs++;obsolete=true;return {outlook:{complete:false}};},
    publish:()=>published++});
  assert.equal(runs,1);assert.equal(published,0);
});

test('Default refinement publishes short time slices continuously',async()=>{
 const times=[];
 await refineUntilResolved({pauseMs:0,obsolete:()=>false,
  run:options=>{times.push(options.timeMs);return {outlook:{complete:times.length===4,elapsed_ms:20}};},
  publish:()=>{}});
 assert.deepEqual(times,[150,250,250,250]);
});

test('Depth refinement resolves a deterministic game beyond the former 128-turn limit',async()=>{
  const adapter={key:String,terminal:s=>s>=180?1:null,actions:()=>[[0],[0]],
    transitions:s=>[{state:s+1,probability:1}]};
  const session={},results=[];
  await refineUntilResolved({pauseMs:0,budgets:[1000],obsolete:()=>false,
    run:options=>({outlook:searchBattle(adapter,0,{...options,session})}),
    publish:r=>results.push(r.outlook)});
  assert.equal(results.length,8);assert.equal(results.at(-1).lower,1);
});

test('Repeated refinement contracts a probabilistic self-loop without infinite recursion',()=>{
  const adapter={key:String,terminal:s=>s==='win'?1:null,actions:()=>[[0],[0]],
    transitions:()=>[{state:'start',probability:0.5},{state:'win',probability:0.5}]};
  const session={};let result;
  for(let pass=0;pass<20;pass++){
    result=searchBattle(adapter,'start',{session,timeMs:1000,maxDepth:100000});
    if(result.complete)break;
  }
  assert.equal(result.complete,true);assert.ok(result.lower>=0.998);
  assert.equal(result.upper,1);
});

test('Budget-limited refinement deepens instead of remaining stuck at a shallow horizon',async()=>{
 const depths=[];
 await refineUntilResolved({pauseMs:0,budgets:[1],obsolete:()=>depths.length>=9,
  run:o=>{depths.push(o.maxDepth);return {outlook:{complete:false,budget_exhausted:true,elapsed_ms:20}};},publish:()=>{}});
 assert.deepEqual(depths,[4,4,4,4,8,8,8,8,16]);
});

test('Successive bounded passes cover action choices instead of starving a later winning continuation',()=>{
 const session={};
 const adapter={key:String,terminal:s=>s==='win'?1:null,
  actions:s=>s==='root'?[[0,1],[0]]:[[0],[0]],
  transitions:(s,a)=>[{probability:1,state:s==='root'?(a===0?'slow':'quick'):s==='quick'?'win':s+'x'}]};
 const first=searchBattle(adapter,'root',{session,maxNodes:2,maxDepth:20,timeMs:1000});
 assert.equal(first.lower,0);
 const next=searchBattle(adapter,'root',{session,maxNodes:2,maxDepth:20,timeMs:1000});
 assert.equal(next.lower,1);assert.equal(next.complete,true);
});

test('Budget-limited passes prioritize every action pair, including off-diagonal pairs',()=>{
 const session={},firstPairs=[];let first;
 const adapter={key:String,terminal:()=>null,actions:s=>s==='root'?[[0,1,2],[0,1,2]]:[[0],[0]],
 transitions:(s,a,b)=>{if(s==='root'&&first===undefined)first=[a,b];return [{state:s+'x',probability:1}];}};
 for(let pass=0;pass<9;pass++){first=undefined;searchBattle(adapter,'root',{session,maxNodes:1,maxDepth:10,timeMs:1000});firstPairs.push(first.join(','));}
 assert.equal(new Set(firstPairs).size,9);
});
