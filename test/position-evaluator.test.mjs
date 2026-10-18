import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluatePosition} from '../analysis/position-evaluator.mjs';
import {fixedRetaliationProof} from '../analysis/exact-endgame.mjs';
import {createCompleteBattle} from '../analysis/native-battle.mjs';
import {accuracyFixtures} from '../scripts/accuracy-benchmark-fixtures.mjs';
const snapshot=()=>structuredClone(accuracyFixtures.find(f=>f.id==='oracle-choice-adaptive').snapshot);
const fakeProof=value=>({value,states:1,merged:0});
test('All entry forms share proof cache, result classification and model scope',t=>{
 const calls=[];t.mock.method(fixedRetaliationProof,'solve',(state,options)=>{calls.push(options.opponentModel);return fakeProof(options.opponentModel==='npc-ai'?0.6:0.4);});
 const input=snapshot(),state=createCompleteBattle(input),session={},options={session,opponentModel:'minimax',approximateCompleteMoves:true};
 const root=evaluatePosition({snapshot:input},options);
 const leaf=evaluatePosition({state,purpose:'continuation'},options);
 assert.equal(root.score,40);assert.equal(root.certified,true);assert.equal(leaf.score,root.score);assert.equal(leaf.root_reused,true);assert.equal(calls.length,1);
 const npc=evaluatePosition({state,purpose:'continuation'},{...options,opponentModel:'npc-ai'});
 assert.equal(npc.score,60);assert.equal(calls.length,2);assert.equal(session.positionValues.size,2);
});
test('An unsuccessful proof is tried once per evaluation, and can retry next pass',t=>{
 const counts=new Map();t.mock.method(fixedRetaliationProof,'solve',state=>{counts.set(state.key,(counts.get(state.key)||0)+1);return null;});
 const input=snapshot(),key=createCompleteBattle(input).key,session={};
 evaluatePosition({snapshot:input},{session,approximateCompleteMoves:true,samplesPerPair:1,timeMs:1});
 assert.equal(counts.get(key),1);
 evaluatePosition({snapshot:input},{session,approximateCompleteMoves:true,samplesPerPair:1,timeMs:1});
 assert.equal(counts.get(key),2);
});
test('A declined proof falls back to the configured legacy engine exactly once',t=>{
 let proofs=0,fallbacks=0;t.mock.method(fixedRetaliationProof,'solve',()=>{proofs++;return null;});
 const sentinel={engine:'legacy'};
 const result=evaluatePosition({snapshot:snapshot(),legacy:()=>{fallbacks++;return sentinel;}},{completeMoves:true});
 assert.equal(result,sentinel);assert.equal(proofs,1);assert.equal(fallbacks,1);
});
test('Cancellation, missing input and warm-only lookup never execute a proof',t=>{
 let calls=0;t.mock.method(fixedRetaliationProof,'solve',()=>{calls++;return fakeProof(0.81);});
 const state=createCompleteBattle(snapshot());
 for(const options of [{shouldStop:()=>true},{deadline:0},{warmOnly:true}])assert.equal(evaluatePosition({state,purpose:'continuation'},options),null);
 assert.equal(evaluatePosition({state,reasons:new Set(['missing data']),purpose:'continuation'}),null);
 const input=snapshot();input.player.effects.unknown_effects=['unavailable counter'];
 const result=evaluatePosition({snapshot:input},{approximateCompleteMoves:true});assert.equal(result.input_blocked,true);assert.equal(calls,0);
});
test('Warm lookup uses a cached proof but does not bypass cancellation or missing data',t=>{
 t.mock.method(fixedRetaliationProof,'solve',()=>fakeProof(0.81));
 const state=createCompleteBattle(snapshot()),options={session:{}};
 evaluatePosition({state,purpose:'continuation'},options);
 assert.equal(evaluatePosition({state,purpose:'continuation'},{...options,warmOnly:true}).root_reused,true);
 assert.equal(evaluatePosition({state,purpose:'continuation'},{...options,shouldStop:()=>true}),null);
 assert.equal(evaluatePosition({state,reasons:new Set(['unknown']),purpose:'continuation'},options),null);
});
test('Changed native inputs cannot reuse an old proof',t=>{
 let calls=0;t.mock.method(fixedRetaliationProof,'solve',()=>{calls++;return fakeProof(0.81);});
 const input=snapshot(),options={session:{}};
 evaluatePosition({snapshot:input},options);input.opponent.current_hp--;
 evaluatePosition({snapshot:input},options);assert.equal(calls,2);
});
test('Search engines depend on mechanics and evaluator context, never a proof provider',()=>{
 for(const file of ['native-battle','native-search','sampled-search','retained-turn','continuation-policy']){
  const source=readFileSync(new URL(`../analysis/${file}.mjs`,import.meta.url),'utf8');
  assert.doesNotMatch(source,/from ['"].*exact-endgame/);assert.doesNotMatch(source,/exactEndgameChecked/);
 }
 const mechanics=readFileSync(new URL('../analysis/native-battle.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(mechanics,/from ['"].*(?:position-evaluator|search\.mjs|sampled-moves|complete-moves)/);
 const provider=readFileSync(new URL('../analysis/exact-endgame.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(provider,/session\.|score_kind|createCompleteBattle/);
});
for(const strategy of ['bounded','sampled'])test(`${strategy} search resolves continuations through the shared evaluator`,t=>{
 const input=snapshot(),root=createCompleteBattle(input).key,calls=new Map();
 t.mock.method(fixedRetaliationProof,'solve',state=>{
  calls.set(state.key,(calls.get(state.key)||0)+1);return state.key===root?null:fakeProof(0.3);
 });
 const result=evaluatePosition({snapshot:input},{session:{},approximateCompleteMoves:strategy==='sampled',retainedTurn:false,samplesPerPair:8,timeMs:1000,maxDepth:2});
 assert.ok([...calls.keys()].some(key=>key!==root));assert.ok([...calls.values()].every(count=>count===1));
 if(strategy==='sampled')assert.equal(result.certified,false);
});
