import test from 'node:test';
import assert from 'node:assert/strict';
import {accuracyFixtures} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {realBattleFixtures} from '../scripts/real-battle-fixtures.mjs';
import {analyticOracle,benchmarkReference} from '../scripts/benchmark-oracles.mjs';
const targets={'oracle-fixed-win':100,'oracle-fixed-loss':0,'oracle-speed-tie':50,'oracle-focus-blast':80,'oracle-paralysis':75,'oracle-triple-axel':72.9,'oracle-skill-link-axel':90,'oracle-focus-three':99.2,'oracle-paralysis-three':98.4375,'oracle-sash-paralysis':93.75,'oracle-poison-window':80,'oracle-choice-guaranteed':100,'oracle-choice-adaptive':81};
for(const f of accuracyFixtures)test(`${f.id}: independent exact target and both policy references`,()=>{
 assert.equal(analyticOracle(f).expected_percent,targets[f.id]);
 for(const model of ['minimax','npc-ai']){
  const r=benchmarkReference(f,model);assert.equal(r.status,'analytic');assert.equal(r.expected_percent,targets[f.id]);
  assert.match(r.input_sha256,/^[a-f0-9]{64}$/);
 }
});
test('Every existing battle scenario has an explicit reference assessment for both models',()=>{
 for(const f of realBattleFixtures)for(const model of ['minimax','npc-ai']){
  const r=benchmarkReference(f,model);
  const solved=model==='minimax'&&['drednaw-lunatone-triggered','drednaw-lunatone-asleep'].includes(f.id);
  assert.equal(r.status,solved?'analytic':'unresolved');
  assert.equal(r.expected_percent,solved?0:undefined);
 }
});
test('Changing an input invalidates its frozen reference',()=>{
 const changed=structuredClone(accuracyFixtures[0]);changed.snapshot.player.current_hp--;
 assert.throws(()=>benchmarkReference(changed),/stale reference/);
});
test('Unregistered cases cannot acquire an accuracy target from an expected field',()=>{
 assert.equal(benchmarkReference({id:'new-case',expected:99}).status,'unresolved');
});
test('Proof refuses stale actual stats even outside the registry',()=>{
 const changed=structuredClone(accuracyFixtures[0]);changed.snapshot.player.actual_stats.spe++;
 assert.throws(()=>analyticOracle(changed),/actual stats/);
});
import {spawnSync} from 'node:child_process';
test('Accuracy runner rejects an unresolved case before starting trials',()=>{
 const child=spawnSync(process.execPath,['scripts/benchmark-retained-turn.mjs','--case=monferno-scraggy-initial','--require-reference'],{encoding:'utf8'});
 assert.notEqual(child.status,0);assert.match(child.stderr,/No accuracy reference/);assert.equal(child.stdout,'');
});

test('Complex proofs require their survival, poison and damage conditions',()=>{
 for(const id of ['oracle-focus-three','oracle-paralysis-three','oracle-sash-paralysis','oracle-poison-window','oracle-choice-guaranteed','oracle-choice-adaptive']){
  const changed=structuredClone(accuracyFixtures.find(f=>f.id===id));changed.snapshot.player.current_hp=1;
  assert.throws(()=>analyticOracle(changed),/Oracle precondition/);
 }
});
