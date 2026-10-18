import test from 'node:test';
import assert from 'node:assert/strict';
import {criticalProbability} from '../analysis/threat.mjs';
import {simulateOutlook} from '../analysis/outlook.mjs';
test('Run & Bun critical rates honor stage, items, armor, and fixed damage',()=>{
 const rates=[1/16,1/8,1/2,1],mon={name:'Rattata',ability:'',item:''},target={ability:'',status:''};
 const move={name:'Hyper Fang',category:'Physical'};
 assert.equal(criticalProbability(move,mon,target,{},rates),1/16);
 assert.equal(criticalProbability(move,{...mon,item:'Scope Lens'},target,{},rates),1/8);
 assert.equal(criticalProbability({...move,name:'Slash'},{...mon,item:'Scope Lens'},target,{},rates),1/2);
 assert.equal(criticalProbability(move,mon,{ability:'Battle Armor'}, {},rates),0);
 assert.equal(criticalProbability({...move,name:'Seismic Toss'},mon,target,{},rates),0);
});
test('A rare critical KO is included in the forecast instead of certifying a win',()=>{
 const side={build:{status:'',boosts:{},item:''},effects:{}};
 const snapshot={player:structuredClone(side),opponent:structuredClone(side),field:{}};
 const mon=hp=>({curHP:()=>hp,maxHP:()=>hp,status:'',ability:'',types:['Normal']});
 const row=(damage,speed)=>({name:'Tackle',available:true,min:damage,max:damage,damage_rolls:[damage],hit_chance:1,priority:0,speed});
 const enemy={...row(1,2),damage_distribution:[{damage:1,probability:15/16},{damage:10,probability:1/16}]};
 const result=simulateOutlook(snapshot,[row(5,1)],[enemy],mon(10),mon(5),{maxDepth:1,timeMs:3000});
 assert.ok(Math.abs(result.lower_bound-93.75)<1e-9);
 assert.ok(Math.abs(result.upper_bound-93.75)<1e-9);
});
