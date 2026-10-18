import {benchmarkReference} from './benchmark-oracles.mjs';
import {simulateCompleteMoves,createCompleteBattle} from '../analysis/complete-moves.mjs';
import {searchFixtures,observeSimpleTurn} from './search-benchmark-fixtures.mjs';
import {predictionReport} from '../analysis/result-contract.mjs';
import {createHash} from 'node:crypto';
const id=process.argv[2],mode=process.argv[3],seconds=Number(process.argv[4]||3),opponentModel=process.argv[5]||'minimax';
const fixture=searchFixtures.find(f=>f.id===id);
if(!fixture||!['baseline','hybrid'].includes(mode)||!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid benchmark arguments');
const reference=benchmarkReference(fixture,opponentModel),expected=reference.expected_percent;
const options={approximateCompleteMoves:true,retainedTurn:mode==='hybrid',samplesPerPair:128,timeMs:100,opponentModel};
// Warm module/engine initialization equally; measurements exclude startup.
createCompleteBattle(fixture.snapshot);global.gc?.();
const session={},start=performance.now(),cpuStart=process.cpuUsage();
let first=null,result,passes=0,maxSlice=0,peakRSS=process.memoryUsage().rss;
const readings=[];
do{
 const passStart=performance.now();result=simulateCompleteMoves(fixture.snapshot,{...options,session});
 const elapsed=performance.now()-start;passes++;maxSlice=Math.max(maxSlice,performance.now()-passStart);
 peakRSS=Math.max(peakRSS,process.memoryUsage().rss);
 const prediction=predictionReport(result);
 if(first===null&&Number.isFinite(prediction.estimate.score))first=elapsed;
 readings.push({elapsed_ms:elapsed,score:prediction.estimate.score,samples:result.samples,
  certainty:prediction.kind,certificate_width_pp:prediction.certificate?.width??null,
  next_turn_expansion_complete:result.next_turn?.expansion_complete??result.next_turn_exact??false});
}while(!result.complete&&!result.sampling_complete&&!result.input_blocked&&performance.now()-start<seconds*1000);
const cpu=process.cpuUsage(cpuStart);
// A pass finishing after one second cannot retrospectively supply an earlier estimate.
const byOneSecond=readings.filter(r=>r.elapsed_ms<=1000&&Number.isFinite(r.score)).at(-1)||null;
const firstSecondError=byOneSecond&&expected!==undefined?Math.abs(byOneSecond.score-expected):null;
const elapsedTotal=performance.now()-start,finished=!!(result.complete||result.sampling_complete||result.input_blocked);
const checkpoints=Object.fromEntries([1000,3000,10000].map(ms=>{
 const measured=seconds*1000>=ms||elapsedTotal>=ms||finished;
 const reading=measured?readings.filter(r=>r.elapsed_ms<=ms&&Number.isFinite(r.score)).at(-1):null;
 return [ms,{measured,score:reading?.score??null,available_at_ms:reading?.elapsed_ms??null}];
}));
const row={reference,case:id,mode,opponent_model:opponentModel,fixture_hash:createHash('sha256').update(JSON.stringify(fixture.snapshot)).digest('hex'),provenance:fixture.provenance??null,checkpoints,
 input_blocked:!!result.input_blocked,unresolved_reasons:result.unresolved_reasons||[],
 first_estimate_ms:first,elapsed_ms:elapsedTotal,cpu_ms:(cpu.user+cpu.system)/1000,
 max_slice_ms:maxSlice,peak_rss_mb:peakRSS/1048576,score:result.score,absolute_error_pp:expected===undefined||result.score===null?null:Math.abs(result.score-expected),
 samples:result.samples,done:!!(result.complete||result.sampling_complete),retained_states:result.retained_states,
 total_native_rollouts:result.total_native_rollouts??result.samples,
 exact_next_turn:result.next_turn_exact||false,next_turn_expansions:result.next_turn_expansions||0,merged_states:result.merged_next_turn_states||0,
 first_second:{score:byOneSecond?.score??null,available_at_ms:byOneSecond?.elapsed_ms??null,
  absolute_error_pp:firstSecondError,reference:expected??null,reference_kind:reference.status,
  goal_met:expected===undefined?null:!!byOneSecond&&firstSecondError<=10},
 prediction:predictionReport(result),readings};
if(fixture.reroot){
 const {observed}=observeSimpleTurn(fixture.snapshot);
 const rerootStart=performance.now();let next=simulateCompleteMoves(observed,{...options,session,timeMs:0,warmOnly:true}),warm=next;
 let reusePasses=0;
 while(!next.provisional_usable&&performance.now()-rerootStart<seconds*1000){next=simulateCompleteMoves(observed,{...options,session});reusePasses++;}
 row.reroot={first_estimate_ms:next.provisional_usable?performance.now()-rerootStart:null,
  immediate_estimate:!!warm.provisional_usable,reused:!!warm.reused_next_turn_estimate,
  retained_samples:Math.max(0,(warm.samples||0)-(warm.nodes||0)),continuation_samples:warm.continuation_samples||0,
  new_samples:(next.samples||0)-Math.max(0,(warm.samples||0)-(warm.nodes||0)),passes:reusePasses,score:next.score};
}
console.log(JSON.stringify(row));
