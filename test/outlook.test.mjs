import test from 'node:test';
import assert from 'node:assert/strict';
import {searchBattle,matrixBounds} from '../analysis/search.mjs';
import {simulateOutlook} from '../analysis/outlook.mjs';
function matchup({enemyHp=20,sleep=4,enemyStatus='slp',damage=2,enemyDamage=20,hit=1,pp}={}) {
 const side=(hp,status,effects={})=>({current_hp:hp,build:{status},effects,pp});
 const mon=(hp,status='')=>({curHP:()=>hp,maxHP:()=>20,status,ability:'',types:['Normal']});
 const row=(damage,speed)=>({name:'Tackle',available:true,damage_rolls:[damage],hit_chance:hit,priority:0,speed});
 return [{player:side(10,''),opponent:side(enemyHp,enemyStatus,{sleep_counter:sleep}),field:{}},[row(damage,5)],[row(enemyDamage,7)],mon(10),mon(enemyHp,enemyStatus)];
}
test('Sleep expires inside search: three free hits cannot defeat a waking one-shot',()=>{
 const before=simulateOutlook(...matchup()),after=simulateOutlook(...matchup({enemyHp:14,enemyStatus:'',sleep:0}));
 assert.equal(before.score,0);assert.equal(after.score,0);assert.equal(before.upper_bound,0);
});
test('A provably winning three-hit trajectory stays winning through wake-up',()=>{
 const values=[{enemyHp:14,sleep:4},{enemyHp:11,sleep:3},{enemyHp:8,sleep:2},{enemyHp:5,sleep:1},{enemyHp:5,sleep:0,enemyStatus:''}];
 assert.deepEqual(values.map(s=>simulateOutlook(...matchup({...s,damage:3,enemyDamage:4})).score),[100,100,100,100,100]);
});
test('Cutoffs preserve unknown mass instead of scoring remaining HP',()=>{
 const r=simulateOutlook(...matchup({damage:6,enemyDamage:2}),{maxDepth:3});
 assert.equal(r.score,null);assert.equal(r.lower_bound,0);assert.equal(r.upper_bound,100);
});
test('One-turn chance enumeration has analytic bounds, with no sampling',()=>{
 const r=simulateOutlook(...matchup({enemyStatus:'',sleep:0,damage:20,enemyDamage:1,hit:0.5}),{maxDepth:1});
 assert.equal(r.lower_bound,50);assert.equal(r.upper_bound,100);assert.equal(r.unresolved,0.5);
});
test('Unknown sleep counters and exhausted PP cannot become permanent advantages',()=>{
 const args=matchup();args[0].opponent.effects={};
 assert.equal(simulateOutlook(...args).score,null);
 const r=simulateOutlook(...matchup({enemyStatus:'',sleep:0,damage:1,enemyDamage:1,pp:{Tackle:1}}));
 assert.equal(r.score,null);assert.equal(r.upper_bound,100);
});
test('Simultaneous matching-pennies actions require a mixed strategy, not clairvoyance',()=>{
 const m=[[1,0],[0,1]],v=matrixBounds(m,m,2048);
 assert.ok(v.lower<=0.5&&v.upper>=0.5);assert.ok(v.upper-v.lower<0.002);
});
test('Equivalent stochastic futures merge and transpositions are reused',()=>{
 const adapter={key:JSON.stringify,terminal:s=>s.n===0?s.win:null,actions:()=>[[0,1],[0]],transitions:s=>[
  {state:{n:s.n-1,win:1},probability:0.25},{state:{n:s.n-1,win:1},probability:0.25},{state:{n:s.n-1,win:0},probability:0.5}]};
 const r=searchBattle(adapter,{n:4},{maxDepth:5,timeMs:10000,tolerance:0});
 assert.equal(r.lower,0.5);assert.equal(r.upper,0.5);assert.ok(r.merged_branches>0);assert.ok(r.cache_hits>0);
});
test('A setup action is chosen for its eventual win rather than immediate damage',()=>{
 const adapter={key:JSON.stringify,terminal:s=>s.end??null,actions:()=>[['attack','setup'],['attack']],transitions:(s,a)=>[
  {probability:1,state:a==='setup'?s.ready?{end:0}:{ready:true}:s.ready?{end:1}:{end:0}}]};
 const r=searchBattle(adapter,{}, {maxDepth:4,timeMs:10000});assert.equal(r.lower,1);
});
test('Bound pruning preserves an exhaustive small stochastic game value',()=>{
 const terminal=s=>s.turn===3?s.hp>0?1:0:null;
 const transitions=(s,a,b)=>[{state:{turn:s.turn+1,hp:s.hp+a-b},probability:0.7},{state:{turn:s.turn+1,hp:s.hp+a-b-1},probability:0.3}];
 const oracle=s=>terminal(s)??Math.max(...[0,1].map(a=>Math.min(...[0,1].map(b=>transitions(s,a,b).reduce((v,x)=>v+x.probability*oracle(x.state),0)))));
 const initial={turn:0,hp:2},expected=oracle(initial);
 const r=searchBattle({key:JSON.stringify,terminal,actions:()=>[[0,1],[0,1]],transitions},initial,{maxDepth:3,timeMs:10000,tolerance:0});
 assert.ok(Math.abs(r.lower-expected)<1e-10);assert.ok(Math.abs(r.upper-expected)<1e-10);
});
test('Work limits return an interval containing the exhaustive answer',()=>{
 const adapter={key:JSON.stringify,terminal:s=>s===10?1:null,actions:()=>[[0],[0]],transitions:s=>[{state:s+1,probability:1}]};
 const r=searchBattle(adapter,0,{maxNodes:2,maxDepth:20});assert.equal(r.lower,0);assert.equal(r.upper,1);assert.equal(r.budget_exhausted,true);
 const done=searchBattle(adapter,0,{maxDepth:20,timeMs:10000});assert.equal(done.lower,1);
});
test('Priority winning attack beats a higher-damage move that acts too late',()=>{
 const args=matchup({enemyStatus:'',sleep:0,enemyHp:5,damage:100});
 args[1].push({...args[1][0],name:'Quick Attack',damage_rolls:[5],priority:1});
 const r=simulateOutlook(...args);assert.equal(r.lower_bound,100);
});

