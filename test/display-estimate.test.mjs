import test from 'node:test';
import assert from 'node:assert/strict';
import {displayEstimate} from '../run-bun/display-estimate.mjs';
const display=(outlook,previous)=>displayEstimate({outlook},previous);

test('Uninformative or blocked forecasts clear a previous number; proven endpoints replace it',()=>{
 for(const outlook of [{lower_bound:0,upper_bound:100,unresolved:1},{lower_bound:70,upper_bound:20},{lower_bound:NaN,upper_bound:50},{lower_bound:50,upper_bound:50,input_blocked:true}])assert.equal(display(outlook,98).score,null);
 for(const score of [0,50,100])assert.deepEqual(display({lower_bound:score,upper_bound:score},98),{score,kind:'proven-value'});
});

test('An unfinished display clamps retained estimates into current bounds and uses a midpoint without one',()=>{
 const bounds={lower_bound:10,upper_bound:40};
 for(const [previous,expected] of [[0,10],[25,25],[98,40],[undefined,25]])assert.equal(display(bounds,previous).score,expected);
 const narrow={lower_bound:0,upper_bound:24.3275};assert.equal(display(narrow,16.35437).score,16.35437);
 assert.equal(display({...narrow,upper_bound:10},16.35437).score,10);
});

test('Only usable approximate results supply a point; provisional points replace stale held values',()=>{
 const approximation={approximate:true,provisional_usable:true,provisional_score:63,lower_bound:0,upper_bound:100};
 assert.equal(display(approximation,98).score,63);
 for(const point of [null,NaN,Infinity])assert.equal(display({...approximation,provisional_score:point},98).score,null);
 assert.equal(display({...approximation,provisional_usable:false},98).score,null);
 assert.equal(display({lower_bound:10,upper_bound:40,provisional_score:30},12).score,30);
});
