import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SearchService,modelContext} from '../run-bun/search-service.mjs';
import {pack,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
test('Worker search leaves event loop responsive and suppresses replaced snapshot results',async()=>{
 const service=new SearchService({parallel:false}),species=pack.species.find(s=>s.id==='garchomp');
 const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
 const b={...defaultBuild(species),level:5,ability:'',moves:['Tackle']};
 const args=[species,species,rules,{player_hp:100,opponent_hp:100},{player:b,opponent:b},defaultField(),{player:{},opponent:{}},{}];
 let obsolete=0,ticks=0;const timer=setInterval(()=>ticks++,5);
 try{
  service.start(args,()=>obsolete++,()=>{},[200,500,1000,2000,3000]);
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Worker timed out')),15000);
   service.start(args,r=>{if(r.outlook.approximate&&Number.isFinite(r.display_score)){clearTimeout(timeout);resolve(r);}},e=>{clearTimeout(timeout);reject(e);},[200,500,1000,2000,3000]);
  });
  assert.equal(obsolete,0);assert.ok(ticks>0);
  assert.ok(Math.abs(result.victory-50)<=10,`initial sampled forecast ${result.victory} stays within the ten-point target of symmetric 50% odds`);
  assert.equal(result.outlook.algorithm,'retained-next-turn-native-hybrid');
  assert.equal(result.outlook.certified,false);
  assert.equal(result.outlook.rollout_turn_limit,4);
 }finally{clearInterval(timer);service.cancel();}
});

const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function winningArgs(){
 const species=pack.species.find(s=>s.id==='garchomp');
 const b={...defaultBuild(species),level:5,ability:'',moves:['Tackle']};
 return [species,species,rules,{player_hp:100,opponent_hp:100},{player:b,opponent:structuredClone(b)},defaultField(),{player:{},opponent:{}},
  {player:{actual_stats:{hp:30,atk:25,def:10,spa:10,spd:10,spe:10},current_hp:30,pp:{Tackle:10}},
   opponent:{actual_stats:{hp:16,atk:5,def:10,spa:10,spd:10,spe:5},current_hp:16,pp:{Tackle:10}}}];
}
function run(service,args,budgets=[1000]){
 return new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>reject(Error('Worker timed out')),15000);
  service.start(args,result=>{clearTimeout(timeout);resolve(result);},error=>{clearTimeout(timeout);reject(error);},budgets);
 });
}

test('Full move engine passes exact live HP and PP through the worker to the display',async()=>{
 const service=new SearchService({parallel:false,settleMs:0}),args=winningArgs();
 args[4].player.moves=['Tackle','Foresight'];args[4].opponent.moves=['Splash'];
 args[7].player.pp={Tackle:10,Foresight:10};args[7].opponent.pp={Splash:10};
 args[7].opponent.current_hp=1;args[3].opponent_hp=100/16;
 try{
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Full move worker timed out')),15000);
   service.start(args,r=>{if(r.outlook.sampling_complete){clearTimeout(timeout);resolve(r);}},e=>{clearTimeout(timeout);reject(e);},[250]);
  });
  assert.match(result.outlook.move_engine,/pokemon-showdown/);
  assert.deepEqual(result.outlook.omitted_moves,[]);
  assert.equal(result.victory,99);assert.equal(result.display_score,99);
  assert.equal(result.outlook.certified,false);assert.equal(result.outlook.complete,false);
  assert.ok(result.outlook.retained_states>0);
 }finally{service.cancel();}
});
test('A landed turn reroots to a retained descendant without expanding the tree again',async()=>{
 const service=new SearchService({parallel:false,settleMs:0});
 try{
  const args=winningArgs(),first=await run(service,args),worker=service.worker;
  assert.equal(first.victory,100);assert.ok(first.outlook.retained_states>0);
  const next=structuredClone(args);
  next[7].player.current_hp-=first.incoming_moves[0].min;
  next[7].opponent.current_hp-=first.outgoing_moves[0].min;
  for(const side of ['player','opponent']){
   next[7][side].pp.Tackle--;next[3][`${side}_hp`]=100*next[7][side].current_hp/next[7][side].actual_stats.hp;
  }
  const after=await run(service,next);
  assert.equal(service.worker,worker);assert.equal(after.victory,100);
  assert.equal(after.outlook.root_reused,true);assert.equal(after.outlook.nodes,0);
  assert.equal(after.outlook.pass_time_budget_ms,0);assert.equal(after.display_score,100);
  next[5].weather='Rain';
  const changed=await run(service,next);
  assert.equal(changed.outlook.root_reused,false,'changed mechanics must discard the old tree');
 }finally{service.cancel();}
});
test('Move animation snapshot bursts dispatch only the latest state',async()=>{
 const service=new SearchService({parallel:false,settleMs:50});let obsolete=0;
 try{
  const args=winningArgs();
  service.start(args,()=>obsolete++);
  const intermediate=structuredClone(args);intermediate[7].player.pp.Tackle--;
  service.start(intermediate,()=>obsolete++);
  const final=structuredClone(args);final[7].opponent.current_hp=0;final[3].opponent_hp=0;
  const result=await run(service,final);
  assert.equal(obsolete,0);assert.equal(result.victory,100);
  service.cancel();assert.equal(service.context,null);assert.equal(service.display,null);
 }finally{service.cancel();}
});
test('Cross-snapshot cache context preserves dynamic states and rejects changed mechanics',()=>{
 const species=pack.species.find(s=>s.id==='garchomp'),b={...defaultBuild(species),moves:['Tackle']};
 const args=[species,species,{}, {},{player:b,opponent:b},defaultField(),{player:{},opponent:{}},{}];
 const original=modelContext(args),next=structuredClone(args);
 next[3]={player_hp:30,opponent_hp:80};next[4].player.status='slp';next[4].player.boosts.atk=2;
 next[6].player.sleep_counter=3;next[7]={player:{current_hp:30,pp:{Tackle:5}}};
 assert.equal(modelContext(next),original);
 next[5].weather='Rain';assert.notEqual(modelContext(next),original);next[5].weather='';
 next[6].player.taunted=true;assert.notEqual(modelContext(next),original);
});

