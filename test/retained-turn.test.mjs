import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateCompleteMoves,createCompleteBattle} from '../analysis/complete-moves.mjs';
import {observationKey,turnNode,expandTurn,turnMass} from '../analysis/retained-turn.mjs';
import {searchFixtures,observeSimpleTurn,mon} from '../scripts/search-benchmark-fixtures.mjs';
const reusable=()=>structuredClone(searchFixtures.find(f=>f.id==='reusable-next-turn').snapshot);
const graph=limit=>({nodes:new Map(),limit:limit||64,hits:0,merged:0,expansions:0});
test('A full cache cannot evict the descendant currently being expanded',()=>{
 const g=graph(3),root=turnNode(g,createCompleteBattle(reusable()));
 const child=turnNode(g,observeSimpleTurn(reusable()).state);g.activeKey=root.key;
 expandTurn(g,child,{timeMs:1000},new Set());
 assert.equal(g.nodes.size,3);assert.ok(child.state);assert.equal(child.pairs.length,2);
 assert.equal(g.nodes.get(child.key),child);assert.equal(g.processingKey,undefined);
});
test('A rebuilt observed turn matches its native descendant despite bookkeeping differences',()=>{
 const {observed,state}=observeSimpleTurn(reusable());
 assert.equal(observationKey(createCompleteBattle(observed)),observationKey(state));
 assert.notEqual(createCompleteBattle(observed).key,state.key);
});
test('Matching rejects changed PP, HP, items, builds, counters and unknown history',()=>{
 const {observed}=observeSimpleTurn(reusable()),key=observationKey(createCompleteBattle(observed));
 for(const change of [s=>s.player.pp.Tackle--,s=>s.opponent.current_hp--,s=>s.player.build.item='Leftovers',
  s=>s.player.actual_stats.atk++,s=>s.player.effects.confusion_turns=2,s=>s.player.effects.move_history_known=false]){
  const different=structuredClone(observed);change(different);
  if(!different.player.effects.move_history_known){different.player.effects.live_data=true;delete different.player.effects.last_move;}
  assert.notEqual(observationKey(createCompleteBattle(different)),key);
 }
});
test('Exact first-turn enumeration retains all rare critical mass',()=>{
 const fixture=searchFixtures.find(f=>f.id==='rare-critical'),g=graph(),node=turnNode(g,createCompleteBattle(fixture.snapshot));
 expandTurn(g,node,{timeMs:2000},new Set());const p=node.pairs[0][0];
 assert.equal(p.complete,true);assert.ok(Math.abs(turnMass(p)-1)<1e-12);
 assert.ok(Math.abs(p.terminal-1/16)<1e-12);assert.equal(p.terminalMass,1);
});
test('Incomplete first-turn frontiers preserve unresolved probability and resume',()=>{
 const snapshot={player:mon(['Bite']),opponent:mon(['Water Pulse'],{spe:60}),field:{}},g=graph(),node=turnNode(g,createCompleteBattle(snapshot));
 expandTurn(g,node,{timeMs:1},new Set());const p=node.pairs[0][0];
 assert.ok(p);assert.ok(Math.abs(turnMass(p)-1)<1e-12);const before=p.steps;
 expandTurn(g,node,{timeMs:20},new Set());assert.ok(p.steps>before||p.complete||p.deferred);
 assert.ok(Math.abs(turnMass(p)-1)<1e-12);
});
test('Observed next-turn root immediately publishes retained evidence without a new rollout',()=>{
 const snapshot=reusable(),session={},options={session,approximateCompleteMoves:true,samplesPerPair:8,timeMs:100};
 let root;
 for(let i=0;i<30;i++){root=simulateCompleteMoves(snapshot,options);if(root.sampling_complete)break;}
 const {observed}=observeSimpleTurn(snapshot);
 const warm=simulateCompleteMoves(observed,{...options,timeMs:0,warmOnly:true});
 assert.equal(warm.reused_next_turn_estimate,true);assert.equal(warm.provisional_usable,true);assert.equal(warm.nodes,0);
 assert.ok(warm.samples>0||warm.continuation_samples>0);assert.equal(warm.certified,false);
 const node=[...session.turnGraph.nodes.values()].find(n=>observationKey(n.state)===observationKey(createCompleteBattle(observed)));
 const savedSamples=node.result?.samples||0;
 const refined=simulateCompleteMoves(observed,{...options,samplesPerPair:16,timeMs:100});
 assert.ok(refined.samples>=savedSamples);assert.equal(refined.root_reused,true);
});
test('Retained native snapshots stay within the configured node limit',()=>{
 const g=graph(4),snapshot=reusable();
 for(let hp=10;hp<30;hp++)turnNode(g,createCompleteBattle({...snapshot,opponent:{...snapshot.opponent,current_hp:hp}}));
 assert.equal(g.nodes.size,4);assert.ok([...g.nodes.values()].every(n=>n.state));
});
