// Single evaluation pipeline for public forecasts and search continuations.
// Engines implement search; proof providers implement mathematical domains.
// This module alone owns proof caching, classification and engine selection.
import {requiresCompleteMoves,completeMoveAdapter} from './native-battle.mjs';
import {prepareNativePosition,searchNativePosition} from './native-search.mjs';
import {passiveEndgameProof} from './passive-endgame.mjs';
import {fixedRetaliationProof} from './exact-endgame.mjs';
import {simulateSampledMovesCore} from './sampled-search.mjs';
import {simulateRetainedTurn} from './retained-turn.mjs';
const providers=[fixedRetaliationProof,passiveEndgameProof];
const nativeTerminal=completeMoveAdapter().terminal;
function contextFor(options){
 const values=options.session?(options.session.positionValues??=new Map()):new Map();
 const work=options.session?(options.session.positionProofWork??=new Map()):new Map();
 const context={values,work,attempted:new Set()};
 context.continuation=(state,reasons=new Set(),overrides={})=>evaluate({state,reasons,purpose:'continuation'},{...options,...overrides},context);
 return context;
}
function stopped(options){return options.shouldStop?.()||performance.now()>(options.deadline??Infinity);}
function proofResult(proof,provider,context,reused){
 const score=proof.value*100;
 return {score,provisional_score:score,provisional_usable:true,partial_estimate:proof.value,lower:proof.value,upper:proof.value,lower_bound:score,upper_bound:score,
  complete:true,certified:true,approximate:false,unresolved:0,score_kind:'certified-lower-bound',sampling_complete:true,
  algorithm:provider.algorithm,opponent_model:provider.opponentModel,
  move_engine:'pokemon-showdown 0.11.11 with Run & Bun overrides',nodes:proof.states,samples:0,retained_states:context.values.size,root_reused:reused,
  proof:{solver:provider.id,...proof},merged_outcomes:proof.merged,unresolved_reasons:[],omitted_moves:[],input_blocked:false};
}
function resolveProof(state,reasons,options,context){
 if(!state||state.kind!=='decision'||reasons.size||stopped(options))return null;
 for(const provider of providers){
  if(!provider.enabled(options))continue;
  const key=JSON.stringify([provider.id,state.key,options.opponentModel||'minimax',options.npcAi||null]);
  if(context.values.has(key))return proofResult(context.values.get(key),provider,context,true);
  if(options.warmOnly||context.attempted.has(key))continue;
  context.attempted.add(key);
  let proof;
  if(provider.start){
   let job=context.work.get(key);if(job){context.work.delete(key);context.work.set(key,job);}
   if(!job){job=provider.start(state);if(job){context.work.set(key,job);while(context.work.size>32)context.work.delete(context.work.keys().next().value);}}
   proof=job&&provider.advance(job,options);
  }else proof=provider.solve(state,options);
  if(!proof)continue;
  context.work.delete(key);context.values.set(key,proof);while(context.values.size>256)context.values.delete(context.values.keys().next().value);
  return proofResult(proof,provider,context,false);
 }
 return null;
}
function evaluate(position,options,context){
 if(position.purpose==='continuation')return resolveProof(position.state,position.reasons||new Set(),options,context);
 const snapshot=position.snapshot,legacy=position.legacy;
 // Legacy callers that have not enabled native mechanics keep their route.
 if(legacy&&!options.completeMoves)return legacy();
 const nativeRequired=!legacy||options.forceNativeForecast||requiresCompleteMoves(snapshot);
 const proofCandidate=snapshot&&providers.some(p=>p.enabled(options)&&p.mayApply(snapshot));
 if(!nativeRequired&&!proofCandidate)return legacy();
 const prepared=snapshot?prepareNativePosition(snapshot,options):{
  initial:position.state,reasons:position.reasons||new Set(),session:options.session?(options.session.completeMoves??={}):{},
 };
 const {initial,reasons,session}=prepared;
 const solved=resolveProof(initial,reasons,options,context);if(solved)return solved;
 if(!nativeRequired)return legacy();
 if(initial&&nativeTerminal(initial)===null&&(position.strategy==='sampled'||options.approximateCompleteMoves)){
  const strategy=options.retainedTurn===false||options.opponentModel==='npc-ai'?simulateSampledMovesCore:simulateRetainedTurn;
  return strategy(initial,options,reasons,context);
 }
 const deadline=Math.min(options.deadline??Infinity,performance.now()+Math.max(0,options.timeMs??150));
 return searchNativePosition(initial,reasons,options,session,state=>{const result=context.continuation(state,reasons,{deadline});return result?result.score/100:null;});
}
export function evaluatePosition(position,options={}){
 return evaluate(position,options,contextFor(options));
}
