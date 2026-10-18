import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenarios} from '../test-ground/runner.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';
import calculator from '../vendor/run-bun/index.js';

test('Reusable test-ground matrix covers status action and accuracy cases',async()=>{
 const rows=await runScenarios();assert.equal(rows.length,22);assert.ok(rows.some(r=>r.name==='Accuracy -1 and evasion +1'&&r.hit===60));
});

test('Accuracy/evasion stage limits and exact multipliers are bounded',()=>{
 const g=calculator.Generations.get(8),move=new calculator.Move(g,'Tackle');
 for(const [accuracy,evasion,expected] of [[1,0,100],[-1,0,75],[-2,0,60],[-6,0,33],[0,1,75],[6,0,100],[0,6,33]]){
  const a=new calculator.Pokemon(g,'Garchomp',{boosts:{accuracy,evasion:0}}),b=new calculator.Pokemon(g,'Garchomp',{boosts:{accuracy:0,evasion}});
  assert.equal(hitChance({},a,b,move).accuracy,expected,`accuracy=${accuracy}, evasion=${evasion}`);
 }
});
