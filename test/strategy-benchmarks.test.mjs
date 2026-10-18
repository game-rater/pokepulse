import test from 'node:test';
import assert from 'node:assert/strict';
import calculator from '../vendor/run-bun/index.js';
import {strategyFixtures} from '../scripts/strategy-benchmark-fixtures.mjs';
import {strategyOracle} from '../scripts/strategy-benchmark-oracle.mjs';
import {benchmarkReference} from '../scripts/benchmark-oracles.mjs';
import {assessBenchmarkRows} from '../scripts/check-stall-benchmarks.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,completeMoveDex} from '../analysis/native-battle.mjs';
const targets=[18.067192286252975,98.050266969949,98.87883067131042,100,100,11.92626953125,6.25];
for(const [i,f] of strategyFixtures.entries())test(f.id+': frozen independent probability and legal alternative actions',()=>{
 const proof=strategyOracle(f);assert.ok(Math.abs(proof.expected_percent-targets[i])<1e-10);
 assert.equal(proof.root_action_values.length,2);assert.ok(proof.states<1000);
 for(const model of ['minimax','npc-ai'])assert.equal(benchmarkReference(f,model).expected_percent,proof.expected_percent);
});
test('Healing and setup references discriminate strategy rather than just damage totals',()=>{
 const heal=strategyOracle(strategyFixtures[0]),setup=strategyOracle(strategyFixtures[4]);
 assert.equal(heal.root_action_values[1],0);assert.ok(heal.root_action_values[0]>18);
 assert.equal(setup.root_action_values[0],100);assert.ok(setup.root_action_values[1]<14);
 assert.deepEqual(strategyOracle(strategyFixtures.at(-1)).root_action_values,[0,6.25]);
});
test('Reference guards reject extra mechanics, invalid stats and PP exhaustion',()=>{
 for(const change of [s=>s.player.build.item='Leftovers',s=>s.player.build.ability='Pressure',s=>s.player.actual_stats.def++,
  s=>s.player.effects.confusion_turns=2,s=>s.player.pp.Recover=0,s=>s.player.current_hp=10000,
  s=>s.player.build.moves[1]='Psychic',s=>s.opponent.build.moves.push('Recover')]){
  const f=structuredClone(strategyFixtures[0]);change(f.snapshot);assert.throws(()=>strategyOracle(f),/precondition/);
 }
});
test('Native damage agrees with independent calculator for every roll and critical, including setup stages',()=>{
 const gen=calculator.Generations.get(8);
 for(const [fixture,side,name,boost] of [[strategyFixtures[0],1,'Strength',0],[strategyFixtures[4],0,'Tackle',0],[strategyFixtures[4],0,'Tackle',2],[strategyFixtures[4],0,'Tackle',4]]){
  const snapshot=structuredClone(fixture.snapshot),a=side?snapshot.opponent:snapshot.player,b=side?snapshot.player:snapshot.opponent;
  a.build.boosts.atk=boost;
  for(const critical of [false,true]){
   const expected=calculator.calculate(gen,new calculator.Pokemon(gen,a.species,a.build),new calculator.Pokemon(gen,b.species,b.build),new calculator.Move(gen,name,{isCrit:critical})).damage;
   const actual=[];
   for(let roll=0;roll<16;roll++){
    const state=createCompleteBattle(snapshot),battle=restoreCompleteBattle(state);
    installChanceTape(battle,[],state.unknownNature,state,choices=>typeof choices[0].value==='boolean'?(critical?0:0.99):(roll+0.5)/16);
    const move=completeMoveDex.getActiveMove(name);move.willCrit=critical;
    actual.push(battle.actions.getDamage(battle.sides[side].active[0],battle.sides[1-side].active[0],move));
   }
   assert.deepEqual(actual.sort((a,b)=>a-b),expected.slice().sort((a,b)=>a-b),`${name} boost ${boost} critical ${critical}`);
  }
 }
});
test('Native recovery, setup and toxic timing agree with the reference operation order',()=>{
 for(const action of [1,2]){
  const f=strategyFixtures[0],s=createCompleteBattle(f.snapshot),b=restoreCompleteBattle(s);
  installChanceTape(b,[],s.unknownNature,s,()=>0.999999);
  b.choose('p1',`move ${action}`);b.choose('p2','move 1');
  const [p,q]=b.sides.map(s=>s.active[0]);
  const damage=Math.min(...calculator.calculate(calculator.Generations.get(8),
   new calculator.Pokemon(calculator.Generations.get(8),f.snapshot.opponent.species,f.snapshot.opponent.build),
   new calculator.Pokemon(calculator.Generations.get(8),f.snapshot.player.species,f.snapshot.player.build),
   new calculator.Move(calculator.Generations.get(8),'Strength')).damage);
  assert.equal(p.hp,action===1?1+Math.round(f.snapshot.player.actual_stats.hp/2)-damage:0);
  assert.equal(q.hp,action===1?f.snapshot.opponent.current_hp-3*Math.floor(q.maxhp/16):f.snapshot.opponent.current_hp-20);
 }
 const s=createCompleteBattle(strategyFixtures[4].snapshot),b=restoreCompleteBattle(s);
 installChanceTape(b,[],s.unknownNature,s,()=>0.999999);b.choose('p1','move 1');b.choose('p2','move 1');
 assert.equal(b.p1.active[0].boosts.atk,2);assert.equal(b.p1.active[0].hp,21);
 for(const name of ['Tackle','Strength','Seismic Toss'])assert.equal(completeMoveDex.moves.get(name).accuracy,100);
});
test('Shared benchmark assessment detects error, stale fingerprints and missing early output',()=>{
 const f=strategyFixtures[0],r=benchmarkReference(f),row={case:f.id,opponent_model:'minimax',fixture_hash:r.input_sha256,reference:r,
  score:r.expected_percent,first_second:{score:r.expected_percent,available_at_ms:500}};
 assert.equal(assessBenchmarkRows([row],strategyFixtures)[0].pass,true);
 assert.equal(assessBenchmarkRows([{...row,first_second:{score:0,available_at_ms:500}}],strategyFixtures)[0].pass,false);
 assert.equal(assessBenchmarkRows([{...row,first_second:null}],strategyFixtures)[0].pass,false);
 assert.throws(()=>assessBenchmarkRows([{...row,fixture_hash:'bad'}],strategyFixtures),/Stale/);
});
