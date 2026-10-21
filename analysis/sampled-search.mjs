// Responsive approximation for complex active matchups. The native engine
// executes every sampled turn. Only continuation move selection and unfinished
// endings are heuristic; these values are never certified search bounds.
import {matrixBounds,matrixPruning,thresholdDecision,proofThreshold} from './search.mjs';
import {completeMoveDex,restoreCompleteBattle,installChanceTape,MissingInput,packed,completeMoveAdapter,nativeMoveChoices} from './native-battle.mjs';
import {npcMoveDistribution,weightedNpcBounds} from '../run-bun/npc-ai.mjs';
import {CONTINUATION_VERSION,continuationValue,nativeContinuationPolicy,drawContinuation,continuationPolicyValue} from './continuation-policy.mjs';
import {BoundedCache,putCached} from './bounded-cache.mjs';
import {strategyOrdering} from './strategy-registry.mjs';
function rng(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function choices(p){return nativeMoveChoices(p).map(m=>({slot:m.slot,id:m.id,move:completeMoveDex.moves.get(m.id),usable:true}));}
function terminal(b){return b.p1.active[0].hp<=0?0:b.p2.active[0].hp<=0?1:b.ended?(b.winner==='Player'?1:0):null;}
// All caches use the native mechanics state key, including uncertainty markers.
const keep=(map,key,value,limit=2048)=>putCached(map,key,value,limit);
function workClock(){
 if(typeof process.threadCpuUsage==='function'){const usage=process.threadCpuUsage();return (usage.user+usage.system)/1000;}
 return performance.now();
}
export function exactEnding(initial,a,b,options){
 const adapter=completeMoveAdapter(),pending=[{state:initial,probability:1,a,b}];let value=0,count=0;
 while(pending.length){
  if(++count>48||options.shouldStop?.()||performance.now()>(options.exactDeadline??Infinity))return null;
  const item=pending.pop(),v=adapter.terminal(item.state);
  if(v!==null){value+=item.probability*v;continue;}
  if(item.state.kind!=='chance'&&item.state!==initial)return null;
  for(const branch of adapter.transitions(item.state,item.a,item.b)){
   if(!branch.state)return null;
   pending.push({state:branch.state,probability:item.probability*branch.probability,a:0,b:0});
  }
 }
 return value;
}
export function stratumMean(cell){
 if(cell.exact!==undefined)return cell.exact;
 if(cell.estimateStats)return stratumMean(cell.estimateStats);
 if(!cell.strata?.length)return cell.n?cell.sum/cell.n:0.5;
 const sampled=cell.strata.reduce((sum,s)=>sum+s.probability*(s.n?s.sum/s.n:0.5),0);
 return cell.warm?(cell.warm.sum+sampled*(cell.n-cell.warm.n))/cell.n:sampled;
}
// A rollout target changes with depth. Keep work counters across depths, but
// replace the displayed estimator once a new depth has broad chance coverage.
// Until then the last covered epoch remains usable; confidence always uses the
// newest epoch so stale samples cannot justify pruning the deeper search.
export function recordHorizonSample(cell,horizon,value,stratum=-1,terminal=false){
 if(cell.confidenceStats?.horizon!==horizon)cell.confidenceStats={horizon,n:0,sum:0,allTerminal:true,strata:cell.strata?.map(s=>({probability:s.probability,n:0,sum:0}))};
 const stats=cell.confidenceStats;stats.n++;stats.sum+=value;stats.allTerminal&&=terminal;
 if(stratum>=0){const s=stats.strata[stratum];s.n++;s.sum+=value;}
 const covered=!stats.strata?.length||stats.strata.every(s=>s.n>0);
 // Completed terminal trajectories need no heuristic-depth stabilization.
 // This remains a sampled estimator, never a certificate of a forced result.
 const decisive=stats.allTerminal&&(stats.sum===0||stats.sum===stats.n);
 if(covered&&(!cell.estimateStats||horizon>=cell.estimateStats.horizon&&(stats.n>=4||decisive)))cell.estimateStats=stats;
}
export const DEFAULT_ROLLOUT_TURNS=4;
export function rolloutHorizon(samples,branching,turnLimit=DEFAULT_ROLLOUT_TURNS){
 return branching&&samples<1?1:turnLimit;
}
export function nextChanceStratum(strata){
 return strata.reduce((best,s,i)=>s.n<strata[best].n||s.n===strata[best].n&&s.probability>strata[best].probability?i:best,0);
}
// Conditional bounds on the sampled payoff table, NOT battle certificates.
// Unvisited pairs stay [0,1]. A covered decisive row/column can determine the
// table's point estimate without inventing values for unrelated pairs.
export function coveredTacticalValue(cells,options={}){
 const known=c=>{
  if(c.unknown)return false;
  if(c.exact!==undefined)return true;
  const stats=c.estimateStats,terminal=c.n>0&&c.terminal===c.n;
  return stats?.n>0&&(stats.horizon>=2||terminal)&&(!stats.strata||stats.strata.every(s=>s.n>0));
 };
 if(!cells.some(row=>row.some(known)))return null;
 const lower=cells.map(row=>row.map(c=>known(c)?stratumMean(c):0)),upper=cells.map(row=>row.map(c=>known(c)?stratumMean(c):1));
 const bounds=options.npcProbabilities?weightedNpcBounds(lower,upper,options.npcProbabilities):matrixBounds(lower,upper,128);
 return bounds.upper-bounds.lower<=1e-12?(bounds.lower+bounds.upper)/2:null;
}
function rollout(initial,a,b,seed,turnLimit,options,cell,cache,evaluator){
 const game=restoreCompleteBattle(initial),random=rng(seed);
 const uncertain={unknownFirst:[...(initial.unknownFirst||[])],unknownHistory:[...(initial.unknownHistory||[])],unknownGender:initial.unknownGender};
 let stratum=-1,draws=0,nativeTurn=0,retainedChild=null;
 const finish=(value,terminal)=>{
  retainedChild?.(value,terminal);
  return {value,terminal,stratum};
 };
 installChanceTape(game,[],initial.unknownNature,uncertain,branches=>{
  const first=draws++===0;
  if(nativeTurn===0&&first&&branches.length>1&&branches.length<=4){
   cell.strata??=branches.map(c=>({probability:c.probability,n:0,sum:0}));
   // Allocate equally across strata, then combine their means with the actual
   // native probabilities. Rare outcomes are never counted as common ones.
   stratum=nextChanceStratum(cell.strata);
   return branches.slice(0,stratum).reduce((s,c)=>s+c.probability,0)+branches[stratum].probability*random();
  }
  return random();
 });
 for(let turn=0;turn<turnLimit;turn++){
  nativeTurn=turn;
  if(options.shouldStop?.()||performance.now()>options.deadline)return null;
  let moves=[a,b];
  if(turn){
   const state=packed(game,initial.unknownNature,uncertain);
   const solved=evaluator?.continuation(state,new Set(),options);
   if(solved){cache.exact++;return finish(solved.score/100,false);}
   let npcWeights;
   if(options.opponentModel==='npc-ai'){
    const key=state.key+'|'+JSON.stringify(options.npcAi||{});
    npcWeights=cache.npcPolicies.get(key);
    if(!npcWeights){npcWeights=npcMoveDistribution(game,options.npcAi);keep(cache.npcPolicies,key,npcWeights);}
   }
   const policy=nativeContinuationPolicy(state,cache.policies,{...options,npcWeights});
   if(!policy)return null;
   if(turn===turnLimit-1){
    const value=continuationPolicyValue(policy);
    if(value!==null)return finish(value,false);
   }
   moves=drawContinuation(policy,random);
   // Integrate a small all-terminal native turn instead of sampling its rare
   // outcomes. This is conditional expectation, not a claim that the policy
   // leading here is optimal. Cache both successes and ineligible endings.
   if(policy.actions.every(a=>a.length===1)){
    const key=state.key+'|'+moves.join(',');cache.endings??=new BoundedCache({name:'terminal-turn-expectations',owner:'sampled-session',limit:2048});
    let exact=cache.endings.get(key);
    if(exact===undefined)exact=keep(cache.endings,key,exactEnding(state,...moves,{...options,exactDeadline:options.deadline}));
    if(exact!==null)return finish(exact,false);
   }
  }
  for(let i=0;i<2;i++)if(!game.choose(`p${i+1}`,`move ${moves[i]}`))throw Error(`Sampled move selection was rejected on turn ${turn+1} for p${i+1}, slot ${moves[i]}: ${game.sides[i].choice.error}`);
  const value=terminal(game);if(value!==null)return finish(value,true);
  uncertain.unknownFirst=[false,false];uncertain.unknownHistory=[false,false];
  if(turn===0&&options.retainAfterTurn)retainedChild=options.retainAfterTurn(packed(game,initial.unknownNature,uncertain),draws>0,turnLimit-1);
 }
 const cutoff=continuationValue(game,options);return cutoff===null?null:finish(cutoff,false);
}
export function samplingConfidenceBounds(cell,delta=0.01){
 if(cell.exact!==undefined)return {lower:cell.exact,upper:cell.exact,radius:0};
 if(cell.unknown)return {lower:0,upper:1,radius:1};
 const stats=cell.confidenceStats||cell,n=stats.n||0;
 if(!n)return {lower:0,upper:1,radius:1};
 let mean=stats.sum/n,varianceWeight=1/n;
 if(stats.strata?.length){
  if(stats.strata.some(s=>!s.n))return {lower:0,upper:1,radius:1};
  mean=stats.strata.reduce((s,c)=>s+c.probability*c.sum/c.n,0);
  varianceWeight=stats.strata.reduce((s,c)=>s+c.probability**2/c.n,0);
 }
 // Allocate error across repeated checks (summable 1/(n+1)^2 spending).
 // This bounds the rollout estimator under independent bounded sampling,
 // not the true battle value of a heuristic continuation policy.
 const radius=Math.min(1,Math.sqrt(varianceWeight*Math.log(4*(n+1)**2/Math.max(1e-12,delta))/2));
 return {lower:Math.max(0,mean-radius),upper:Math.min(1,mean+radius),radius};
}
export function allocation(cells,target,options={}){
 const floor=Math.min(target,16),count=cells.length*cells[0].length;
 const intervals=cells.map(row=>row.map(c=>samplingConfidenceBounds(c,(options.samplingDelta??0.01)/(2*count))));
 const low=intervals.map(row=>row.map(c=>c.lower)),high=intervals.map(row=>row.map(c=>c.upper));
 if(options.npcProbabilities){
  const weights=options.npcProbabilities,bounds=weightedNpcBounds(low,high,weights);
  const bestLower=bounds.lower;let selected=null,best=-Infinity,remaining=0,pruned=0;
  for(let i=0;i<cells.length;i++){
   const irrelevant=bounds.upperRows[i]<bestLower-1e-12;if(irrelevant)pruned++;
   for(let j=0;j<cells[i].length;j++){
    if(weights[j]===0)continue;
    const c=cells[i][j],quota=irrelevant?floor:target,needed=Math.max(quota,c.strata?.length||1);
    if(c.n>=needed)continue;remaining++;
    const priority=c.n<floor?1000-c.n:weights[j]*intervals[i][j].radius*(irrelevant?0.01:1)/(1+c.n/floor);
    if(priority>best){best=priority;selected={r:i,c:j,close:!irrelevant};}
   }
  }
  return {selected,remaining,pruned,threshold:proofThreshold(bounds.lower,bounds.upper)};
 }
 const active=options.boundPruning===false?{rows:low.map((_,i)=>i),columns:low[0].map((_,j)=>j),pruned:0}:matrixPruning(low,high);
 const bounds=matrixBounds(low,high,32),threshold=proofThreshold(bounds.lower,bounds.upper);
 let selected=null,best=-Infinity,remaining=0;
 for(let i=0;i<cells.length;i++)for(let j=0;j<cells[i].length;j++){
  const c=cells[i][j],irrelevant=!active.rows.includes(i)||!active.columns.includes(j);
  const quota=c.exact!==undefined?1:(irrelevant?floor:target),needed=Math.max(quota,c.strata?.length||1);
  if(c.n>=needed)continue;
  remaining++;
  const crossing=thresholdDecision(low[i][j],high[i][j],threshold)==='unresolved';
  const tactical=options.tacticalCoverage&&(c.estimateStats?.horizon??0)<2?((options.tacticalRows?.[i]??0)+(options.tacticalColumns?.[j]??0)):0;
  const priority=100*tactical+(c.n<floor?1000-c.n:(irrelevant?0.01:1)*intervals[i][j].radius*(crossing?2:1)/(1+c.n/floor));
  if(priority>best){best=priority;selected={r:i,c:j,close:!irrelevant};}
 }
 return {selected,remaining,pruned:active.pruned,threshold};
}
export function simulateSampledMovesCore(initial,options,reasons,evaluator){
 const session=options.session?(options.opponentModel==='npc-ai'?(options.session.npcMoves??={}):(options.session.sampledMoves??={})):{};
 const cache=session.cache??={roots:new BoundedCache({name:'sampled-roots',owner:'sampled-session',limit:64}),policies:new BoundedCache({name:'continuation-policies',owner:'sampled-session',limit:2048}),hits:0,exact:0};
 if(options.continuationPolicies)cache.policies=options.continuationPolicies;
 cache.npcPolicies??=new BoundedCache({name:'npc-policies',owner:'sampled-session',limit:2048});
 const target=options.samplesPerPair??128,turnLimit=options.rolloutTurns??DEFAULT_ROLLOUT_TURNS;
 const rootKey=initial.key+'|policy-v'+CONTINUATION_VERSION+'|'+turnLimit+'|'+(options.opponentModel||'minimax')+'|'+JSON.stringify(options.npcAi||{})+'|filter:'+Number(options.filterUselessTurns!==false);
 let root=cache.roots.get(rootKey),reused=!!root;
 if(!root){
  const game=restoreCompleteBattle(initial),actions=game.sides.map(s=>{const legal=choices(s.active[0]);return legal.length?legal.map(m=>m.slot):[1];});
  const hints=game.sides.map(s=>strategyOrdering(s.active[0],choices(s.active[0])));
  const tactical=game.sides.map((s,side)=>choices(s.active[0]).map((choice,i)=>{const move=choice.move;return (move.status?4:move.volatileStatus?2:move.boosts||move.self?.boosts?1:0)+hints[side].priorities[i];}));
  root=keep(cache.roots,rootKey,{key:initial.key,actions,tactical,strategies:hints.map(h=>h.matches),tacticalMs:0,tacticalWorkMs:0,cells:actions[0].map(()=>actions[1].map(()=>({n:0,sum:0,terminal:0,unknown:0}))),total:0,reasons:new Set()},64);
  if(options.opponentModel==='npc-ai'){
   try{root.npcPolicy=npcMoveDistribution(game,options.npcAi);}catch(error){if(!(error instanceof MissingInput))throw error;root.reasons.add(error.message);}
  }

 }
 for(const reason of root.reasons)reasons.add(reason);
 if(options.opponentModel==='npc-ai'&&!root.npcPolicy)return {score:null,provisional_score:null,provisional_usable:false,lower:0,upper:1,lower_bound:0,upper_bound:100,complete:false,approximate:true,algorithm:'npc-ai-weighted-native-rollouts',opponent_model:'Run & Bun community NPC move scoring',input_blocked:true,unresolved_reasons:[...reasons],omitted_moves:[],nodes:0,samples:0};
 if(root.npcPolicy)options={...options,npcProbabilities:root.actions[1].map(slot=>root.npcPolicy.find(p=>p.slot===slot)?.probability||0)};
 Object.assign(session,root);
 const start=performance.now();options={...options,deadline:start+Math.max(1,options.timeMs??150)};let added=0,work;
 const alreadyTactical=coveredTacticalValue(root.cells,options)!==null;
 const covered=()=>root.cells.every(row=>row.every((c,j)=>options.npcProbabilities?.[j]===0||c.n>0&&(!c.strata||c.strata.every(s=>s.n>0))));
 const pilot=()=>!options.npcProbabilities&&!covered()&&root.tacticalWorkMs<(options.tacticalPilotMs??300);
 while(!options.warmOnly&&(work=allocation(root.cells,target,{...options,tacticalCoverage:covered()||pilot(),tacticalRows:root.tactical?.[0],tacticalColumns:root.tactical?.[1]})).selected&&(added===0||performance.now()-start<(options.timeMs??150))&&!options.shouldStop?.()){
  const {r,c}=work.selected,cell=root.cells[r][c],index=r*root.actions[1].length+c;
  const seed=(parseInt(initial.key.slice(0,8),16)^Math.imul(cell.n+1,0x9e3779b9)^Math.imul(index+1,0x85ebca6b))>>>0;
  try{
   // Give forcing status/setup lines a bounded pilot before the expensive
   // broad leaf evaluations. Unsuccessful pilots yield back to broad coverage.
   const branching=root.actions[0].length*root.actions[1].length>1;
   const initialCoverage=covered();
   const tacticalPilot=pilot()&&((root.tactical?.[0][r]||0)+(root.tactical?.[1][c]||0)>0);
   const horizon=tacticalPilot?turnLimit:branching&&!initialCoverage?1:rolloutHorizon(cell.n,branching,turnLimit);
   const rolloutStart=performance.now(),workStart=tacticalPilot?workClock():0;
   let value;
   try{value=rollout(initial,root.actions[0][r],root.actions[1][c],seed,horizon,options,cell,cache,evaluator);}
   finally{if(tacticalPilot){root.tacticalMs+=performance.now()-rolloutStart;root.tacticalWorkMs+=workClock()-workStart;}}
   if(value===null)break;
   cell.sum+=value.value;if(value.terminal)cell.terminal++;
   recordHorizonSample(cell,horizon,value.value,value.stratum,value.terminal);
   if(value.stratum>=0){const s=cell.strata[value.stratum];s.n++;s.sum+=value.value;}
  }catch(error){if(!(error instanceof MissingInput))throw error;reasons.add(error.message);root.reasons.add(error.message);cell.unknown++;}
  cell.n++;root.total++;added++;
  if(!alreadyTactical&&!reasons.size&&!covered()&&coveredTacticalValue(root.cells,options)!==null)break;
 }
 session.total=root.total;
 const fullCoverage=root.cells.every(row=>row.every((c,j)=>options.npcProbabilities?.[j]===0||c.n>0&&c.unknown===0&&(!c.strata||c.strata.every(s=>s.n>0))));
 const tacticalValue=reasons.size?null:coveredTacticalValue(root.cells,options),ready=fullCoverage||tacticalValue!==null;
 const estimateTurns=!fullCoverage&&tacticalValue!==null?Math.max(...root.cells.flat().map(c=>c.estimateStats?.horizon||0)):Math.min(...root.cells.flat().map(c=>c.estimateStats?.horizon||0));
 const matrix=root.cells.map(row=>row.map(stratumMean)),value=options.npcProbabilities?weightedNpcBounds(matrix,matrix,options.npcProbabilities):matrixBounds(matrix,matrix,512),point=ready?Math.max(1,Math.min(99,tacticalValue!==null?100*tacticalValue:50*(value.lower+value.upper))):null;
 const finalAllocation=allocation(root.cells,target,options),done=!finalAllocation.selected;
 return {score:point,provisional_score:point,provisional_usable:ready,score_kind:'simulation-estimate',
  lower:0,upper:1,lower_bound:0,upper_bound:100,unresolved:1,complete:false,certified:false,approximate:true,sampling_complete:done,
  algorithm:root.npcPolicy?'npc-ai-weighted-native-rollouts':'adaptive-stratified-native-rollouts',opponent_model:root.npcPolicy?'Run & Bun community NPC move scoring; optimized player root; native turn probes for player continuations':'simultaneous minimax root; native turn probes with mixed continuation strategies',npc_move_probabilities:root.npcPolicy,move_engine:'pokemon-showdown 0.11.11 with Run & Bun overrides',
  nodes:added,samples:root.total,samples_per_pair:Math.min(...root.cells.flat().map(c=>c.n)),sample_target_per_pair:target,estimate_turns:estimateTurns,rollout_turn_limit:turnLimit,
  elapsed_ms:performance.now()-start,budget_exhausted:!done,retained_states:cache.policies.size+cache.roots.size,root_reused:reused,
  cache_hits:cache.hits,exact_endings:cache.exact,confidence_pruned_actions:finalAllocation.pruned,sampling_confidence_delta:options.samplingDelta??0.01,proof_threshold:finalAllocation.threshold,
  full_root_coverage:fullCoverage,early_tactical_estimate:!fullCoverage&&tacticalValue!==null,tactical_pilot_ms:root.tacticalMs,tactical_pilot_work_ms:root.tacticalWorkMs,
  continuation_policy:'native-turn-probes-v'+CONTINUATION_VERSION,continuation_policy_probes_per_pair:2,cutoff_evaluation:'native passive effects, action capabilities and finite resources; heuristic, not a certificate',
  omitted_moves:[],unresolved_reasons:[...reasons],input_blocked:false,partial_estimate:point===null?0.5:point/100};
}

