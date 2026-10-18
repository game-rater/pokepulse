import {simulateCompleteMoves,createCompleteBattle} from '../analysis/complete-moves.mjs';
import {searchFixtures,observeSimpleTurn} from './search-benchmark-fixtures.mjs';
const id=process.argv[2],mode=process.argv[3],seconds=Number(process.argv[4]||3);
const fixture=searchFixtures.find(f=>f.id===id);
if(!fixture||!['baseline','hybrid'].includes(mode)||!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid benchmark arguments');
const options={approximateCompleteMoves:true,retainedTurn:mode==='hybrid',samplesPerPair:128,timeMs:100};
// Warm module/engine initialization equally; measurements exclude startup.
createCompleteBattle(fixture.snapshot);global.gc?.();
const session={},start=performance.now(),cpuStart=process.cpuUsage();
let first=null,result,passes=0,maxSlice=0,peakRSS=process.memoryUsage().rss;
const readings=[];
do{
 const passStart=performance.now();result=simulateCompleteMoves(fixture.snapshot,{...options,session});
 const elapsed=performance.now()-start;passes++;maxSlice=Math.max(maxSlice,performance.now()-passStart);
 peakRSS=Math.max(peakRSS,process.memoryUsage().rss);
 if(first===null&&result.provisional_usable)first=elapsed;
 readings.push({elapsed_ms:elapsed,score:result.score,samples:result.samples,next_turn_exact:result.next_turn_exact||false});
}while(!result.sampling_complete&&performance.now()-start<seconds*1000);
const cpu=process.cpuUsage(cpuStart);
const row={case:id,mode,first_estimate_ms:first,elapsed_ms:performance.now()-start,cpu_ms:(cpu.user+cpu.system)/1000,
 max_slice_ms:maxSlice,peak_rss_mb:peakRSS/1048576,score:result.score,absolute_error_pp:fixture.expected===undefined||result.score===null?null:Math.abs(result.score-fixture.expected),
 samples:result.samples,done:result.sampling_complete,retained_states:result.retained_states,
 total_native_rollouts:result.total_native_rollouts??result.samples,
 exact_next_turn:result.next_turn_exact||false,next_turn_expansions:result.next_turn_expansions||0,merged_states:result.merged_next_turn_states||0,readings};
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
