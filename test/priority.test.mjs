import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBattle} from '../analysis/search.mjs';

const solve=(adapter,options={})=>searchBattle(adapter,'root',{progressive:true,timeMs:1000,maxDepth:128,...options});
test('A promising deep strategy is resolved before broad distracting choices',()=>{
 const adapter={key:String,terminal:s=>s==='win'?1:s==='lose'?0:null,
  actions:s=>s==='root'?[[0,1],[0]]:[[0],[0]],
  transitions:(s,a)=>[{state:s==='root'?a===0?'d0':'p0':s[0]==='p'?+s.slice(1)===4?'win':`p${+s.slice(1)+1}`:`d${+s.slice(1)+1}`,probability:1}]};
 const result=solve(adapter,{maxNodes:7,evaluate:s=>s.startsWith('p')?0.9:0.1});
 assert.equal(result.lower,1);assert.equal(result.complete,true);
});
test('Equal influence prefers the cheaper unresolved ending',()=>{
 const session={};const adapter={key:String,terminal:s=>s==='win'?1:null,actions:()=>[[0],[0]],
  transitions:s=>s==='root'?[{state:'costly',probability:0.5},{state:'cheap',probability:0.5}]:[{state:'win',probability:1}]};
 const result=solve(adapter,{session,maxNodes:2,workEstimate:s=>s==='costly'?4:1});
 assert.ok(session.graph.get('cheap').edges);assert.equal(session.graph.get('costly').edges,null);assert.equal(result.lower,0.5);
});
test('Rare outcomes remain included rather than being renormalized away',()=>{
 const adapter={key:String,terminal:s=>s==='win'?1:s==='lose'?0:null,actions:()=>[[0],[0]],
  transitions:s=>s==='root'?[{state:'win',probability:0.999},{state:'rare',probability:0.001}]:[{state:'lose',probability:1}]};
 const r=solve(adapter,{tolerance:0});assert.equal(r.lower,0.999);assert.equal(r.upper,0.999);
});
test('Fair exploration finds a winning choice despite a misleading estimate',()=>{
 const session={};const adapter={key:String,terminal:s=>s==='win'?1:null,actions:s=>s==='root'?[[0,1],[0]]:[[0],[0]],
  transitions:(s,a)=>[{state:s==='root'?a===0?'d0':'hidden':s==='hidden'?'win':`d${+s.slice(1)+1}`,probability:1}]};
 const r=solve(adapter,{session,maxNodes:25,evaluate:s=>s==='hidden'?0:0.9});
 assert.equal(r.lower,1);assert.ok(session.graph.get('hidden').edges);
});
test('Priority changes preserve exhaustive mixed-strategy values and every opponent action',()=>{
 const adapter={key:String,terminal:s=>typeof s==='number'?s:null,actions:s=>[[0,1],[0,1]],transitions:(s,a,b)=>s==='root'?
  [{state:`${a}${b}`,probability:1}]:[{state:s==='00'||s==='11'?1:0,probability:1}]};
 const r=solve(adapter,{evaluate:s=>s==='00'?0.99:0.01});
 assert.ok(r.lower<=0.5&&r.upper>=0.5);assert.ok(r.upper-r.lower<0.01);
});
test('Certified inferior player actions do not expand their unfinished children',()=>{
 const session={};const adapter={key:String,terminal:s=>s==='win'?1:s==='lose'?0:null,actions:s=>s==='root'?[[0,1],[0]]:[[0],[0]],
  transitions:(s,a)=>s==='root'?a===0?[{state:'win',probability:0.8},{state:'lose',probability:0.2}]:[{state:'lose',probability:0.9},{state:'pending',probability:0.1}]:[{state:'win',probability:1}]};
 const r=solve(adapter,{session});assert.equal(r.lower,0.8);assert.equal(r.upper,0.8);assert.ok(r.pruned_actions>0);assert.equal(session.graph.get('pending').edges,null);
});

test('Deepening revisits deferred leaves without draining unrelated queued work',()=>{
 const session={};const adapter={key:String,terminal:s=>s==='win'?1:null,actions:s=>s==='root'?[[0,1],[0]]:[[0],[0]],
  transitions:(s,a)=>[{state:s==='root'?a===0?'next':'distraction':s==='next'?'win':`distraction${s.length}`,probability:1}]};
 solve(adapter,{session,maxNodes:1,maxDepth:1,evaluate:s=>s==='next'?0.9:0.1});
 solve(adapter,{session,maxNodes:1,maxDepth:1,evaluate:s=>s==='next'?0.9:0.1});
 const r=solve(adapter,{session,maxNodes:1,maxDepth:2,evaluate:s=>s==='next'?0.9:0.1});
 assert.equal(r.lower,1);
});

test('Focused strategy certifies a short win across every opponent response',()=>{
 const session={};const adapter={key:JSON.stringify,terminal:s=>s.turn===3?1:null,
  actions:()=>[[0,1],[0,1]],transitions:(s,a,b)=>[{state:{turn:a===0?s.turn+1:s.turn,enemy:b},probability:0.6},{state:{turn:a===0?s.turn+1:s.turn,enemy:1-b},probability:0.4}]};
 const r=searchBattle(adapter,{turn:0,enemy:0},{progressive:true,focusedStrategy:true,session,maxDepth:4,timeMs:1000,evaluate:s=>s.turn/3});
 assert.equal(r.lower,1);assert.equal(r.upper,1);assert.ok(r.nodes<20);
});
