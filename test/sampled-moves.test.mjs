import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateCompleteMoves,completeMoveAdapter,createCompleteBattle} from '../analysis/complete-moves.mjs';
import {displayEstimate} from '../run-bun/display-estimate.mjs';
import {refineUntilResolved} from '../run-bun/refinement.mjs';
import {stratumMean,allocation,exactEnding} from '../analysis/sampled-moves.mjs';
const mon=(moves,hp=100,spe=50)=>({species:'Mew',current_hp:hp,actual_stats:{hp:100,atk:30,def:30,spa:30,spd:30,spe},build:{level:20,nature:'Serious',ability:'',item:'',boosts:{},moves},effects:{},pp:Object.fromEntries(moves.map(m=>[m,10]))});
function finish(s,options){const session=options.session||{};let r;
 for(let pass=0;pass<20;pass++){r=simulateCompleteMoves(s,{...options,session});if(r.sampling_complete)return r;}
 assert.fail('Retained root and its next-turn estimates did not finish');
}
test('Oversampled rare outcomes retain their actual probability',()=>{
 assert.equal(stratumMean({strata:[{probability:1/16,n:10,sum:10},{probability:15/16,n:10,sum:0}]}),1/16);
 assert.equal(stratumMean({n:12,warm:{n:2,sum:1},strata:[{probability:0.1,n:5,sum:5},{probability:0.9,n:5,sum:0}]}),1/6);
});
test('Legacy continuation samples cannot count as optimized root observations',()=>{
 const s={player:mon(['Tackle','Foresight']),opponent:mon(['Splash'],1,10),field:{}},session={};
 const options={session,approximateCompleteMoves:true,retainedTurn:false,samplesPerPair:8,timeMs:0,warmOnly:true};
 simulateCompleteMoves(s,options);
 const initial=createCompleteBattle(s),cache=session.sampledMoves.cache;
 cache.roots.clear();cache.warm=new Map([[initial.key+'|1,1|12',{n:2,sum:1,terminal:1}]]);
 const reused=simulateCompleteMoves(s,options);
 assert.equal(reused.root_reused,false);assert.equal(session.sampledMoves.cells[0][0].n,0);assert.equal(reused.provisional_usable,false);
 const different=simulateCompleteMoves(s,{...options,rolloutTurns:10});
 assert.equal(different.root_reused,false);assert.equal(session.sampledMoves.cells[0][0].warm,undefined);
});
test('Adaptive allocation retires clearly inferior rows after exploration',()=>{
 const cell=value=>({n:64,sum:64*value});
 const result=allocation([[cell(1),cell(1)],[cell(0),cell(0)]],128);
 assert.equal(result.selected.r,0);assert.equal(result.remaining,2);
});
test('Cheap ending enumeration completes only when every outcome terminates',()=>{
 const root=createCompleteBattle({player:mon(['Seismic Toss']),opponent:mon(['Splash'],1,10),field:{}});
 assert.equal(exactEnding(root,1,1,{}),1);
 const ongoing=createCompleteBattle({player:mon(['Splash']),opponent:mon(['Splash']),field:{}});
 assert.equal(exactEnding(ongoing,1,1,{}),null);
 assert.equal(exactEnding(root,1,1,{shouldStop:()=>true}),null);
});
test('A previous root resumes after observing a different root',()=>{
 const session={},options={session,approximateCompleteMoves:true,samplesPerPair:4,timeMs:1000};
 const s={player:mon(['Tackle','Foresight']),opponent:mon(['Splash'],1,10),field:{}};
 const first=simulateCompleteMoves(s,options);
 simulateCompleteMoves({...s,opponent:mon(['Splash'],2,10)},options);
 const again=simulateCompleteMoves(s,options);
 // An early tactical estimate can precede completion of the sample budget.
 // Revisiting it must preserve prior work and count only genuinely new work.
 assert.equal(again.samples,first.samples+again.nodes);assert.equal(again.root_reused,true);
});
test('Complex sampled calculation publishes real observations without certifying them',()=>{
 const s={player:mon(['Tackle','Foresight']),opponent:mon(['Splash'],1,10),field:{}};
 const r=finish(s,{approximateCompleteMoves:true,samplesPerPair:4,timeMs:1000});
 assert.equal(r.sampling_complete,true);assert.equal(r.samples,8);assert.equal(r.score,99);
 assert.equal(r.certified,false);assert.equal(r.complete,false);assert.equal(r.lower_bound,0);assert.equal(r.upper_bound,100);
 assert.equal(displayEstimate({outlook:r,victory:r.score}).score,99);
});
test('Sampled observations resume across slices with bounded retained data',()=>{
 const s={player:mon(['Tackle','Foresight']),opponent:mon(['Splash'],1,10),field:{}},session={};
 const first=simulateCompleteMoves(s,{session,approximateCompleteMoves:true,samplesPerPair:8,timeMs:0});
 assert.ok(first.samples<=1);assert.equal(first.provisional_usable,false);
 const after=finish(s,{session,approximateCompleteMoves:true,samplesPerPair:8,timeMs:1000});
 assert.equal(after.samples,16);assert.equal(after.sampling_complete,true);assert.equal(session.sampledMoves.cells.length,2);
});
test('Missing live input cannot become a sampled percentage',()=>{
 const s={player:mon(['Fake Out']),opponent:mon(['Splash'],1,10),field:{}};s.player.effects.live_data=true;
 const r=simulateCompleteMoves(s,{approximateCompleteMoves:true,samplesPerPair:2,timeMs:1000});
 assert.equal(r.score,null);assert.equal(r.provisional_usable,false);assert.ok(r.unresolved_reasons.some(s=>s.includes('First-turn')));
});
test('A finished sampling run stops refinement without calling it certified',async()=>{
 let n=0;await refineUntilResolved({obsolete:()=>false,pauseMs:0,
 run:()=>{n++;return {outlook:{complete:false,sampling_complete:true}};},publish:()=>{}});
 assert.equal(n,1);
});
test('Secondary effects branch success or failure instead of 100 integer rolls',()=>{
 const a=mon(['Bite']),b=mon(['Splash'],100,10),adapter=completeMoveAdapter(),root=createCompleteBattle({player:a,opponent:b,field:{}});
 const pending=[adapter.transitions(root,1,1)[0].state];let max=0,n=0;
 while(pending.length){const s=pending.pop(),branches=adapter.transitions(s,0,0);max=Math.max(max,branches.length);
  assert.ok(Math.abs(branches.reduce((n,b)=>n+b.probability,0)-1)<1e-12);
  for(const b of branches)if(b.state?.kind==='chance')pending.push(b.state);assert.ok(++n<1000);
 }
 assert.ok(max<=16); // Exact damage rolls remain; 100-way secondaries do not.
});

