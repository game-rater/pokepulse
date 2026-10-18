import test from 'node:test';
import assert from 'node:assert/strict';
import {stallFixtures} from '../scripts/stall-benchmark-fixtures.mjs';
import {stallOracle} from '../scripts/stall-benchmark-oracles.mjs';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle,completeMoveAdapter,installChanceTape} from '../analysis/native-battle.mjs';
import {startPassiveEndgame,advancePassiveEndgame} from '../analysis/passive-endgame.mjs';
import {evaluatePosition} from '../analysis/position-evaluator.mjs';
const fixture=id=>structuredClone(stallFixtures.find(f=>f.id==='stall-'+id).snapshot);
function solve(snapshot,options={}){
 const state=createCompleteBattle(snapshot),job=startPassiveEndgame(state);if(!job)return {state,job,result:null};
 let result;for(let i=0;i<100&&!result&&!job.done&&!job.rejected;i++)result=advancePassiveEndgame(job,{timeMs:1000,passiveEndgameMs:1000,...options});
 return {state,job,result};
}
for(const id of ['poison-clock','poison-leftovers','recover-protect','recover-protect-mid','recover-protect-late','protect-risk','protect-used','protect-three','heal-instead'])test(`${id}: backward resource solver agrees with unchanged independent reference`,()=>{
 const f=stallFixtures.find(f=>f.id==='stall-'+id),{result}=solve(f.snapshot);
 assert.ok(result);assert.ok(Math.abs(100*result.value-stallOracle(f).expected_percent)<1e-10);assert.ok(result.states<100);
});
test('PP exhaustion remains unresolved rather than treating Struggle as a forced loss',()=>{
 const {job,result}=solve(fixture('pp-exhaustion'));assert.equal(result,null);assert.equal(job.done,true);assert.deepEqual(job.bounds,[0,1]);
});
for(const id of ['lum-cure','poison-heal','recovery-delay'])test(`${id}: unsupported interactions decline the proof`,()=>{
 assert.equal(startPassiveEndgame(createCompleteBattle(fixture(id))),null);
});
function nativeValue(snapshot){
 const adapter=completeMoveAdapter();let count=0;
 const visit=(state,depth=0)=>{
  assert.ok(++count<20000,'bounded native reference must remain small');const v=adapter.terminal(state);if(v!==null)return v;
  const actions=adapter.actions(state);if(state.kind!=='chance')assert.ok(depth<3,'reference requires a complete terminal tree');
  return Math.max(...actions[0].map(a=>Math.min(...actions[1].map(b=>adapter.transitions(state,a,b).reduce((sum,e)=>{
   assert.ok(e.state);return sum+e.probability*visit(e.state,depth+adapter.depthCost(state));
  },0)))));
 };
 return visit(createCompleteBattle(snapshot));
}
const heldOut=[
 {name:'different species, healing move and fixed attack',snapshot:{player:mon('Clefable',['Soft-Boiled','Detect'],{level:80,hp:1}),opponent:mon('Blissey',['Dragon Rage'],{level:50,hp:60,status:'tox',effects:{toxic_counter:0}}),field:{}}},
 ...[1,41].map(hp=>({name:`slower recovery at ${hp} HP`,snapshot:{player:mon('Slowbro',['Slack Off','Protect'],{level:30,hp}),opponent:mon('Mew',['Dragon Rage'],{level:80,hp:150,status:'tox',effects:{toxic_counter:3}}),field:{}}})),
 {name:'alternate fixed move and recovery loses before acting',snapshot:{player:mon('Mew',['Milk Drink'],{level:20,hp:1}),opponent:mon('Blissey',['Night Shade'],{level:100,hp:50,status:'tox',effects:{toxic_counter:0}}),field:{}}},
];
for(const f of heldOut)test(`${f.name}: agrees with exhaustive native chance and action tree`,()=>{
 const expected=nativeValue(f.snapshot),{result}=solve(f.snapshot);assert.ok(result);assert.ok(Math.abs(result.value-expected)<1e-12,`${result.value} vs ${expected}`);
});
function nativeWitness(snapshot,quantile){
 const {state,job,result}=solve(snapshot);assert.equal(result.value,1);const b=restoreCompleteBattle(state);
 installChanceTape(b,[],state.unknownNature,state,()=>quantile);
 for(let turn=0;!b.ended&&turn<32;turn++){
  const p=b.p1.active[0],counter=p.volatiles.stall?.counter||1,pp=job.actions.map(a=>p.moveSlots[a.slot-1].pp);
  const action=job.policy.get(turn+'|'+p.hp+'|'+counter+'|'+pp.join(','));assert.ok(action,'proved policy must supply the next legal action');
  assert.equal(b.choose('p1',`move ${action}`),true);assert.equal(b.choose('p2','move 1'),true);
 }
 assert.equal(b.winner,'Player');
}
test('Long recovery strategies replay in native mechanics with alternative moves and species',()=>{
 const variants=[fixture('recover-protect')];
 const alternative=fixture('recover-protect');alternative.player.build.moves=['Soft-Boiled','Detect'];alternative.player.pp={'Soft-Boiled':10,Detect:5};variants.push(alternative);
 const other=fixture('recover-protect');other.player=mon('Lugia',['Recover','Protect'],{hp:1,item:'Leftovers'});variants.push(other);
 for(const s of variants)for(const q of [0,0.999999])nativeWitness(s,q);
});
test('Extra unmodeled player options permit a sure-win proof, never an unjustified fractional optimum',()=>{
 const sure=fixture('recover-protect');sure.player.build.moves.push('Tackle','Toxic');Object.assign(sure.player.pp,{Tackle:35,Toxic:10});assert.equal(solve(sure).result.value,1);
 const risky=fixture('protect-risk');risky.player.build.moves.push('Tackle');risky.player.pp.Tackle=35;assert.equal(solve(risky).result,null);
});
test('Native clocks, action probes and backward frames resume across bounded work slices',()=>{
 const s=fixture('recover-protect'),state=createCompleteBattle(s),before=JSON.stringify(state),job=startPassiveEndgame(state);let result,passes=0;
 while(!result&&passes++<1000){let checks=0;result=advancePassiveEndgame(job,{timeMs:1000,passiveEndgameMs:1000,shouldStop:()=>++checks>4});}
 assert.ok(result);assert.equal(result.value,1);assert.ok(passes>5);assert.equal(JSON.stringify(state),before);
});
test('State limits and deadlines do not create certificates, and more work can resume',()=>{
 const job=startPassiveEndgame(createCompleteBattle(fixture('recover-protect')));
 assert.equal(advancePassiveEndgame(job,{deadline:0}),null);assert.equal(job.clock.length,0);
 assert.equal(advancePassiveEndgame(job,{timeMs:1000,passiveEndgameMs:1000,passiveEndgameStates:2}),null);assert.equal(job.states,2);
 assert.equal(advancePassiveEndgame(job,{timeMs:1000,passiveEndgameMs:1000,passiveEndgameStates:100}).value,1);
});
test('Shared evaluator owns resumable work, caches proofs and honors warm-only/model isolation',()=>{
 const snapshot=fixture('recover-protect'),state=createCompleteBattle(snapshot),session={};
 assert.equal(evaluatePosition({state,purpose:'continuation'},{session,warmOnly:true}),null);assert.equal(session.positionProofWork.size,0);
 let result;for(let n=0;n<50&&!result;n++)result=evaluatePosition({state,purpose:'continuation'},{session,timeMs:2});
 assert.equal(result.score,100);assert.equal(result.certified,true);assert.equal(result.samples,0);assert.equal(session.positionProofWork.size,0);
 assert.equal(evaluatePosition({state,purpose:'continuation'},{session,warmOnly:true}).root_reused,true);
 assert.equal(evaluatePosition({state,purpose:'continuation'},{session,warmOnly:true,opponentModel:'npc-ai'}),null);
 const changed=structuredClone(snapshot);changed.player.pp={Recover:1,Protect:1};assert.equal(evaluatePosition({state:createCompleteBattle(changed),purpose:'continuation'},{session}),null);
});
test('Scope guards reject interactions that invalidate the compiled resource model',()=>{
 for(const change of [s=>s.player.build.item='Sitrus Berry',s=>s.opponent.build.ability='Pressure',s=>s.player.build.status='par',s=>s.player.effects.native_volatiles={taunt:{duration:2}},
  s=>s.player.actual_stats.spe=s.opponent.actual_stats.spe,s=>{s.field.isTrickRoom=true;s.player.effects.trick_room_turns=3;}]){
  const s=fixture('recover-protect');change(s);assert.equal(startPassiveEndgame(createCompleteBattle(s)),null);
 }
 const short=fixture('recover-protect');short.opponent.pp['Seismic Toss']=1;assert.equal(solve(short).result,null);
});
test('Short HP, PP, speed and item variants agree with complete native enumeration whenever certified',()=>{
 let certified=0;
 for(const [hp,r,k,slow,item] of [
  [1,0,2,false,''],[101,0,2,false,''],[1,1,1,false,''],[1,2,1,false,''],[171,1,1,true,''],[101,1,2,true,''],
  [1,0,2,false,'Leftovers'],[80,1,2,false,'Leftovers'],[200,1,1,true,'Leftovers'],[300,0,1,false,''],[1,0,1,false,''],[100,1,1,true,''],
 ]){
  const s=fixture('heal-instead');s.player.current_hp=hp;s.player.pp={Recover:r,Protect:k};s.player.build.item=item;
  if(slow)s.player.actual_stats.spe=1;
  const expected=nativeValue(s),{result}=solve(s);
  if(result){certified++;assert.ok(Math.abs(result.value-expected)<1e-12,JSON.stringify({hp,r,k,slow,item,expected,actual:result.value}));}
 }
 assert.ok(certified>=8,'cross-check must exercise certificates as well as guarded fallbacks');
});
test('A failed Protect resets the streak and surviving a hit changes the optimal resource probability',()=>{
 const s=fixture('protect-three');s.player.current_hp=150;s.player.effects.protect_streak=1;s.player.pp.Protect=3;
 const {result}=solve(s);assert.ok(Math.abs(result.value-5/9)<1e-12);assert.ok(Math.abs(nativeValue(s)-5/9)<1e-12);
});

test('Malformed native HP/PP and mid-turn requests cannot enter a proof',()=>{
 for(const mutate of [s=>s.saved.sides[0].pokemon[0].hp=NaN,s=>s.saved.sides[1].pokemon[0].moveSlots[0].pp=NaN,s=>s.saved.midTurn=true]){
  const state=createCompleteBattle(fixture('recover-protect'));mutate(state);assert.equal(startPassiveEndgame(state),null);
 }
});
