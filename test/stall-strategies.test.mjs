import test from 'node:test';
import assert from 'node:assert/strict';
import {stallFixtures} from '../scripts/stall-benchmark-fixtures.mjs';
import {stallOracle} from '../scripts/stall-benchmark-oracles.mjs';
import {benchmarkReference} from '../scripts/benchmark-oracles.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,completeMoveAdapter,nativeMoveChoices} from '../analysis/native-battle.mjs';
const fixture=id=>stallFixtures.find(f=>f.id==='stall-'+id);
const targets={'poison-clock':100,'poison-leftovers':100,'recovery-delay':100,'recover-protect':100,'recover-protect-mid':100,'recover-protect-late':100,'pp-exhaustion':0,'protect-risk':100/3,'protect-used':100/27,'protect-three':100/27,'heal-instead':100,'lum-cure':0,'poison-heal':0};
for(const [id,target] of Object.entries(targets))test(`${id}: independent, fingerprinted target for both opponent models`,()=>{
 const f=fixture(id);assert.equal(stallOracle(f).expected_percent,target);
 for(const model of ['minimax','npc-ai'])assert.equal(benchmarkReference(f,model).expected_percent,target);
 const changed=structuredClone(f);changed.snapshot.player.current_hp++;
 assert.throws(()=>benchmarkReference(changed),/stale reference/);
});
function replay(f,{reverse=false,quantile=0}={}){
 const state=createCompleteBattle(f.snapshot),b=restoreCompleteBattle(state),trace=[];
 installChanceTape(b,[],state.unknownNature,state,()=>quantile); // extremes include max critical damage / successful Protect
 const proof=stallOracle(f);
 for(let n=0;n<50&&!b.ended;n++){
  let a=1,c=1;
  if(f.id.includes('recover-protect')||f.id==='stall-pp-exhaustion')a=(n+(reverse?1:0))%2===0?1:2;
  if(f.id==='stall-recovery-delay')c=proof.witness_recover_turns.includes(n+1)?2:1;
  for(const [side,slot] of [[b.p1,a],[b.p2,c]]){
   const choices=nativeMoveChoices(side.active[0]),selected=choices.find(m=>m.slot===slot)||choices[0];
   assert.equal(b.choose(side.id,`move ${selected?.slot||1}`),true);
  }
  trace.push({player:b.p1.active[0].hp,opponent:b.p2.active[0].hp,status:b.p2.active[0].status});
 }
 assert.ok(b.ended,'witness must finish within its proof bound');return {b,trace};
}
for(const id of ['poison-clock','poison-leftovers','recovery-delay','recover-protect','recover-protect-mid','recover-protect-late','heal-instead'])test(`${id}: native winning witness agrees with independent timeline`,()=>{
 for(const quantile of [0,0.999999]){
 const f=fixture(id),proof=stallOracle(f),{b,trace}=replay(f,{quantile});
 assert.equal(b.winner,'Player');assert.ok(b.p1.active[0].hp>0);
 assert.equal(trace.length,proof.witness_turns??proof.turns);
 if(proof.opponent_hp_trace)assert.deepEqual(trace.map(t=>t.opponent),proof.opponent_hp_trace);
 }
});
test('Long stall witness is alive at turn 25 and finishes at turn 28',()=>{
 const {trace}=replay(fixture('recovery-delay'));
 assert.ok(trace[24].opponent>0);assert.equal(trace.length,28);
});
test('Initial, mid and late fixtures are consistent snapshots of one native battle',()=>{
 const {trace}=replay(fixture('recover-protect'));
 for(const [id,turn] of [['recover-protect-mid',8],['recover-protect-late',12]]){
  const s=fixture(id).snapshot;assert.equal(trace[turn-1].player,s.player.current_hp);assert.equal(trace[turn-1].opponent,s.opponent.current_hp);
 }
});
test('Both orderings of the scarce PP plan lose on turn three, before the enemy KOs',()=>{
 for(const reverse of [false,true]){const {b,trace}=replay(fixture('pp-exhaustion'),{reverse});assert.equal(b.winner,'Opponent');assert.equal(trace.length,3);assert.ok(b.p2.active[0].hp>0);}
});
for(const id of ['lum-cure','poison-heal'])test(`${id}: even every Protect succeeding cannot make waiting win`,()=>{
 const {b,trace}=replay(fixture(id));assert.equal(b.winner,'Opponent');assert.ok(b.p2.active[0].hp>0);assert.equal(trace.length,fixture(id).snapshot.player.pp.Protect+1);
});
function enumerateForcedBattle(snapshot){
 const adapter=completeMoveAdapter();let nodes=0;
 const visit=(state,turns=0)=>{
  assert.ok(++nodes<5000,'short Protect proof must stay finite');const value=adapter.terminal(state);if(value!==null)return value;
  if(state.kind!=='chance')assert.ok(turns<=3,'no heuristic horizon leaves allowed');
  const actions=adapter.actions(state);assert.equal(actions[0].length,1);assert.equal(actions[1].length,1);
  return adapter.transitions(state,actions[0][0],actions[1][0]).reduce((sum,edge)=>sum+edge.probability*visit(edge.state,turns+adapter.depthCost(state)),0);
 };
 return visit(createCompleteBattle(snapshot))*100;
}
for(const id of ['protect-risk','protect-used','protect-three'])test(`${id}: all native chance branches agree with exact Protect probability`,()=>{
 assert.ok(Math.abs(enumerateForcedBattle(fixture(id).snapshot)-targets[id])<1e-9);
});
test('Reference refuses altered healing resources and unknown effects',()=>{
 const changed=structuredClone(fixture('recover-protect'));changed.snapshot.player.pp.Recover=1;
 assert.throws(()=>stallOracle(changed),/remaining PP/);
 changed.snapshot.player.pp.Recover=10;changed.snapshot.player.effects.native_volatiles={substitute:{hp:10}};
 assert.throws(()=>stallOracle(changed),/known effect scope/);
});
