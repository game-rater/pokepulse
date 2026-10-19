import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreTemporalFeatures} from '../analysis/temporal-feature-model.mjs';

function facts(){return {sides:[0,1].map(()=>({hp:100,maxhp:100,substituteHP:0,stall:false,sleep:0,speed:50})),
 actions:[0,1].map(()=>({attack:10,healing:0,protectPP:0,otherPP:20,pp:20,futureAttack:10,recoil:25})),
 passive:{clock:[Infinity,Infinity],net:[0,0],burst:[0,0],initial:[100,100],steps:0},trickRoom:false};}
test('Pure temporal model is symmetric, responds to HP and preserves measured facts',()=>{
 const input=facts(),before=structuredClone(input),result=scoreTemporalFeatures(input);
 assert.equal(result.value,0.5);assert.deepEqual(result.lifetime.map(s=>s.turns),[10,10]);
 assert.deepEqual(input,before);
 input.sides[0].hp=50;assert.ok(scoreTemporalFeatures(input).value<0.5);
});
test('Pure initiative scoring reverses under Trick Room',()=>{
 const input=facts();input.sides[0].speed=60;
 const normal=scoreTemporalFeatures(input).value;
 assert.equal(normal,1/(1+Math.exp(-0.1)));
 input.trickRoom=true;assert.ok(Math.abs(scoreTemporalFeatures(input).value-(1-normal))<1e-12);
});
