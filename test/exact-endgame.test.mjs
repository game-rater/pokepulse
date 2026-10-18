import test from 'node:test';
import assert from 'node:assert/strict';
import {accuracyFixtures} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {benchmarkReference} from '../scripts/benchmark-oracles.mjs';
import {createCompleteBattle,simulateCompleteMoves,restoreCompleteBattle,packed} from '../analysis/complete-moves.mjs';
import {solveNativeEndgame} from '../analysis/exact-endgame.mjs';
const fixture=id=>structuredClone(accuracyFixtures.find(f=>f.id===id).snapshot);
for(const id of ['oracle-focus-blast','oracle-focus-three','oracle-choice-guaranteed','oracle-choice-adaptive'])for(const model of ['minimax','npc-ai'])test(`${id}/${model}: native kernel matches independent proof with zero rollouts`,()=>{
 const f=accuracyFixtures.find(f=>f.id===id),session={};
 const result=simulateCompleteMoves(f.snapshot,{approximateCompleteMoves:true,opponentModel:model,session,exactEndgameMs:200});
 const target=benchmarkReference(f,model).expected_percent;
 assert.ok(Math.abs(result.score-target)<1e-9);assert.equal(result.certified,true);assert.equal(result.lower,result.upper);assert.equal(result.samples,0);
 const warm=simulateCompleteMoves(f.snapshot,{approximateCompleteMoves:true,opponentModel:model,session,warmOnly:true});
 assert.equal(warm.root_reused,true);assert.equal(warm.score,result.score);
});
test('Adaptive root preserves both move values and combines equivalent outcomes',()=>{
 const r=solveNativeEndgame(createCompleteBattle(fixture('oracle-choice-adaptive')),{exactEndgameMs:200});
 assert.ok(Math.abs(r.action_values[0]-0.81)<1e-9);assert.ok(Math.abs(r.action_values[1]-0.8)<1e-9);assert.ok(r.merged>0);assert.ok(r.states<=4);
});
for(const [name,change] of [
 ['poison',s=>s.player.build.status='psn'],['item',s=>s.player.build.item='Life Orb'],
 ['ability',s=>s.player.build.ability='Serene Grace'],['insufficient PP',s=>s.player.pp['Focus Blast']=1],
 ['speed tie',s=>s.player.actual_stats.spe=s.opponent.actual_stats.spe],
 ['SpD drop',s=>s.opponent.build.boosts.spd=-1],
 ['unknown nature',s=>s.player.effects.nature_unknown=true],['unsupported move',s=>s.player.build.moves.push('Psychic')],
 ['unhandled damage band',s=>s.opponent.current_hp=500],['weather',s=>{s.field.weather='Rain';s.player.effects.weather_turns=3;}],
 ])test(`Kernel rejects ${name}`,()=>{
 const s=fixture('oracle-choice-adaptive');change(s);
 assert.equal(solveNativeEndgame(createCompleteBattle(s),{exactEndgameMs:200}),null);
});
test('Cancellation, exhausted time and opt-out decline the shortcut',()=>{
 const s=createCompleteBattle(fixture('oracle-choice-adaptive'));
 assert.equal(solveNativeEndgame(s,{shouldStop:()=>true}),null);
 assert.equal(solveNativeEndgame(s,{deadline:0}),null);
 assert.equal(solveNativeEndgame(s,{exactEndgames:false}),null);
});
test('Damage probes leave the saved native state unchanged',()=>{
 const s=createCompleteBattle(fixture('oracle-choice-adaptive')),before=JSON.stringify(s);
 solveNativeEndgame(s,{exactEndgameMs:200});assert.equal(JSON.stringify(s),before);
});

test('Pending slot effects exclude otherwise eligible native states',()=>{
 const state=createCompleteBattle(fixture('oracle-choice-adaptive')),b=restoreCompleteBattle(state);
 b.sides[0].slotConditions[0]={futuremove:{id:'futuremove',duration:1}};
 assert.equal(solveNativeEndgame(packed(b),{exactEndgameMs:200}),null);
});

test('The shortcut is optional and blocked input cannot receive a certificate',()=>{
 const s=fixture('oracle-choice-adaptive');
 const disabled=simulateCompleteMoves(s,{approximateCompleteMoves:true,exactEndgames:false,retainedTurn:false,timeMs:10,samplesPerPair:1});
 assert.equal(disabled.certified,false);assert.notEqual(disabled.algorithm,'exact-native-fixed-retaliation-endgame');
 s.player.effects.unknown_effects=['unread live counter'];
 const blocked=simulateCompleteMoves(s,{approximateCompleteMoves:true});assert.equal(blocked.input_blocked,true);assert.equal(blocked.score,null);
});
import {scoreBattle,pack,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
import {readFileSync} from 'node:fs';
import {SearchService} from '../run-bun/search-service.mjs';
function liveArgs(){
 const s=fixture('oracle-choice-adaptive'),rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
 return [pack.species.find(p=>p.name===s.player.species),pack.species.find(p=>p.name===s.opponent.species),rules,
  {player_hp:100*s.player.current_hp/s.player.actual_stats.hp,opponent_hp:100*s.opponent.current_hp/s.opponent.actual_stats.hp},
  {player:{...s.player.build,critical:false},opponent:{...s.opponent.build,critical:false}},defaultField(),{player:s.player.effects,opponent:s.opponent.effects},
  {player:{current_hp:s.player.current_hp,actual_stats:s.player.actual_stats,pp:s.player.pp},opponent:{current_hp:s.opponent.current_hp,actual_stats:s.opponent.actual_stats,pp:s.opponent.pp}}];
}
test('Legacy/native routing uses the exact endgame before either search engine',()=>{
 const r=scoreBattle(...liveArgs(),{exactEndgameMs:200});
 assert.ok(Math.abs(r.victory-81)<1e-9);assert.equal(r.outlook.algorithm,'exact-native-fixed-retaliation-endgame');
});
test('A preloaded live worker publishes the correct 81 percent as its first result',async()=>{
 const service=new SearchService({parallel:false});
 try{
  await service.preload();
  const first=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Worker timeout')),15000);
   service.start(liveArgs(),r=>{clearTimeout(timer);resolve(r);},e=>{clearTimeout(timer);reject(e);});});
  assert.ok(Math.abs(first.display_score-81)<1e-9);assert.equal(first.outlook.algorithm,'exact-native-fixed-retaliation-endgame');
 }finally{service.cancel();}
});
