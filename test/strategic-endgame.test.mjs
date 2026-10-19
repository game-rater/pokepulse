import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyFixtures} from '../scripts/strategy-benchmark-fixtures.mjs';
import {strategyOracle} from '../scripts/strategy-benchmark-oracle.mjs';
import {solveStrategicEndgame} from '../analysis/strategic-endgame.mjs';
import {createCompleteBattle,simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {prepareNativePosition} from '../analysis/native-search.mjs';
import {referenceMon} from '../scripts/accuracy-benchmark-fixtures.mjs';
for(const fixture of strategyFixtures)test(`${fixture.id}: native strategic proof matches the independent HP/PP oracle`,()=>{
 const state=createCompleteBattle(fixture.snapshot),before=JSON.stringify(state),expected=strategyOracle(fixture);
 const proof=solveStrategicEndgame(state,{exactEndgameMs:1000});assert.ok(proof);assert.ok(Math.abs(proof.value*100-expected.expected_percent)<1e-9);
 proof.action_values.forEach((v,i)=>assert.ok(Math.abs(v*100-expected.root_action_values[i])<1e-9));assert.equal(JSON.stringify(state),before);
 const session={},r=simulateCompleteMoves(fixture.snapshot,{session,approximateCompleteMoves:true,exactEndgameMs:1000});assert.equal(r.certified,true);assert.equal(r.samples,0);
 assert.equal(r.algorithm,'exact-native-strategic-endgame');assert.equal(simulateCompleteMoves(fixture.snapshot,{session,warmOnly:true}).root_reused,true);
});

test('Strategic proofs reject extra mechanics, low PP, ties, slot effects and invalid native data',()=>{
 const snapshot=()=>structuredClone(strategyFixtures[4].snapshot);
 for(const mutate of [s=>s.player.build.item='Leftovers',s=>s.player.build.ability='Contrary',s=>s.opponent.build.moves.push('Recover'),s=>s.player.pp.Tackle=1,s=>s.player.actual_stats.spe=s.opponent.actual_stats.spe,s=>s.player.effects.native_volatiles={substitute:{hp:5}},s=>s.player.build.boosts.def=1,s=>s.field={weather:'Rain'}]){
  const s=snapshot();mutate(s);assert.equal(solveStrategicEndgame(createCompleteBattle(s),{exactEndgameMs:1000}),null);
 }
 for(const mutate of [s=>s.saved.midTurn=true,s=>s.saved.sides[0].pokemon[0].hp=NaN,s=>s.saved.sides[0].pokemon[0].moveSlots[0].pp=NaN]){
  const s=createCompleteBattle(snapshot());mutate(s);assert.equal(solveStrategicEndgame(s),null);
 }
 const s=createCompleteBattle(snapshot());s.saved.sides[0].slotConditions[0]={futuremove:{duration:1}};assert.equal(solveStrategicEndgame(s),null);
});

test('Cancellation and exhausted budgets decline a proof without publishing a guessed probability',()=>{
 const s=createCompleteBattle(strategyFixtures[0].snapshot);
 for(const opts of [{deadline:0},{shouldStop:()=>true},{exactEndgames:false}])assert.equal(solveStrategicEndgame(s,opts),null);
});

test('The same domains solve changed species, HP and toxic stages against an independent reference',()=>{
 for(const [species,hp,stage] of [['Mew',20,1],['Alakazam',25,2],['Mew',50,3]]){
  const f=structuredClone(strategyFixtures[0]);f.snapshot.player=referenceMon(species,['Recover','Seismic Toss'],{level:20,hp});f.snapshot.opponent.effects.toxic_counter=stage;
  const expected=strategyOracle(f),r=solveStrategicEndgame(createCompleteBattle(f.snapshot),{exactEndgameMs:1000});assert.ok(r);assert.ok(Math.abs(r.value*100-expected.expected_percent)<1e-9);
 }
});

test('A missing live toxic stage cannot acquire a zero-stage certainty proof',()=>{
 const s=structuredClone(strategyFixtures[0].snapshot);delete s.opponent.effects.toxic_counter;
 const {initial,reasons}=prepareNativePosition(s,{session:{}});assert.equal(initial,null);assert.ok([...reasons].some(s=>s.includes('toxic counter')));
});