test('Real transition adapter can choose Swords Dance to turn a loss into a win',()=>{
 const args=matchup({enemyStatus:'',sleep:0,enemyHp:20,damage:4,enemyDamage:2});
 assert.equal(simulateOutlook(...args).score,0);
 args[1].push({name:'Swords Dance',available:true,status_move:true,hit_chance:1,speed:5,priority:0,damage_rolls:[0]});
 const r=simulateOutlook(...args,{timeMs:10000,describe:(state,i,j)=>{
  const row=args[i+1][j];return {...row,damage_rolls:i===0&&j===0?[4*(2+(state[0].boosts.atk||0))/2]:row.damage_rolls};
 }});
 assert.equal(r.lower_bound,100);
});
test('Low-probability trimming retains mass in certified bounds',()=>{
 const adapter={key:JSON.stringify,terminal:s=>s===2?1:null,actions:()=>[[0],[0]],transitions:s=>s===0?
  [{state:2,probability:0.999},{state:1,probability:0.001}]:[{state:2,probability:1}]};
 const r=searchBattle(adapter,0,{maxDepth:5,minPathProbability:0.01});
 assert.equal(r.lower,0.999);assert.equal(r.upper,1);assert.ok(r.pruned_chance_branches>0);
});

test('A larger search pass resumes cached certificates instead of freezing a cutoff',()=>{
 const session={},adapter={key:JSON.stringify,terminal:s=>s===8?1:null,actions:()=>[[0],[0]],transitions:s=>[{state:s+1,probability:1}]};
 const short=searchBattle(adapter,0,{maxNodes:2,maxDepth:10,session});
 assert.equal(short.lower,0);assert.equal(short.upper,1);
 const deeper=searchBattle(adapter,0,{maxNodes:20,maxDepth:10,session});
 assert.equal(deeper.lower,1);assert.equal(deeper.upper,1);
 const cached=searchBattle(adapter,0,{maxNodes:1,maxDepth:10,session});assert.equal(cached.lower,1);assert.ok(cached.cache_hits>0);
});
test('Symmetry cannot hide a finite-PP unknown continuation',()=>{
 const args=matchup({enemyStatus:'',sleep:0,enemyHp:10,damage:1,enemyDamage:1,pp:{Tackle:1}});
 args[0].opponent.effects={};args[2][0].speed=5;
 const r=simulateOutlook(...args);assert.equal(r.score,null);assert.equal(r.upper_bound,100);
});

test('Cancellation stops expansion and preserves valid unresolved bounds',()=>{
 let calls=0;
 const adapter={key:JSON.stringify,terminal:s=>s===10?1:null,actions:()=>[[0],[0]],transitions:s=>{calls++;return [{state:s+1,probability:1}];}};
 const result=searchBattle(adapter,0,{maxDepth:20,shouldStop:()=>calls>=2});
 assert.equal(calls,2);assert.equal(result.budget_exhausted,true);
 assert.equal(result.lower,0);assert.equal(result.upper,1);
});
