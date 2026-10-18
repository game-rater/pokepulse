import test from 'node:test';
import assert from 'node:assert/strict';
import {mon} from '../scripts/search-benchmark-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle,packed,installChanceTape,nativeMoveChoices,completeMoveAdapter,simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {npcMoveDistribution} from '../run-bun/npc-ai.mjs';

test('Rollout forced action uses the current request slot in every optimizer',()=>{
 const initial=createCompleteBattle({player:mon(['Splash']),opponent:mon(['Tackle','Splash','Pin Missile','Rollout']),field:{}}),b=restoreCompleteBattle(initial);
 installChanceTape(b,[],initial.unknownNature,initial,()=>0.5);
 b.choose('p1','move 1');b.choose('p2','move 4');
 assert.equal(b.p2.activeRequest.active[0].moves.length,1);
 assert.deepEqual(nativeMoveChoices(b.p2.active[0]).map(m=>[m.slot,m.id]),[[1,'rollout']]);
 assert.deepEqual(npcMoveDistribution(b),[{slot:1,move:'Rollout',probability:1}]);
 const state=packed(b,initial.unknownNature,{unknownFirst:[false,false],unknownHistory:[false,false]});
 assert.deepEqual(completeMoveAdapter().actions(state)[1],[1]);
 assert.equal(b.choose('p1','move 1'),true);assert.equal(b.choose('p2','move 1'),true);
});
test('Sampled forecasts complete continuations containing Rollout without rejecting a move',()=>{
 const snapshot={player:mon(['Bite','Sand Tomb','Razor Leaf','Confide'],{hp:16,spe:19}),opponent:mon(['Venoshock','Poison Tail','Pin Missile','Rollout'],{spe:22}),field:{}};
 for(const opponentModel of ['minimax','npc-ai']){
  const session={};let result;
  // Native policy probes do more work than the former static move picker.
  // This checks forced-slot correctness; response latency is benchmarked apart.
  for(let pass=0;pass<80;pass++){
   result=simulateCompleteMoves(snapshot,{session,opponentModel,approximateCompleteMoves:true,timeMs:100});
   if(result.provisional_usable)break;
  }
  assert.equal(result.provisional_usable,true,`${opponentModel}: a hidden provisional number is not a published prediction`);
  assert.ok(Number.isFinite(result.provisional_score),opponentModel);
 }
});
test('Charge and recharge turns expose their forced request slot',()=>{
 for(const move of ['Solar Beam','Hyper Beam']){
  const initial=createCompleteBattle({player:mon(['Splash']),opponent:mon([move,'Tackle']),field:{}}),b=restoreCompleteBattle(initial);
  installChanceTape(b,[],initial.unknownNature,initial,()=>0.5);
  assert.equal(b.choose('p1','move 1'),true);assert.equal(b.choose('p2','move 1'),true);
  assert.equal(b.p2.activeRequest.active[0].moves.length,1,move);
  assert.deepEqual(nativeMoveChoices(b.p2.active[0]).map(m=>m.slot),[1],move);
  assert.equal(npcMoveDistribution(b)[0].slot,1,move);
  assert.equal(b.choose('p1','move 1'),true);assert.equal(b.choose('p2','move 1'),true);
 }
});
