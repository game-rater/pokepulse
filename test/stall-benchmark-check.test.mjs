import test from 'node:test';
import assert from 'node:assert/strict';
import {assessStallRows} from '../scripts/check-stall-benchmarks.mjs';
import {stallFixtures} from '../scripts/stall-benchmark-fixtures.mjs';
import {benchmarkReference} from '../scripts/benchmark-oracles.mjs';
function row(){const reference=benchmarkReference(stallFixtures[0],'minimax');return {case:stallFixtures[0].id,opponent_model:'minimax',fixture_hash:reference.input_sha256,reference,initial_estimate:{score:100,available_at_ms:200},first_second:{score:100,available_at_ms:500},score:100};}
test('Accuracy acceptance passes an independently correct prediction',()=>assert.equal(assessStallRows([row()])[0].pass,true));
test('A confident but wrong stall estimate fails acceptance',()=>{const r=row();r.first_second.score=r.score=2;const a=assessStallRows([r])[0];assert.equal(a.pass,false);assert.equal(a.error_at_one_second_pp,98);});
test('An estimate after the deadline cannot count retrospectively',()=>{const r=row();r.first_second.available_at_ms=1001;assert.equal(assessStallRows([r])[0].first_second_pass,false);});
test('Later refinement must not move outside the error budget',()=>{const r=row();r.score=2;const a=assessStallRows([r])[0];assert.equal(a.first_second_pass,true);assert.equal(a.final_pass,false);});
test('Blocked or unavailable predictions fail accuracy acceptance',()=>{for(const r of [{...row(),input_blocked:true},{...row(),first_second:{score:null},score:null}])assert.equal(assessStallRows([r])[0].pass,false);});
test('Acceptance refuses changed inputs and rebased targets',()=>{for(const r of [{...row(),fixture_hash:'changed'},{...row(),reference:{expected_percent:2}}])assert.throws(()=>assessStallRows([r]),/Stale or changed/);});
test('Empty runs and unrelated cases are not passing coverage',()=>{assert.throws(()=>assessStallRows([]),/No benchmark/);assert.throws(()=>assessStallRows([{case:'unregistered'}]),/Unknown benchmark/);});

test('Historical one-second diagnostics include their time and error boundaries',()=>{
 for(const time of [0,1000]){
  const r=row();r.first_second={score:90,available_at_ms:time};r.score=90;assert.equal(assessStallRows([r])[0].pass,true);
 }
 const outside=row();outside.first_second.score=89.999;assert.equal(assessStallRows([outside])[0].first_second_pass,false);
});

test('Invalid probabilities and nonnumeric timestamps cannot pass the benchmark acceptance check',()=>{
 for(const value of [101,Infinity,NaN]){
  const r=row();r.first_second.score=r.score=value;const a=assessStallRows([r])[0];assert.equal(a.first_second_pass,false);assert.equal(a.final_pass,false);
 }
 for(const time of ['500',-1,NaN,Infinity]){
  const r=row();r.first_second.available_at_ms=time;assert.equal(assessStallRows([r])[0].first_second_pass,false);
 }
 const fixture=stallFixtures.find(f=>f.id==='stall-pp-exhaustion'),reference=benchmarkReference(fixture);
 const r={...row(),case:fixture.id,fixture_hash:reference.input_sha256,reference,score:-1,first_second:{score:-1,available_at_ms:500}};
 assert.equal(assessStallRows([r])[0].pass,false);
});
