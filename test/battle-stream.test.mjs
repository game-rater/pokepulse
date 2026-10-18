import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setTimeout as pause} from 'node:timers/promises';
import {SearchService} from '../run-bun/search-service.mjs';
import {pack,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';

const species=pack.species.find(p=>p.id==='mew');
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function args(hp,foeHP,mode){
 const p={...defaultBuild(species),level:20,moves:['Night Shade'],ability:'',item:''};
 const q={...p,level:30};
 const liveSide=(current_hp,spe)=>({current_hp,actual_stats:{hp:100,atk:30,def:30,spa:30,spd:30,spe},pp:{'Night Shade':20}});
 return [species,species,rules,{player_hp:hp,opponent_hp:foeHP},{player:p,opponent:q},defaultField(),
  {player:{first_turn:false,move_history_known:true},opponent:{first_turn:false,move_history_known:true}},
  {player:liveSide(hp,100),opponent:liveSide(foeHP,10),opponent_model:mode}];
}
for(const mode of ['minimax','npc-ai'])for(const [label,interval] of [['normal',80],['4x-style',20],['burst',0]]){
 test(`${mode} publishes the latest battle state through ${label} observation changes`,async()=>{
  const service=new SearchService({parallel:false}),stale=[];let current=-1,resolveLast,rejectLast,timer;
  const final=new Promise((resolve,reject)=>{resolveLast=resolve;rejectLast=reject;timer=setTimeout(()=>reject(Error('Latest battle state produced no prediction')),15000);});
  // Alternate clear wins/losses, ending at a guaranteed immediate win.
  // Earlier readings are allowed until replaced, never after replacement.
  const positions=[[100,100],[1,100],[100,20],[20,100],[100,40],[1,80],[100,60],[30,20]];
  try{
   for(let i=0;i<positions.length;i++){
    current=i;
    service.start(args(...positions[i],mode),result=>{
     if(i!==current)stale.push({callback:i,current});
     if(i===positions.length-1&&Number.isFinite(result.display_score))resolveLast(result);
    },rejectLast,[50,100]);
    if(interval)await pause(interval);
   }
   const latest=await final;
   assert.deepEqual(stale,[]);assert.ok(latest.display_score>=95,`latest reading: ${latest.display_score}`);
   assert.notEqual(latest.display_score,null);
  }finally{clearTimeout(timer);service.cancel();}
 });
}
