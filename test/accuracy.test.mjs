import test from 'node:test';
import assert from 'node:assert/strict';
import {runScenarios} from '../test-ground/runner.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';
import calculator from '../vendor/run-bun/index.js';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('Reusable test-ground matrix covers status action and accuracy cases',async()=>{
 // These fixtures assert per-action mechanics, not eventual search convergence.
 const rows=await runScenarios(undefined,{searchOptions:{timeMs:0}});
 assert.ok(rows.length>0);assert.ok(rows.some(r=>r.name==='Accuracy -1 and evasion +1'&&r.hit===60));
});

test('Scenario runner rejects a wrong expected result and an unsupported scenario schema',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-scenarios-')),file=join(directory,'scenarios.json');
 try{
  const suite=JSON.parse(await readFile(new URL('../test-ground/scenarios/run-bun.json',import.meta.url),'utf8'));
  suite.scenarios=[{name:'Deliberately incorrect hit chance',expected:{hit:1}}];
  await writeFile(file,JSON.stringify(suite),'utf8');
  await assert.rejects(runScenarios(file,{searchOptions:{timeMs:0}}),/expected hit=1, got 100/);
  suite.schema_version=99;await writeFile(file,JSON.stringify(suite),'utf8');
  await assert.rejects(runScenarios(file),/Unsupported test-ground scenario schema/);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('Accuracy/evasion stage limits and exact multipliers are bounded',()=>{
 const g=calculator.Generations.get(8),move=new calculator.Move(g,'Tackle');
 for(const [accuracy,evasion,expected] of [[1,0,100],[-1,0,75],[-2,0,60],[-6,0,33],[0,1,75],[6,0,100],[0,6,33]]){
  const a=new calculator.Pokemon(g,'Garchomp',{boosts:{accuracy,evasion:0}}),b=new calculator.Pokemon(g,'Garchomp',{boosts:{accuracy:0,evasion}});
  assert.equal(hitChance({},a,b,move).accuracy,expected,`accuracy=${accuracy}, evasion=${evasion}`);
 }
});
