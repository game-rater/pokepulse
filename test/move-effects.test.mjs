import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateOutlook} from '../analysis/outlook.mjs';
import {displayEstimate} from '../run-bun/display-estimate.mjs';
function duel(extra={}){
 const side={build:{boosts:{},item:'',moves:['Bite']},effects:{},pp:{Bite:5}};
 const mons=[{curHP:()=>1,maxHP:()=>2,status:'',ability:'',types:[]},{curHP:()=>2,maxHP:()=>2,status:'',ability:'',types:[]}];
 const row=(speed,extra={})=>[{name:'Bite',available:true,damage_rolls:[1],hit_chance:1,priority:0,speed,...extra}];
 return simulateOutlook({player:side,opponent:side,field:{}},row(10,extra),row(5),...mons,{timeMs:1000,maxDepth:20});
}
test('Bite flinch can prevent the queued slower attack but cannot persist into another turn',()=>{
 assert.equal(duel().upper_bound,0);
 const r=duel({flinch:0.3});assert.ok(Math.abs(r.lower_bound-30)<1e-8);assert.ok(Math.abs(r.upper_bound-30)<1e-8);
});
test('Draining damage heals its user before the opposing queued attack',()=>{
 assert.equal(duel({drain:1}).lower_bound,100);
});
test('Narrowing an unfinished upper bound preserves an admissible displayed estimate',()=>{
 const r={victory:0,outlook:{lower_bound:0,upper_bound:24.3275,unresolved:0.243275}};
 assert.equal(displayEstimate(r,16.35437).score,16.35437);
 assert.equal(displayEstimate({...r,outlook:{lower_bound:0,upper_bound:10,unresolved:0.1}},16.35437).score,10);
 assert.equal(displayEstimate({victory:0,outlook:{lower_bound:0,upper_bound:0,unresolved:0}},16.35437).score,0);
});
