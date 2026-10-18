import test from 'node:test';
import assert from 'node:assert/strict';
import calculator from '../vendor/run-bun/index.js';
import util from '../vendor/run-bun/mechanics/util.js';
import {analyzeBattle} from '../analysis/threat.mjs';
import {actionOpportunity} from '../run-bun/actions.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';

test('Arena Wooper certifies at least 99% against Machop even when two low Earthquakes fail to KO',()=>{
 const side=(species,level,moves,stats,ability)=>({species,current_hp:58,actual_stats:stats,
  build:{level,moves,boosts:{},item:'',ability,nature:'Serious'},effects:{},pp:Object.fromEntries(moves.map(m=>[m,10]))});
 const snapshot={generation:8,field:{},
  player:side('Wooper',20,['Earthquake','Water Pulse','Recover','Endure'],{hp:58,atk:29,def:29,spe:17,spa:21,spd:21},'Water Absorb'),
  opponent:side('Machop',18,['Leer','Tackle'],{hp:58,atk:39,def:28,spe:23,spa:23,spd:23},'Guts')};
 const session={};let result;
 for(let pass=0;pass<16;pass++){
  result=analyzeBattle(snapshot,calculator,util.getFinalSpeed,actionOpportunity,hitChance,
   {progressive:true,session,maxDepth:64,timeMs:3000,criticalRates:[1/16,1/8,1/2,1]});
  if(result.outlook.upper_bound-result.outlook.lower_bound<=1)break;
 }
 const move=result.outgoing_moves.find(m=>m.name==='Earthquake');
 assert.equal(move.min,27);assert.equal(move.max,33);assert.ok(2*move.min<58);
 assert.ok(result.outlook.lower_bound>=99,JSON.stringify(result.outlook));assert.equal(result.outlook.upper_bound,100);
 assert.ok(result.outlook.unresolved<=0.01);
});
