import test from 'node:test';
import assert from 'node:assert/strict';
import calculator from '../vendor/run-bun/index.js';
import util from '../vendor/run-bun/mechanics/util.js';
import {analyzeBattle} from '../analysis/threat.mjs';
import {actionOpportunity} from '../run-bun/actions.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';

test('Identical arena Wooper certify the 50% value within the live one-point tolerance',()=>{
  const side={species:'Wooper',current_hp:58,
    actual_stats:{hp:58,atk:29,def:29,spe:17,spa:21,spd:21},
    build:{level:20,moves:['Earthquake'],boosts:{},item:'',ability:'Water Absorb',nature:'Serious'},
    effects:{},pp:{Earthquake:10}};
  const snapshot={generation:8,field:{},player:structuredClone(side),opponent:structuredClone(side)};
  const session={};let result;
  for(let pass=0;pass<20;pass++){
    result=analyzeBattle(snapshot,calculator,util.getFinalSpeed,actionOpportunity,hitChance,
      {progressive:true,session,maxDepth:8,timeMs:200,criticalRates:[1/16,1/8,1/2,1]});
    if(result.outlook.complete)break;
  }
  assert.equal(result.outlook.complete,true);
  assert.ok(result.outlook.lower_bound<=50+1e-8);
  assert.ok(result.outlook.upper_bound>=50-1e-8);
  assert.ok(result.outlook.upper_bound-result.outlook.lower_bound<=1+1e-8);
  assert.equal(Math.round((result.outlook.lower_bound+result.outlook.upper_bound)/2),50);
  assert.ok(session.graph.size>0,'Result must come from the search, not a demo score override');
});
