import test from 'node:test';
import assert from 'node:assert/strict';
import {assessInitialEstimate} from '../scripts/prediction-target.mjs';
import {assessStallRows} from '../scripts/check-stall-benchmarks.mjs';
import {stallFixtures} from '../scripts/stall-benchmark-fixtures.mjs';
import {benchmarkReference} from '../scripts/benchmark-oracles.mjs';
test('300ms goal accepts a useful estimate strictly before the deadline, never a late one',()=>{
 assert.equal(assessInitialEstimate([{elapsed_ms:299.999,score:40}],50).goal_met,true);
 assert.equal(assessInitialEstimate([{elapsed_ms:300,score:50}],50).goal_met,false);
 assert.equal(assessInitialEstimate([{elapsed_ms:301,score:50}],50).score,null);
 assert.equal(assessInitialEstimate([{elapsed_ms:0,score:50}],50).goal_met,true);
 assert.equal(assessInitialEstimate([{elapsed_ms:200,score:39.99}],50).goal_met,false);
});
test('Later accuracy cannot rewrite an early miss and unknown targets do not acquire accuracy certificates',()=>{
 const r=assessInitialEstimate([{elapsed_ms:100,score:1},{elapsed_ms:400,score:50}],50);assert.equal(r.score,1);assert.equal(r.goal_met,false);
 assert.equal(assessInitialEstimate([{elapsed_ms:100,score:50}],undefined).goal_met,null);
 for(const score of [null,NaN,Infinity,101,-1])assert.equal(assessInitialEstimate([{elapsed_ms:100,score}],50).goal_met,false);
});
test('A legacy one-second benchmark is not evidence of reaching the new 300ms goal',()=>{
 const f=stallFixtures[0],reference=benchmarkReference(f),row={case:f.id,fixture_hash:reference.input_sha256,reference,first_second:{score:100,available_at_ms:500},score:100};
 const old=assessStallRows([row])[0];assert.equal(old.first_second_pass,true);assert.equal(old.pass,false);
 row.initial_estimate={score:100,available_at_ms:299};assert.equal(assessStallRows([row])[0].pass,true);
 row.initial_estimate.available_at_ms=300;assert.equal(assessStallRows([row])[0].pass,false);
});
