// Exact, resumable next-turn probabilities above retained deeper estimates.
// No trainer AI. Unknown/unfinished chance mass is never renormalized.
import {completeMoveAdapter,restoreCompleteBattle} from './native-battle.mjs';
import {simulateSampledMovesCore,samplingConfidenceBounds,recordHorizonSample,stratumMean} from './sampled-search.mjs';
import {matrixBounds,matrixPruning,thresholdDecision,proofThreshold} from './search.mjs';
import {BoundedCache} from './bounded-cache.mjs';

export {observationKey} from './observation-key.mjs';
import {observationKey} from './observation-key.mjs';

function heuristic(state){
 const [p,q]=state.saved.sides.map(side=>side.pokemon[0]);
 return p.hp<=0?0:q.hp<=0?1:0.5;
}
function remember(graph,key,node){
 graph.nodes.set(key,node);
 while(graph.nodes.size>graph.limit){
  const evict=[...graph.nodes.keys()].find(k=>k!==graph.activeKey&&k!==graph.processingKey&&k!==key);
  if(!evict)break;
  const old=graph.nodes.get(evict);graph.nodes.delete(evict);
  // Edges can keep the scalar estimate, but evicted nodes must release their
  // native snapshots, chance frontiers and sampled matrices as well.
  for(const row of old.pairs)for(const p of row)if(p)for(const edge of p.edges.values())edge.node.parents?.delete(old);
  old.parents?.clear();old.state=null;old.session={};old.pairs=[];
 }
 return node;
}
export function turnNode(graph,state,options={}){
 const key=observationKey(state)+'|'+(options.rolloutTurns??12);
 let node=graph.nodes.get(key);
 if(node){graph.hits++;return node;}
 const actions=completeMoveAdapter().actions(state);
 node={key,state,actions,pairs:actions[0].map(()=>actions[1].map(()=>null)),cursor:0,
  value:heuristic(state),nativeStateKey:state.key,lower:0,upper:1,parents:new Set(),prior:{n:0,sum:0,horizons:{}},session:{},result:null,visits:0};
 return remember(graph,key,node);
}
function pair(node,r,c){
 return node.pairs[r][c]??={pending:[{state:node.state,a:node.actions[0][r],b:node.actions[1][c],probability:1}],
  edges:new Map(),terminal:0,terminalMass:0,missingMass:0,steps:0,complete:false,deferred:false};
}
export function turnPairBounds(p){
 if(!p)return {lower:0,upper:1};
 let lower=p.terminal,upper=p.terminal+p.missingMass+p.pending.reduce((s,b)=>s+b.probability,0);
 for(const edge of p.edges.values()){
  for(const [key,probability] of edge.nativeKeys){
   // Observation aliases can share an estimate. Only an identical full
   // native state can supply a proven continuation bound for this edge.
   if(key===edge.node.nativeStateKey){lower+=probability*edge.node.lower;upper+=probability*edge.node.upper;}
   else upper+=probability;
  }
 }
 return {lower:Math.max(0,Math.min(1,lower)),upper:Math.max(lower,Math.min(1,upper))};
}
export function backupTurnBounds(node,options={}){
 if(!node.pairs.length)return false;
 const intervals=node.pairs.map(row=>row.map(turnPairBounds)),lo=intervals.map(row=>row.map(v=>v.lower)),hi=intervals.map(row=>row.map(v=>v.upper));
 const previous=[node.lower,node.upper],v=matrixBounds(lo,hi,64);
 node.lower=Math.max(node.lower,v.lower);node.upper=Math.max(node.lower,Math.min(node.upper,v.upper));
 node.active=options.boundPruning===false?{rows:lo.map((_,i)=>i),columns:lo[0].map((_,j)=>j),pruned:0}:matrixPruning(lo,hi);
 node.threshold=proofThreshold(node.lower,node.upper);
 return node.lower>previous[0]+1e-12||node.upper<previous[1]-1e-12;
}
function propagateBounds(graph,node,options={}){
 const dirty=graph.boundDirty??={queue:[],set:new Set()};
 const mark=n=>{if(!dirty.set.has(n)){dirty.set.add(n);dirty.queue.push(n);}};mark(node);
 let count=0;
 while(dirty.queue.length&&count++<128){
  if(options.shouldStop?.())break;
  const current=dirty.queue.shift();dirty.set.delete(current);
  if(backupTurnBounds(current,options))for(const parent of current.parents)mark(parent);
 }
}
export function expandTurn(graph,node,options,reasons){
 const previous=graph.processingKey;graph.processingKey=node.key;
 try {
 const deadline=performance.now()+Math.max(0,options.timeMs??20),adapter=completeMoveAdapter(reasons);
 const pairs=node.actions[0].length*node.actions[1].length;let work=0;
 while(pairs&&performance.now()<deadline&&!options.shouldStop?.()){
  backupTurnBounds(node,options);
  let chosen=null;
  for(let i=0;i<pairs;i++){
   const index=node.cursor++%pairs,r=Math.floor(index/node.actions[1].length),c=index%node.actions[1].length;
   const p=pair(node,r,c);
   if(!node.active.rows.includes(r)||!node.active.columns.includes(c)){p.pruned=true;continue;}
   if(!p.complete&&!p.deferred&&!p.pruned){chosen=p;break;}
  }
  if(!chosen)break;
  const item=chosen.pending.pop();if(!item){chosen.complete=chosen.missingMass===0;continue;}
  for(const branch of adapter.transitions(item.state,item.a,item.b)){
   const probability=item.probability*branch.probability;
   if(!branch.state){chosen.missingMass+=probability;continue;}
   if(branch.state.kind==='chance'){chosen.pending.push({...branch,state:branch.state,a:0,b:0,probability});continue;}
   const value=adapter.terminal(branch.state);
   if(value!==null){chosen.terminal+=probability*value;chosen.terminalMass+=probability;continue;}
   const child=turnNode(graph,branch.state,options),old=chosen.edges.get(child.key);
   child.parents.add(node);
   if(old){old.probability+=probability;old.nativeKeys.set(branch.state.key,(old.nativeKeys.get(branch.state.key)||0)+probability);graph.merged++;}
   else chosen.edges.set(child.key,{node:child,probability,nativeKeys:new Map([[branch.state.key,probability]])});
  }
  chosen.steps++;work++;
  if(!chosen.pending.length)chosen.complete=chosen.missingMass===0;
  // Keep unresolved mass and sampled fallback for combinatorial turns.
  if(chosen.steps>=512||chosen.pending.length>1024)chosen.deferred=true;
 }
 graph.expansions+=work;propagateBounds(graph,node,options);return work;
 }finally{graph.processingKey=previous;}
}
export function turnMass(p){return p.terminalMass+p.missingMass+[...p.edges.values()].reduce((s,e)=>s+e.probability,0)+p.pending.reduce((s,e)=>s+e.probability,0);}
export function backedValue(node){
 if(!node.pairs.every(row=>row.every(p=>p?.complete)))return null;
 // An expanded turn is not a solved continuation. Do not turn unvisited
 // children's neutral initialization into an apparently informed estimate.
 if(node.pairs.some(row=>row.some(p=>[...p.edges.values()].some(e=>!e.node.result?.provisional_usable&&!e.node.prior.n&&e.node.lower!==e.node.upper))))return null;
 // A short child forecast must not replace a deeper root forecast.
 const required=Math.max(0,(node.result?.estimate_turns||0)-1);
 if(node.pairs.some(row=>row.some(p=>[...p.edges.values()].some(e=>e.node.lower!==e.node.upper&&(e.node.result?.estimate_turns??e.node.prior.estimateStats?.horizon??0)<required))))return null;
 const matrix=node.pairs.map(row=>row.map(p=>p.terminal+[...p.edges.values()].reduce((s,e)=>s+e.probability*e.node.value,0)));
 const v=matrixBounds(matrix,matrix,256);return (v.lower+v.upper)/2;
}
function refine(graph,node,options,reasons,timeMs,evaluator){
 const previous=graph.processingKey;graph.processingKey=node.key;
 try {
 const result=evaluator?.continuation(node.state,reasons,{...options,deadline:Math.min(options.deadline??Infinity,performance.now()+Math.max(0,timeMs))})||simulateSampledMovesCore(node.state,{...options,timeMs,session:node.session,continuationPolicies:graph.continuationPolicies??=new BoundedCache({name:'continuation-policies',owner:'retained-graph',limit:2048}),retainAfterTurn:options.retainChildren===false?undefined:(state,unbiased,horizon)=>{
  const child=turnNode(graph,state,options);
  if(!unbiased)return null;
  return value=>{child.prior.n++;child.prior.sum+=value;child.prior.horizons[horizon]=(child.prior.horizons[horizon]||0)+1;
   recordHorizonSample(child.prior,horizon,value);
   if(!child.result?.provisional_usable)child.value=stratumMean(child.prior);};
 }},reasons,evaluator);
 node.result=result;node.visits++;
 if(result.certified&&result.lower===result.upper)node.lower=node.upper=result.lower;
 graph.rollouts=(graph.rollouts||0)+(result.certified?0:result.nodes);
 if(result.provisional_usable)node.value=result.score/100;
 return result;
 }finally{graph.processingKey=previous;}
}
function selectChild(node,options={}){
 const influence=new Map();backupTurnBounds(node,options);
 let active=node.active;
 const cells=node.session.sampledMoves?.cells;
 if(options.boundPruning!==false&&cells){
  const limits=cells.map(row=>row.map(c=>samplingConfidenceBounds(c,0.01/(2*cells.length*cells[0].length))));
  const statistical=matrixPruning(limits.map(row=>row.map(v=>v.lower)),limits.map(row=>row.map(v=>v.upper)));
  const rows=active.rows.filter(r=>statistical.rows.includes(r)),columns=active.columns.filter(c=>statistical.columns.includes(c));
  if(rows.length&&columns.length)active={rows,columns};
 }
 for(const r of active.rows)for(const c of active.columns){const p=node.pairs[r][c];if(p)for(const edge of p.edges.values()){
  if(!edge.node.state||edge.node===node||edge.node.result?.sampling_complete)continue;
  const crossing=thresholdDecision(edge.node.lower,edge.node.upper,node.threshold)==='unresolved';
  const width=edge.node.upper-edge.node.lower;
  const score=edge.probability*Math.max(0.01,width)*(crossing?2:1)/(1+edge.node.visits);
  influence.set(edge.node,(influence.get(edge.node)||0)+score);
 }
 }
 return [...influence].sort((a,b)=>b[1]-a[1])[0]?.[0];
}
export function simulateRetainedTurn(initial,options,reasons,evaluator){
 const outer=options.session||{},graph=outer.turnGraph??={nodes:new Map(),limit:options.retainedStateLimit??256,hits:0,merged:0,expansions:0};
 const previousHits=graph.hits,node=turnNode(graph,initial,options),reused=graph.hits>previousHits;
 node.wasRerooted=reused&&graph.lastRootKey!==node.key;graph.lastRootKey=node.key;
 graph.activeKey=node.key;
 const start=performance.now(),budget=Math.max(0,options.timeMs??150);
 // A cached estimate is publishable before any new rollout. Worker uses this
 // on rerooting, then resumes normal refinement in its following pass.
 if(options.warmOnly&&reused&&(node.result?.provisional_usable||node.prior.n))return report(node,node.result||emptyResult(options),true,0,graph,start,options);
 let result=node.result,added=0;
 const cold=!node.result?.provisional_usable&&!node.prior.n;
 if(!result?.sampling_complete||result.sample_target_per_pair!==(options.samplesPerPair??128)){
  result=refine(graph,node,options,reasons,budget*(cold?1:0.75),evaluator);added=result.nodes;
 }
 outer.sampledMoves=node.session.sampledMoves;
 if(cold){
  if(reasons.size){result={...result,provisional_usable:false,input_blocked:true,unresolved_reasons:[...reasons]};node.result=result;}
  return report(node,result,reused,added,graph,start,options);
 }
 const left=()=>Math.max(0,budget-(performance.now()-start));
 if(left()>0)expandTurn(graph,node,{...options,timeMs:Math.min(left(),budget*0.15)},reasons);
 const child=selectChild(node,options);
 if(child&&left()>0)expandTurn(graph,child,{...options,timeMs:Math.min(left(),budget*0.03)},reasons);
 if(child&&left()>0)refine(graph,child,{...options,samplesPerPair:options.continuationSamplesPerPair??options.samplesPerPair??128},reasons,left(),evaluator);
 const backup=backedValue(node);if(backup!==null)node.value=backup;
 if(reasons.size){
  result={...result,provisional_usable:false,input_blocked:true,unresolved_reasons:[...reasons]};
  node.result=result;
 }
 return report(node,result,reused,added,graph,start,options);
}
function emptyResult(options){return {complete:false,certified:false,approximate:true,sampling_complete:false,lower:0,upper:1,lower_bound:0,upper_bound:100,
 unresolved:1,score_kind:'simulation-estimate',samples:0,samples_per_pair:0,sample_target_per_pair:options.samplesPerPair??128,rollout_turn_limit:options.rolloutTurns??12,
 input_blocked:false,omitted_moves:[],unresolved_reasons:[],move_engine:'pokemon-showdown 0.11.11 with Run & Bun overrides'};}
