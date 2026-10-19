import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('Ready-worker benchmark normalizes a fixture and publishes an independently referenced result',()=>{
 const result=spawnSync(process.execPath,['scripts/benchmark-live-response.mjs','--case=strategy-recover-1','--trials=1'],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
 const row=JSON.parse(result.stdout.trim());
 assert.equal(row.error,null);
 assert.equal(row.mode,'preloaded-worker');
 assert.ok(row.first_estimate_ms>=0);
 assert.ok(row.readings.some(r=>Number.isFinite(r.score)));
 assert.ok(Math.abs(row.readings.at(-1).score-row.reference.expected_percent)<1e-8);
 // Timing is measured in isolated performance runs, never asserted under suite load.
});
