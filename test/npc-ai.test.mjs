import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {npcMoveDistribution,weightedNpcBounds} from '../run-bun/npc-ai.mjs';
import {createCompleteBattle,restoreCompleteBattle,MissingInput,simulateCompleteMoves} from '../analysis/complete-moves.mjs';
import {allocation} from '../analysis/sampled-moves.mjs';
import {mon,searchFixtures} from '../scripts/search-benchmark-fixtures.mjs';
import {modelContext,SearchService} from '../run-bun/search-service.mjs';
import {pack,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
const game=(a,b)=>restoreCompleteBattle(createCompleteBattle({player:mon(a),opponent:mon(b,{spe:10}),field:{}}));
test('NPC random move scores and ties produce normalized probabilities',()=>{
 const b=game(['Tackle'],['Tackle','Scratch']);b.p1.active[0].hp=1;
 const policy=npcMoveDistribution(b);
 assert.deepEqual(policy.map(p=>p.probability),[0.5,0.5]);
 const status=npcMoveDistribution(game(['Tackle'],['Splash','Tackle']));
 assert.equal(status.reduce((s,p)=>s+p.probability,0),1);
 assert.equal(status.find(p=>p.move==='Splash')?.probability||0,0);
});
test('NPC policy respects no PP and forced legal moves',()=>{
 const b=game(['Tackle'],['Tackle','Splash']);b.p2.active[0].moveSlots[0].pp=0;
 b.makeRequest('move');
 assert.deepEqual(npcMoveDistribution(b),[{slot:2,move:'Splash',probability:1}]);
});
test('NPC scores update when HP and move legality change',()=>{
 const b=restoreCompleteBattle(createCompleteBattle(searchFixtures.find(f=>f.id==='four-by-four').snapshot));
 const full=npcMoveDistribution(b);assert.equal(full.find(p=>p.move==='Recover').probability,0);
 b.p2.active[0].hp=10;
 const hurt=npcMoveDistribution(b);assert.ok(hurt.find(p=>p.move==='Recover').probability>0);
});
test('Every mapped ROM move can be evaluated by the community NPC adapter',()=>{
 const names=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url))).move.filter(Boolean);
 for(const move of names){const policy=npcMoveDistribution(game(['Tackle'],[move,'Tackle']),{playerRemaining:2,opponentRemaining:2});assert.ok(Math.abs(policy.reduce((s,p)=>s+p.probability,0)-1)<1e-8,move);}
});
test('NPC weighted backup optimizes player expectation instead of worst opponent action',()=>{
 const matrix=[[1,0],[0.6,0.6]];
 const result=weightedNpcBounds(matrix,matrix,[0.9,0.1]);
 assert.equal(result.lower,0.9);assert.equal(result.upper,0.9);
});
test('NPC allocation retains low-value but probable opponent moves',()=>{
 const cell=(sum)=>({n:16,sum});
 const cells=[[cell(16),cell(0)],[cell(8),cell(8)]];
 assert.ok(allocation(cells,128,{npcProbabilities:[0.5,0.5]}).selected);
 assert.equal(allocation(cells,16,{npcProbabilities:[1,0]}).selected,null);
});
test('Missing team counts block party-sensitive NPC predictions',()=>{
 assert.throws(()=>npcMoveDistribution(game(['Tackle'],['Explosion','Tackle'])),MissingInput);
 const result=simulateCompleteMoves({player:mon(['Tackle']),opponent:mon(['Explosion','Tackle']),field:{}},{opponentModel:'npc-ai',approximateCompleteMoves:true,timeMs:20});
 assert.equal(result.input_blocked,true);assert.equal(result.score,null);
});
test('NPC and minimax retained roots never share samples',()=>{
 const snapshot=searchFixtures.find(f=>f.id==='cheap-ending').snapshot,session={};
 const npc=simulateCompleteMoves(snapshot,{opponentModel:'npc-ai',approximateCompleteMoves:true,timeMs:10,samplesPerPair:2,session});
 assert.equal(npc.algorithm,'npc-ai-weighted-native-rollouts');
 assert.equal(npc.npc_move_probabilities[0].probability,1);
 assert.ok(session.npcMoves);assert.equal(session.sampledMoves,undefined);
 const again=simulateCompleteMoves(snapshot,{opponentModel:'npc-ai',approximateCompleteMoves:true,timeMs:10,samplesPerPair:2,session});assert.equal(again.root_reused,true);
});
test('NPC search uses one worker even with the optional minimax race enabled',async()=>{
 const service=new SearchService({parallel:true}),species=pack.species.find(s=>s.id==='mew');
 const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8'),build={...defaultBuild(species),moves:['Tackle'],ability:'',item:''};
 const args=[species,species,rules,{player_hp:100,opponent_hp:100},{player:build,opponent:build},defaultField(),{player:{first_turn:false,move_history_known:true},opponent:{first_turn:false,move_history_known:true}},{opponent_model:'npc-ai'}];
 assert.notEqual(modelContext(args),modelContext([...args.slice(0,7),{}]));
 try{
  const result=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('NPC worker timed out')),15000);service.start(args,r=>{clearTimeout(timeout);resolve(r);},e=>{clearTimeout(timeout);reject(e);},[30]);});
  assert.equal(result.outlook.algorithm,'npc-ai-weighted-native-rollouts');assert.equal(service.hybridWorker,null);
 }finally{service.cancel();}
});
