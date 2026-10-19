// Approximate temporal features from isolated native execution. These guide
// search; finite resource and passive forecasts never create certificates.
import {restoreCompleteBattle,installChanceTape,nativeMoveChoices} from './native-battle.mjs';
import {observationKey} from './observation-key.mjs';
const values=new Map(),profiles=new Map();
const keep=(cache,key,value)=>{cache.set(key,value);while(cache.size>1024)cache.delete(cache.keys().next().value);return value;};
const stopped=o=>o.shouldStop?.()||performance.now()>(o.deadline??Infinity);
function installProbe(b,state,index){
 let first=true,weight=0.5,draws=0,ordering=0;
 const shuffle=b.prng.shuffle;
 b.prng.shuffle=(...args)=>{ordering++;try{return shuffle.apply(b.prng,args);}finally{ordering--;}};
 installChanceTape(b,[],state.unknownNature||[false,false],state,branches=>{
  if(!ordering)draws++;
  if(first&&branches.length===2){first=false;weight=branches[index].probability;return branches.slice(0,index).reduce((s,c)=>s+c.probability,0)+weight*0.5;}
  first=false;return index?0.75:0.25;
 });
 const result=()=>weight;result.draws=()=>draws;return result;
}
function actionProfile(state,side,options,observed){
 const key=observed+'|actions|'+side;let entry=profiles.get(key);
 if(entry?.complete)return entry.result;
 const original=restoreCompleteBattle(state),p=original.sides[side].active[0],legal=nativeMoveChoices(p);
 const moves=legal.length?legal:[{slot:1,id:'struggle',pp:0}];
 entry??=keep(profiles,key,{cursor:0,result:{attack:0,healing:0,protectPP:0,otherPP:0,pp:0,futureAttack:0,recoil:0}});
 const result=entry.result,candidates=[...moves,...(moves.some(m=>m.id==='struggle')?[]:[{id:'struggle',future:true,pp:0}])];
 for(;entry.cursor<candidates.length;entry.cursor++){
  const choice=candidates[entry.cursor];
  if(stopped(options))return null;
  const definition=original.dex.moves.get(choice.id),shield=!!definition.stallingMove&&!!definition.volatileStatus&&definition.volatileStatus!=='endure';
  let attack=0,healing=0,recoil=0;
  for(let index=0;index<2;index++){
   const b=restoreCompleteBattle(state),source=b.sides[side].active[0],target=b.sides[1-side].active[0];
   if(source.status==='slp'){source.status='';source.statusState={};}
   // Expose potential recovery instead of treating a heal at full HP as useless.
   if(definition.category==='Status')source.hp=Math.min(source.hp,Math.max(1,Math.floor(source.maxhp/4)));
   if(choice.future)source.hp=source.maxhp;
   const beforeSub=target.volatiles.substitute?.hp||0;let damage=0,selfDamage=0,moveHealing=0;
   const targetDamage=target.damage,sourceDamage=source.damage,sourceHeal=source.heal;
   source.heal=function(amount,from,effect){const restored=sourceHeal.call(this,amount,from,effect);
    if(effect?.effectType==='Move'||effect?.id==='drain')moveHealing+=Math.max(0,restored||0);return restored;};
   target.damage=function(amount,...args){damage+=Math.max(0,amount||0);return targetDamage.call(this,amount,...args);};
   source.damage=function(amount,...args){selfDamage+=Math.max(0,amount||0);return sourceDamage.call(this,amount,...args);};
   const weight=installProbe(b,state,index),move=b.dex.getActiveMove(choice.id);if(move.willCrit!==true)move.willCrit=false;
   b.actions.runMove(move,source,1);
   attack+=(damage+Math.max(0,beforeSub-(target.volatiles.substitute?.hp||0)))*weight();
   healing+=moveHealing*weight();recoil+=selfDamage*weight();
  }
  if(choice.future||choice.id==='struggle'){result.futureAttack=attack;result.recoil=recoil;}
  if(!choice.future){const pp=choice.pp||0;result.pp+=pp;if(shield)result.protectPP+=pp;else result.otherPP+=pp;
   result.attack=Math.max(result.attack,attack);result.healing+=healing*pp;}
 }
 entry.complete=true;return result;
}
function passiveProfile(state,options,observed){
 const key=observed+'|passive';let entry=profiles.get(key);
 if(entry?.complete)return entry.result;
 entry??=keep(profiles,key,{saved:state.saved,turn:0,clock:[Infinity,Infinity],initial:state.saved.sides.map(s=>s.pokemon[0].hp),seen:new Set([observed]),randomized:false});
 const b=restoreCompleteBattle({...state,saved:entry.saved}),{initial,clock}=entry;
 const probe=installProbe(b,state,0);
 // Partial native timelines retain their snapshot and cursor, not a live
 // battle object. Small worker slices therefore make progress without an
 // unbounded cache of heavyweight native engines.
 while(entry.turn<32&&!b.ended){
  if(stopped(options)){entry.saved=b.toJSON();return null;}
  b.eachEvent('Update');b.fieldEvent('Residual');b.faintMessages();entry.turn++;
  for(let i=0;i<2;i++)if(b.sides[i].active[0].hp<=0&&clock[i]===Infinity)clock[i]=entry.turn;
  entry.randomized ||= probe.draws()>0;
  if(!entry.randomized&&!b.ended){
   const next=observationKey({...state,saved:b.toJSON()});
   if(entry.seen.has(next))break;
   entry.seen.add(next);
  }
 }
 if(stopped(options)){entry.saved=b.toJSON();return null;}
 const damaged=restoreCompleteBattle(state),before=damaged.sides.map(s=>{const p=s.active[0];p.hp=Math.min(p.hp,Math.max(1,Math.floor(p.maxhp/2)));return p.hp;});
 installProbe(damaged,state,0);damaged.eachEvent('Update');damaged.fieldEvent('Residual');
 const first=damaged.sides.map((s,i)=>s.active[0].hp-before[i]);
 // Repeat a tick at the same HP after native item consumption/timer updates.
 // Consumable berries and delayed one-off healing add a finite reserve rather
 // than an invented heal every turn. Persistent recovery remains renewable.
 for(let i=0;i<2;i++)if(damaged.sides[i].active[0].hp>0)damaged.sides[i].active[0].hp=before[i];
 damaged.eachEvent('Update');damaged.fieldEvent('Residual');
 const next=damaged.sides.map((s,i)=>s.active[0].hp-before[i]);
 const net=first.map((v,i)=>v>0?Math.min(v,Math.max(0,next[i])):v),burst=first.map((v,i)=>Math.max(0,v-net[i]));
 entry.complete=true;entry.result={clock,net,burst,initial,steps:entry.turn};delete entry.saved;delete entry.seen;return entry.result;
}
export function nativePositionFeatures(state,options={}){
 const key=observationKey(state);if(values.has(key))return values.get(key);
 if(stopped(options))return null;
 const b=restoreCompleteBattle(state),mon=b.sides.map(s=>s.active[0]);
 const actions=[actionProfile(state,0,options,key),actionProfile(state,1,options,key)];if(actions.some(v=>!v))return null;
 const passive=passiveProfile(state,options,key);if(!passive)return null;
 const lifetime=actions.map((a,i)=>{
  const p=mon[i],incoming=actions[1-i].attack,healing=Math.max(0,passive.net[i]);
  const loss=Math.max(0,-passive.net[i],Number.isFinite(passive.clock[i])?p.hp/passive.clock[i]:0);
  const safeBlocks=Math.min(a.protectPP,a.otherPP+(p.volatiles.stall?0:1));
  const reserve=p.hp+(p.volatiles.substitute?.hp||0)+a.healing+passive.burst[i]+safeBlocks*incoming;
  const drain=incoming+loss-healing;
  const recoilDrain=Math.max(1,a.recoil+loss-healing);
  const resourceLimit=a.pp+Math.ceil(p.maxhp/recoilDrain);
  const survival=drain>0?reserve/drain:Infinity;
  const sleep=p.status==='slp'?Math.max(0,(p.statusState.time||1)-1)/(p.hasAbility('earlybird')?2:1):p.volatiles.mustrecharge?1:0;
  return {turns:Math.max(0.1,Math.min(survival,resourceLimit)-sleep),stable:incoming+loss<=healing&&Math.max(incoming,actions[1-i].futureAttack)+loss<=healing,resources:a.pp};
 });
 const speed=mon[0].getActionSpeed()-mon[1].getActionSpeed();
 const initiative=(speed===0?0:speed>0?1:-1)*(b.field.pseudoWeather.trickroom?-1:1)*0.1;
 let value=1/(1+Math.exp(-3.5*(Math.log1p(lifetime[0].turns)-Math.log1p(lifetime[1].turns))-initiative));
 if(lifetime[0].stable&&!lifetime[1].stable&&lifetime[0].resources>=lifetime[1].turns)value=0.98;
 if(lifetime[1].stable&&!lifetime[0].stable&&lifetime[1].resources>=lifetime[0].turns)value=0.02;
 return keep(values,key,{value:Math.max(0.02,Math.min(0.98,value)),actions,passive,lifetime});
}
export function nativePositionValue(b,options={}){
 const [p,q]=b.sides.map(s=>s.active[0]);if(p.hp<=0)return 0;if(q.hp<=0)return 1;if(b.ended)return b.winner==='Player'?1:0;
 return nativePositionFeatures({saved:b.toJSON()},options)?.value??null;
}