test('Short-search fallback identifies missing sleep timing and stops without inventing a forecast',async()=>{
 const service=new SearchService({parallel:false,settleMs:0}),args=winningArgs();
 args[4].player.status='slp'; // Unknown wake-up timing remains unresolved; exhausted PP now uses Struggle.
 const passes=[];
 try{
  await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Continuous worker timed out')),15000);
   service.start(args,result=>{
    passes.push(result.outlook.refinement_pass);
    if(result.outlook.input_blocked){
     assert.equal(result.refining,false);
     assert.ok(result.outlook.unresolved_reasons.some(reason=>reason.includes('wake-up counter')));
     assert.equal(result.display_score,null);
     service.cancel();clearTimeout(timeout);resolve();
    }else assert.equal(result.refining,true);
   },error=>{clearTimeout(timeout);reject(error);},[10]);
  });
  assert.deepEqual(passes,[1,2,3,4,5]);assert.equal(service.worker,null);
 }finally{service.cancel();}
});


test('Default search dispatches immediately without an animation timeout',()=>{
 const service=new SearchService({parallel:false}),sent=[];service.worker={postMessage:m=>sent.push(m),terminate:()=>{}};
 try {service.start(winningArgs(),()=>{});assert.equal(sent.length,1);assert.equal(service.timer,null);}finally{service.cancel();}
});

test('A broad unresolved exact matchup falls back to retained native estimates',async()=>{
 const service=new SearchService({parallel:false}),args=winningArgs();
 args[4].player.moves=['Leer','Tackle','Baby-Doll Eyes','Bite'];
 args[4].opponent.moves=['Tackle','Play Rough','Double Kick'];
 for(const side of ['player','opponent']){
  args[4][side].level=20;args[6][side]={first_turn:false,move_history_known:true};
  args[7][side]={current_hp:100,actual_stats:{hp:100,atk:30,def:30,spa:30,spd:30,spe:side==='player'?30:40},
   pp:Object.fromEntries(args[4][side].moves.map(move=>[move,20]))};
 }
 try{
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Native fallback timed out')),15000);
   service.start(args,r=>{if(r.outlook.approximate&&r.outlook.provisional_usable){clearTimeout(timeout);resolve(r);}},
    e=>{clearTimeout(timeout);reject(e);},[10]);
  });
  assert.equal(result.outlook.algorithm,'retained-next-turn-native-hybrid');
  assert.ok(result.outlook.refinement_pass>=5);assert.ok(result.outlook.samples>0);
  assert.equal(result.outlook.certified,false);assert.ok(Number.isFinite(result.display_score));
 }finally{service.cancel();}
});

test('Preloading warms the worker without publishing or retaining a live prediction and reuses it',async()=>{
 const service=new SearchService({parallel:false});let published=0;
 service.onResult=()=>published++;
 try{
  await service.preload();const worker=service.worker;assert.ok(worker);assert.equal(published,0);
  await service.preload();assert.equal(service.worker,worker);
  service.cancel({keepWorkers:true});assert.equal(service.worker,worker);
  const result=await run(service,winningArgs());assert.ok(Number.isFinite(result.display_score));assert.equal(service.worker,worker);
  assert.equal(result.outlook.root_reused,false,'warmup work must not seed the first live forecast');
 }finally{service.cancel();}
 assert.equal(service.worker,null);
});