function report(node,result,reused,added,graph,start,options={}){
 if(result.certified&&result.complete&&!result.input_blocked)return {...result,root_reused:reused||result.root_reused,retained_states:graph.nodes.size,elapsed_ms:performance.now()-start};
 const exactTurn=backedValue(node)!==null,ready=!result.unresolved_reasons?.length&&
  (result.provisional_usable||node.prior.n>0);
 const score=ready?Math.max(1,Math.min(99,node.value*100)):null;
 return {...result,score,provisional_score:score,provisional_usable:!!ready,partial_estimate:node.value,nodes:added,
  algorithm:'retained-next-turn-native-hybrid',opponent_model:'simultaneous minimax root; retained sampled continuation estimates',
  root_reused:reused||result.root_reused,retained_states:graph.nodes.size,retained_next_turn:true,
  reused_next_turn_estimate:node.wasRerooted&&(node.prior.n>0||!!node.result?.provisional_usable),next_turn_exact:exactTurn,
  // The legacy flag describes first-turn expansion, not proof of continuation values.
  next_turn:{expansion_complete:exactTurn,continuation_value_kind:'estimate'},
  total_native_rollouts:graph.rollouts||0,
  next_turn_expansions:graph.expansions,merged_next_turn_states:graph.merged,continuation_samples:node.prior.n,
  continuation_sample_horizons:node.prior.horizons,
  bound_pruned_actions:node.active?.pruned||0,native_bound_width:node.upper-node.lower,proof_threshold:node.threshold,
  next_turn_pairs_complete:node.pairs.flat().filter(p=>p?.complete).length,next_turn_pairs_total:node.pairs.flat().length,
  sampling_complete:result.sampling_complete&&node.pairs.every(row=>row.every(p=>p?.complete||p?.deferred||p?.pruned||p?.missingMass>0))&&
   !selectChild(node,options),elapsed_ms:performance.now()-start};
}
