import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SearchService,chooseSearchResult} from '../run-bun/search-service.mjs';
import {pack,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
const sample=score=>({victory:score,outlook:{score,provisional_score:score,provisional_usable:true,approximate:true,
 lower_bound:0,upper_bound:100,unresolved:1,complete:false,input_blocked:false}});
const exact=(lower,upper,complete=false)=>({victory:lower,outlook:{provisional_score:(lower+upper)/2,
 lower_bound:lower,upper_bound:upper,unresolved:(upper-lower)/100,complete,input_blocked:false}});
test('Race prefers usable approximation until an exact certificate finishes',()=>{
 const h=sample(60),e=exact(0,99);
 assert.equal(chooseSearchResult({exact:e,hybrid:h}).engine,'hybrid');
 assert.equal(chooseSearchResult({exact:exact(59.8,60.2,true),hybrid:h}).engine,'exact');
 assert.equal(chooseSearchResult({exact:e}).engine,'exact');
 assert.equal(chooseSearchResult({exact:e,hybrid:{...h,outlook:{...h.outlook,input_blocked:true}}}).engine,'exact');
});
test('Late approximate and stale-version results cannot replace a completed exact result',()=>{
 const service=new SearchService(),emitted=[];service.version=4;service.onResult=r=>emitted.push(r);
 service.receive('hybrid',{version:4,result:sample(60)});
 service.receive('exact',{version:4,result:exact(70,70,true)});
 service.receive('hybrid',{version:4,result:sample(20)});
 service.receive('exact',{version:3,result:exact(0,0,true)});
 assert.equal(emitted.at(-1).display_score,70);assert.equal(emitted.at(-1).outlook.search_race.selected,'exact');
 assert.equal(Atomics.load(service.hybridHalt,0),4);service.cancel();
});
test('An exhausted exact probe leaves approximation available and does not certify it',()=>{
 const service=new SearchService(),emitted=[];service.version=1;service.onResult=r=>emitted.push(r);
 service.receive('hybrid',{version:1,result:sample(55)});
 const e=exact(0,99);e.outlook.search_paused=true;
 service.receive('exact',{version:1,result:e});
 const r=emitted.at(-1);assert.equal(r.display_score,55);assert.equal(r.outlook.search_race.exact,'paused');
 assert.equal(r.outlook.complete,false);assert.equal(r.refining,true);service.cancel();
});
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function args(){
 const species=pack.species.find(s=>s.id==='mew');
 const build=moves=>({...defaultBuild(species),level:20,ability:'',item:'',moves});
 const stats={hp:100,atk:30,def:30,spa:30,spd:30,spe:50};
 return [species,species,rules,{player_hp:100,opponent_hp:1},{player:build(['Tackle','Foresight']),opponent:build(['Splash'])},defaultField(),
  {player:{first_turn:false,move_history_known:true},opponent:{first_turn:false,move_history_known:true}},
  {player:{actual_stats:stats,current_hp:100,pp:{Tackle:20,Foresight:20}},opponent:{actual_stats:{...stats,spe:10},current_hp:1,pp:{Splash:20}}}];
}
test('Two real workers race and a completed exact result stops the competing calculation',async()=>{
 const service=new SearchService(),values=[];
 try{
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Parallel search timed out')),15000);
   service.start(args(),r=>{values.push(r);if(r.outlook.complete){clearTimeout(timeout);resolve(r);}},
    e=>{clearTimeout(timeout);reject(e);},[150,250]);
   assert.ok(service.worker);assert.ok(service.hybridWorker);assert.notEqual(service.worker,service.hybridWorker);
  });
  assert.equal(result.display_score,100);assert.equal(result.outlook.search_race.selected,'exact');assert.equal(result.refining,false);
  assert.equal(Atomics.load(service.hybridHalt,0),service.version);
 }finally{service.cancel();assert.equal(service.worker,null);assert.equal(service.hybridWorker,null);}
});
test('Real exact probe is bounded while the other worker provides a usable estimate',async()=>{
 const service=new SearchService({exactProbeMs:50}),input=args();input[7].opponent.current_hp=100;input[3].opponent_hp=100;
 try{
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(Error('Bounded race timed out')),15000);
   service.start(input,r=>{if(r.outlook.search_race.exact==='paused'&&r.outlook.provisional_usable){clearTimeout(timeout);resolve(r);}},
    e=>{clearTimeout(timeout);reject(e);},[50]);
  });
  assert.equal(result.outlook.search_race.selected,'hybrid');assert.ok(Number.isFinite(result.display_score));
  assert.equal(result.outlook.complete,false);
 }finally{service.cancel();}
});
