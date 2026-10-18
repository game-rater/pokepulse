import {parentPort,workerData} from 'node:worker_threads';
import {scoreBattle} from './profile.mjs';
import {refineUntilResolved} from './refinement.mjs';
const generation=new Int32Array(workerData.generation);
const engineMode=workerData.engineMode||'auto';
const halt=workerData.halt?new Int32Array(workerData.halt):null;
let context=null,session={};
function trim(map,limit){
  if(!map)return;
  while(map.size>limit)map.delete(map.keys().next().value);
}
// Rerooting changes the initial state, while state bounds stay in memory.
parentPort.on('message',async({version,args,budgets,modelContext})=>{
  const obsolete=()=>Atomics.load(generation,0)!==version||(halt&&Atomics.load(halt,0)===version);
  const deadline=engineMode==='exact'?performance.now()+(workerData.exactProbeMs??2000):Infinity;
  if(obsolete())return;
  if(context!==modelContext){
    context=modelContext;
    // Sampled caches are keyed by the complete native state, including build,
    // mechanics and uncertainty. Preserve them when observed effects change.
    const cache=session.sampledMoves?.cache;
    const turnGraph=session.turnGraph;
    const npcMoves=session.npcMoves;
    session={...(cache?{sampledMoves:{cache}}:{}),...(turnGraph?{turnGraph}:{}),...(npcMoves?{npcMoves}:{})};
  }
  const retained=session;
  const retainedCount=()=>(retained.graph?.size||0)+(retained.completeMoves?.graph?.size||0);
  let exactPasses=0;
  const actionPairs=args[4].player.moves.length*args[4].opponent.moves.length;
  const run=options=>{
    const npc=args[7]?.opponent_model==='npc-ai';
    const forceNativeForecast=npc||engineMode==='hybrid'||engineMode==='auto'&&(!!retained.nativeFallback||!!retained.turnGraph?.nodes.size||(actionPairs>=4&&exactPasses>=4));
    if(forceNativeForecast)retained.nativeFallback=true;
    const result=scoreBattle(...args,{...options,opponentModel:npc?'npc-ai':'minimax',npcAi:args[7]?.npc_ai,forceNativeForecast,progressive:true,approximateCompleteMoves:npc||engineMode!=='exact',session:retained,
      shouldStop:()=>obsolete()||performance.now()>=deadline||(engineMode==='exact'&&retainedCount()>=20000)});
    if(options.timeMs>0&&!result.outlook.approximate&&!result.outlook.complete)exactPasses++;
    if(engineMode==='exact'&&!result.outlook.complete&&(performance.now()>=deadline||retainedCount()>=20000)){
      result.outlook.search_paused=true;result.outlook.pause_reason=retainedCount()>=20000?'Exact retained state limit reached':'Exact probe time budget reached';
    }
    return result;
  };
  const publish=(result,{timeMs,pass=0})=>{
    if(obsolete())return;
    result.outlook.pass_time_budget_ms=timeMs;
    result.outlook.refinement_pass=pass;
    result.outlook.retained_states=(retained.certificates?.size||0)+(retained.completeMoves?.certificates?.size||0)+
      (retained.turnGraph?.nodes.size||retained.sampledMoves?.cache?.roots.size||0)+(retained.npcMoves?.cache?.roots.size||0)+(retained.npcMoves?.cache?.npcPolicies.size||0);
    parentPort.postMessage({version,result});
  };
  // Return a matching descendant's saved bounds before expanding further.
  if(session.certificates?.size||session.completeMoves?.certificates?.size||session.turnGraph?.nodes.size||session.npcMoves?.cache?.roots.size){
    const warm=run({timeMs:0,warmOnly:true});
    if(warm.outlook.root_reused){
      publish(warm,{timeMs:0});
      if(warm.outlook.complete)return;
    }
  }
  await refineUntilResolved({run,obsolete,budgets,publish:(result,pass)=>{
    publish(result,pass);
    // Depth-specific memo entries may be evicted. State certificates survive
    // across passes and turns so completed work is never discarded here.
    trim(retained.cache,80000);
  }});
});
