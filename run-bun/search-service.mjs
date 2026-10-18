import {Worker} from 'node:worker_threads';
import {displayEstimate} from './display-estimate.mjs';
export function modelContext(args){
  const [player,opponent,rules,,builds,field,effects,live]=args;
  const staticBuild=b=>{const {status,boosts,...rest}=b;return rest;};
  const staticEffects=e=>{const {sleep_counter,confusion_turns,protect_streak,focus_energy,first_turn,...rest}=e;return rest;};
  return JSON.stringify([player,opponent,rules,[staticBuild(builds.player),staticBuild(builds.opponent)],field,
    [staticEffects(effects.player),staticEffects(effects.opponent)],live.player?.actual_stats,live.opponent?.actual_stats,live.opponent_model||'minimax',live.npc_ai]);
}
export function chooseSearchResult(results){
 const exact=results.exact,hybrid=results.hybrid;
 const usable=r=>r&&!r.outlook.input_blocked&&Number.isFinite(displayEstimate(r).score);
 if(exact?.outlook.complete&&!exact.outlook.approximate)return {engine:'exact',result:exact};
 if(usable(hybrid))return {engine:'hybrid',result:hybrid};
 if(usable(exact))return {engine:'exact',result:exact};
 return exact?{engine:'exact',result:exact}:hybrid?{engine:'hybrid',result:hybrid}:null;
}
const engineStatus=r=>!r?'starting':r.outlook.complete?'complete':r.outlook.input_blocked?'blocked':
 r.outlook.search_paused?'paused':r.outlook.sampling_complete?'finished':'searching';
export class SearchService {
 constructor({settleMs=0,parallel=true,exactProbeMs=2000}={}){
  this.worker=null;this.hybridWorker=null;this.version=0;this.context=null;this.display=null;
  this.parallel=parallel;this.runningParallel=parallel;this.exactProbeMs=exactProbeMs;this.results={};this.errors={};this.lastSelected=null;
  this.generation=new Int32Array(new SharedArrayBuffer(4));this.exactHalt=new Int32Array(new SharedArrayBuffer(4));
  this.hybridHalt=new Int32Array(new SharedArrayBuffer(4));this.settleMs=settleMs;this.timer=null;
 }
 cancel(){
  Atomics.store(this.generation,0,++this.version);clearTimeout(this.timer);
  for(const name of ['worker','hybridWorker']){this[name]?.terminate();this[name]=null;}
  this.context=null;this.display=null;this.results={};this.lastSelected=null;
 }
 receive(engine,{version,result}){
  if(version!==this.version)return;
  if(!this.runningParallel){this.publish(result);return;}
  this.results[engine]=result;
  const choice=chooseSearchResult(this.results);if(!choice)return;
  if(choice.result.outlook.complete&&!choice.result.outlook.approximate){
   Atomics.store(choice.engine==='exact'?this.hybridHalt:this.exactHalt,0,version);
  }
  const statuses={exact:this.errors.exact?'failed':engineStatus(this.results.exact),hybrid:this.errors.hybrid?'failed':engineStatus(this.results.hybrid)};
  const signature=choice.engine+':'+statuses.exact+':'+statuses.hybrid;
  if(this.lastSelected?.result===choice.result&&this.lastSelected.signature===signature)return;
  this.lastSelected={result:choice.result,signature};
  const selected={...choice.result,outlook:{...choice.result.outlook,search_race:{selected:choice.engine,...statuses,
   workers:2,exact_probe_budget_ms:this.exactProbeMs}}};
  this.publish(selected,!choice.result.outlook.complete&&Object.values(statuses).some(s=>s==='searching'||s==='starting'));
 }
 publish(result,refining){
  const estimate=result.outlook.input_blocked?{score:null,kind:'missing-input'}:displayEstimate(result,this.display);
  result.display_score=estimate.score;result.display_score_kind=estimate.kind;
  result.refining=refining??(!result.outlook.complete&&!result.outlook.input_blocked&&!result.outlook.sampling_complete&&!result.outlook.search_paused);
  this.display=estimate.score;this.onResult(result);
 }
 makeWorker(engine){
  const name=engine==='hybrid'?'hybridWorker':'worker';
  const halt=engine==='hybrid'?this.hybridHalt:this.exactHalt;
  const worker=new Worker(new URL('./search-worker.mjs',import.meta.url),{workerData:{generation:this.generation.buffer,
   halt:halt.buffer,engineMode:this.runningParallel?engine:'auto',exactProbeMs:this.exactProbeMs}});
  this[name]=worker;
  worker.on('message',message=>{if(this[name]===worker)this.receive(engine,message);});
  worker.on('error',error=>{if(this[name]!==worker)return;
   if(!this.runningParallel){this.onError(error);return;}
   this.errors[engine]=error;
   if(this.errors.exact&&this.errors.hybrid)this.onError(new Error('Both search engines failed',{cause:error}));
   else {const other=engine==='exact'?'hybrid':'exact';if(this.results[other])this.receive(other,{version:this.version,result:this.results[other]});}
  });
  worker.on('exit',()=>{if(this[name]===worker)this[name]=null;});worker.unref();
 }
 start(args,onResult,onError=()=>{},budgets){
  const runningParallel=this.parallel&&args[7]?.opponent_model!=='npc-ai';
  if(this.runningParallel!==undefined&&runningParallel!==this.runningParallel)this.cancel();
  this.runningParallel=runningParallel;
  const version=++this.version;Atomics.store(this.generation,0,version);clearTimeout(this.timer);
  const context=modelContext(args),sameContext=context===this.context;
  if(!sameContext){this.context=context;this.display=null;}
  this.results={};this.errors={};this.lastSelected=null;this.onResult=onResult;this.onError=onError;
  if(!this.worker)this.makeWorker('exact');
  if(this.runningParallel&&!this.hybridWorker)this.makeWorker('hybrid');
  const dispatch=()=>{const message={version,args,budgets,modelContext:context};
   this.worker?.postMessage(message);if(this.runningParallel)this.hybridWorker?.postMessage(message);};
  if(this.settleMs)this.timer=setTimeout(dispatch,this.settleMs);else dispatch();
  return {sameContext};
 }
}
