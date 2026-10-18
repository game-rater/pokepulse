import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBattle} from '../analysis/search.mjs';

test('Equivalent children across action pairs occupy only one frontier entry',()=>{
 const session={};
 const adapter={key:String,terminal:s=>s==='win'?1:null,actions:()=>[[0,1,2,3],[0,1,2,3]],transitions:s=>[{state:s==='root'?'next':'win',probability:1}]};
 const first=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000});
 assert.equal(first.frontier_pending,1);assert.equal(session.frontier.queued.size,1);
 const done=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000});
 assert.equal(done.lower,1);assert.equal(done.upper,1);
});
test('Persistent frontier solves an analytic stochastic game over bounded slices',()=>{
 const adapter={key:String,terminal:s=>s==='win'?1:s==='lose'?0:null,actions:()=>[[0],[0]],transitions:s=>s==='root'?[{state:'next',probability:1}]:[{state:'win',probability:0.7},{state:'lose',probability:0.3}]};
 const session={};let result=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000});assert.equal(result.complete,false);
 result=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000});assert.equal(result.complete,true);assert.equal(result.lower,0.7);assert.equal(result.upper,0.7);
 const warm=searchBattle(adapter,'next',{progressive:true,session,timeMs:0});assert.equal(warm.nodes,0);assert.equal(warm.lower,0.7);
});
test('Persistent frontier retains mixed-strategy matrix bounds',()=>{
 const adapter={key:String,terminal:s=>typeof s==='number'?s:null,actions:()=>[[0,1],[0,1]],transitions:(s,a,b)=>[{state:a===b?1:0,probability:1}]};
 const r=searchBattle(adapter,'root',{progressive:true,timeMs:1000});assert.ok(r.lower<=0.5&&r.upper>=0.5);assert.ok(r.upper-r.lower<0.01);
});
test('Persistent frontier contracts exit cycles and preserves unsupported uncertainty',()=>{
 const adapter={key:String,terminal:s=>s==='win'?1:null,actions:()=>[[0],[0]],transitions:()=>[{state:'root',probability:0.5},{state:'win',probability:0.5}]};
 const session={};let r;for(let i=0;i<8;i++)r=searchBattle(adapter,'root',{progressive:true,session,timeMs:1000});assert.ok(r.lower>0.998);assert.equal(r.upper,1);
 const unknown=searchBattle({key:String,terminal:()=>null,actions:()=>[[],[]]},'root',{progressive:true,timeMs:1000});assert.equal(unknown.lower,0);assert.equal(unknown.upper,1);
});

test('Probability-weighted partial estimates update without converting heuristics into bounds',()=>{
 const adapter={key:String,terminal:s=>s==='win'?1:s==='lose'?0:null,actions:()=>[[0],[0]],transitions:s=>s==='root'?[{state:'win',probability:0.5},{state:'pending',probability:0.5}]:[{state:'lose',probability:1}]};
 const session={};const first=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000,evaluate:()=>0.2});
 assert.equal(first.lower,0.5);assert.equal(first.upper,1);assert.ok(Math.abs(first.partial_estimate-0.6)<1e-8);
 const next=searchBattle(adapter,'root',{progressive:true,session,maxNodes:1,timeMs:1000,evaluate:()=>0.2});
 assert.equal(next.lower,0.5);assert.equal(next.upper,0.5);assert.equal(next.partial_estimate,0.5);
});

// A slice that can visit only one node must eventually reach its queued child.
test('Time slices resume beyond an expensive retained prefix',()=>{
 const session={};let checks=0;
 const adapter={key:String,terminal:s=>s==='win'?1:null,actions:()=>[[0],[0]],transitions:s=>[{state:s==='root'?'next':'win',probability:1}]};
 const options={progressive:true,session,timeMs:1000,shouldStop:()=>++checks>1};
 let result=searchBattle(adapter,'root',options);
 assert.equal(result.complete,false);
 checks=0;result=searchBattle(adapter,'root',options);
 assert.equal(result.nodes,1);assert.equal(result.complete,true);assert.equal(result.lower,1);
 assert.equal(session.graph.size,3);
});
