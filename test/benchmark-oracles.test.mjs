import test from 'node:test';
import assert from 'node:assert/strict';
import {accuracyFixtures} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {realBattleFixtures} from '../scripts/real-battle-fixtures.mjs';
import {analyticOracle,benchmarkReference} from '../scripts/benchmark-oracles.mjs';
const targets=[100,0,50,80,75,72.9,90];
for(const [i,f] of accuracyFixtures.entries())test(`${f.id}: independent exact target and both policy references`,()=>{
 assert.equal(analyticOracle(f).expected_percent,targets[i]);
 for(const model of ['minimax','npc-ai']){
  const r=benchmarkReference(f,model);assert.equal(r.status,'analytic');assert.equal(r.expected_percent,targets[i]);
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
