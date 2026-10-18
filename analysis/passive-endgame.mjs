// Bounded dynamic program for passive endgames. Native probes compile a small
// resource model; values back up from terminal turns, never heuristic leaves.
import {restoreCompleteBattle,installChanceTape,nativeMoveChoices,completeMoveDex} from './native-battle.mjs';
const inert=new Set(['','synchronize','innerfocus','naturalcure','runaway']);
const empty=x=>!x||Object.keys(x).length===0;
const unsupported=Symbol('outside passive proof domain');
const noExtra=m=>!m.drain&&!m.recoil&&!m.selfdestruct&&!m.forceSwitch&&!m.selfSwitch&&!m.sideCondition&&!m.slotCondition&&!m.weather&&!m.terrain&&!m.pseudoWeather&&!m.damageCallback;
function actionKind(m){
 if(m.id==='splash')return 'wait';
 if(noExtra(m)&&m.category==='Status'&&m.stallingMove&&m.volatileStatus==='protect'&&m.priority>0)return 'protect';
 if(noExtra(m)&&m.category==='Status'&&m.target==='self'&&m.priority===0&&Array.isArray(m.heal)&&m.heal[0]>0&&m.heal[0]<m.heal[1]&&
  !m.self&&!m.status&&!m.volatileStatus&&!m.boosts&&!m.secondary&&!m.secondaries&&!Object.keys(m).some(k=>k.startsWith('on')))return 'heal';
 return null;
}
function fixedMove(m){return noExtra(m)&&m.target==='normal'&&m.category!=='Status'&&m.priority===0&&m.accuracy===100&&(m.damage==='level'||Number.isInteger(m.damage)&&m.damage>0)&&
 !m.self&&!m.status&&!m.volatileStatus&&!m.boosts&&!m.secondary&&!m.secondaries&&!Object.keys(m).some(k=>k.startsWith('on'));}
function chance(b,state,index=0,booleanEvent=()=>{throw unsupported;}){
 installChanceTape(b,[],state.unknownNature,state,choices=>{
  if(choices.length===2&&choices.every(c=>typeof c.value==='boolean')){
   booleanEvent(choices);const c=choices[index];return choices.slice(0,index).reduce((s,c)=>s+c.probability,0)+c.probability/2;
  }

  throw unsupported;
 });
 // Supported residual effects act independently on their own Pokémon. Their
 // tied ordering commutes. Action-order ties were rejected by the domain guard.
 b.prng.shuffle=()=>{};
}
export function startPassiveEndgame(state){
 if(state?.kind!=='decision'||state.unknownNature?.some(Boolean)||state.unknownHistory?.some(Boolean))return null;
 const mons=state.saved?.sides?.map(s=>s.pokemon?.[0]);if(mons?.length!==2)return null;
 if(mons.some(p=>!p||!Number.isInteger(p.hp)||!Number.isInteger(p.maxhp)||p.moveSlots.some(m=>!Number.isInteger(m.pp)||m.pp<0)||!inert.has(p.ability)||!['','leftovers'].includes(p.item)))return null;
 if(mons[0].status||!['psn','tox'].includes(mons[1].status))return null;
 if(mons[1].moveSlots.length!==1||!fixedMove(completeMoveDex.moves.get(mons[1].moveSlots[0].id)))return null;
 if(mons[0].moveSlots.some(m=>m.disabled))return null;
 const b=restoreCompleteBattle(state),[p,q]=b.sides.map(s=>s.active[0]);
 if(b.format.id!=='runbun'||b.ended||b.midTurn||b.requestState!=='move'||b.queue.list.length||b.field.weather||b.field.terrain||!empty(b.field.pseudoWeather))return null;
 if(b.sides.some(s=>s.pokemon.length!==1||!empty(s.sideConditions)||s.slotConditions?.some(c=>!empty(c))))return null;
 if([p,q].some(m=>!Number.isInteger(m.hp)||!Number.isInteger(m.maxhp)||m.hp>m.maxhp||m.moveSlots.some(a=>!Number.isInteger(a.pp)||a.pp<0)||!Number.isFinite(m.getActionSpeed())||m.getActionSpeed()<=0||m.hp<=0||m.maxhp<2||m.transformed||m.terastallized||Object.values(m.boosts).some(Boolean)))return null;
 if(!empty(q.volatiles)||Object.keys(p.volatiles).some(k=>k!=='stall'))return null;
 const counter=p.volatiles.stall?.counter||1,cap=b.dex.conditions.get('stall').counterMax;
 const counters=[];for(let n=1;n<=cap;n*=3)counters.push(n);
 if(!counters.includes(counter)||p.volatiles.stall&&p.volatiles.stall.duration!==1||p.getActionSpeed()===q.getActionSpeed())return null;
 const available=nativeMoveChoices(p),legal=available.filter(m=>actionKind(b.dex.moves.get(m.id)));if(!legal.length)return null;
 const actions=legal.map(m=>({slot:m.slot,id:m.id,pp:m.pp,kind:actionKind(b.dex.moves.get(m.id))}));
 return {state,completeActions:legal.length===available.length,phase:'clock',clockSaved:state.saved,clock:[],actions,counters,counter,
  maxhp:p.maxhp,hp:p.hp,fast:p.getActionSpeed()>q.getActionSpeed(),foePP:q.moveSlots[0].pp,
  cursor:0,shieldCursor:0,shieldBranch:0,shields:new Map(),memo:new Map(),policy:new Map(),stack:[],states:0,branches:0,probes:0,elapsed:0};
}
function cleanProbe(job){
 const b=restoreCompleteBattle(job.state),[p,q]=b.sides.map(s=>s.active[0]);
 q.hp=q.maxhp;q.status='';q.statusState={};p.hp=p.maxhp;delete p.volatiles.stall;
 return b;
}
function compileProbe(job){
 if(job.phase==='damage'){
  const b=cleanProbe(job),p=b.p1.active[0];let damage=0;const original=p.damage;
  p.damage=function(amount,...args){damage+=Math.max(0,amount||0);return original.call(this,amount,...args);};
  chance(b,job.state);b.actions.runMove(b.dex.getActiveMove(b.p2.active[0].moveSlots[0].id),b.p2.active[0],1);
  if(!Number.isInteger(damage)||damage<0)throw unsupported;
  job.damage=damage;job.phase='passive';job.probes++;return;
 }
 if(job.phase==='passive'){
  const b=cleanProbe(job),p=b.p1.active[0];p.hp=1;chance(b,job.state);
  b.eachEvent('Update');b.fieldEvent('Residual');job.healing=p.hp-1;
  if(job.healing<0)throw unsupported;job.phase='actions';job.probes++;return;
 }
 if(job.phase==='actions'){
  if(job.cursor===job.actions.length){job.phase='shields';return;}
  const a=job.actions[job.cursor++];if(a.kind!=='heal')return;
  const b=cleanProbe(job),p=b.p1.active[0];p.hp=1;let healing=0;const original=p.heal;
  p.heal=function(amount,...args){healing+=amount;return original.call(this,amount,...args);};
  chance(b,job.state);b.actions.runMove(b.dex.getActiveMove(a.id),p,1);
  if(!Number.isInteger(healing)||healing<=0)throw unsupported;
  a.healing=healing;job.probes++;return;
 }
 if(job.phase==='shields'){
  const protect=job.actions.find(a=>a.kind==='protect');
  if(!protect||job.shieldCursor===job.counters.length){job.phase='solve';return;}
  const counter=job.counters[job.shieldCursor],index=job.shieldBranch,b=cleanProbe(job),p=b.p1.active[0];
  if(counter>1){p.addVolatile('stall');Object.assign(p.volatiles.stall,{duration:1,counter});}
  let probability=1,draws=0,damage=0;const original=p.damage;
  p.damage=function(amount,...args){damage+=Math.max(0,amount||0);return original.call(this,amount,...args);};
  chance(b,job.state,index,choices=>{if(++draws>1)throw unsupported;probability=choices[index].probability;});
  if(!b.choose('p1',`move ${protect.slot}`)||!b.choose('p2','move 1'))throw unsupported;
  const blocked=damage===0;if(!blocked&&damage!==job.damage)throw unsupported;
  const next=p.volatiles.stall?.counter||1;if(!job.counters.includes(next))throw unsupported;
  const list=job.shields.get(counter)||[];list.push({probability,blocked,counter:next});job.shields.set(counter,list);
  if(!draws||index===1){if(Math.abs(list.reduce((s,v)=>s+v.probability,0)-1)>1e-12)throw unsupported;job.shieldCursor++;job.shieldBranch=0;}
  else job.shieldBranch=1;
  job.probes++;
 }
}
const key=s=>s.turn+'|'+s.hp+'|'+s.counter+'|'+s.pp.join(',');
function frame(job,s){
 const k=key(s);if(job.memo.has(k))return null;
 const actions=job.actions.map((a,i)=>({...a,index:i})).filter(a=>s.pp[a.index]>0);
 // Ordering changes work only: every returned value still accounts for all
 // chance outcomes, and upper bound 1 permits stopping at a proved sure win.
 actions.sort((a,b)=>{
  const priority=a=>a.kind==='protect'?(s.counter===1&&s.hp>job.maxhp-(job.actions.find(x=>x.kind==='heal')?.healing||0)?3:0):a.kind==='heal'?2:1;
  return priority(b)-priority(a);
 });
 job.states++;return {s,key:k,actions,index:0,lower:0,upper:0};
}
function transitions(job,s,a){
 const chance=a.kind==='protect'?job.shields.get(s.counter):[{probability:1,blocked:false,counter:1}];
 return chance.map(c=>{
  let hp=s.hp;
  if(a.kind==='heal'&&job.fast)hp=Math.min(job.maxhp,hp+a.healing);
  if(!c.blocked)hp-=job.damage;
  if(hp>0&&a.kind==='heal'&&!job.fast)hp=Math.min(job.maxhp,hp+a.healing);
  if(hp>0)hp=Math.min(job.maxhp,hp+job.healing);
  const pp=s.pp.map((v,i)=>v-(i===a.index?1:0));
  return {probability:c.probability,state:{turn:s.turn+1,hp,counter:c.counter,pp}};
 });
}
function solveStep(job,limit){
 if(!job.stack.length){job.stack.push(frame(job,{turn:0,hp:job.hp,counter:job.counter,pp:job.actions.map(a=>a.pp)}));}
 const f=job.stack.at(-1),finish=value=>{job.memo.set(f.key,value);job.stack.pop();if(!job.stack.length){job.done=true;job.bounds=value;}};
 if(f.s.hp<=0){finish([0,0]);return;}
 if(f.s.turn===job.clock.length){finish([1,1]);return;}
 // Struggle lies outside this template. Unknown mass must not be called a loss.
 if(!f.actions.length){finish([0,1]);return;}
 if(f.lower===1||f.index===f.actions.length){finish(f.lower===1?[1,1]:[f.lower,f.upper]);return;}
 if(!f.pending){f.pending=transitions(job,f.s,f.actions[f.index]);f.branch=0;f.sum=[0,0];}
 if(f.branch===f.pending.length){
  if(f.sum[0]>f.lower||!job.policy.has(f.key))job.policy.set(f.key,f.actions[f.index].slot);
  f.lower=Math.max(f.lower,f.sum[0]);f.upper=Math.max(f.upper,f.sum[1]);f.index++;f.pending=null;return;
 }
 const edge=f.pending[f.branch],k=key(edge.state),value=job.memo.get(k);
 if(value){f.sum[0]+=edge.probability*value[0];f.sum[1]+=edge.probability*value[1];f.branch++;job.branches++;}
 else if(job.states<limit)job.stack.push(frame(job,edge.state));
 else return false;
}
export function advancePassiveEndgame(job,options={}){
 if(job.rejected||options.shouldStop?.())return null;
 const start=performance.now(),deadline=Math.min(options.deadline??Infinity,start+Math.max(0,Math.min(options.passiveEndgameMs??50,options.timeMs??50)));
 const stop=()=>options.shouldStop?.()||performance.now()>=deadline;
 try{
  if(job.phase==='clock'){
   const b=restoreCompleteBattle({...job.state,saved:job.clockSaved});chance(b,job.state);
   while(!b.ended&&job.clock.length<32&&!stop()){
    b.eachEvent('Update');b.fieldEvent('Residual');b.faintMessages();job.clock.push(b.p2.active[0].hp);
   }
   if(b.p2.active[0].hp<=0){
    delete job.clockSaved;if(job.foePP<job.clock.length)throw unsupported;job.phase='damage';
   }else if(job.clock.length===32)throw unsupported;
   else job.clockSaved=b.toJSON();
  }
  while(!job.done&&!stop()){
   if(job.phase!=='solve')compileProbe(job);
   else if(solveStep(job,options.passiveEndgameStates??2048)===false)break;
  }
 }catch(error){if(error!==unsupported)throw error;job.rejected=true;}
 job.elapsed+=performance.now()-start;
 if(job.rejected||!job.done||job.bounds[0]!==job.bounds[1]||!job.completeActions&&job.bounds[0]!==1||options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
 return {value:job.bounds[0],states:job.states,branches:job.branches,merged:job.branches-job.states+1,
  root_action:job.policy.get(key({turn:0,hp:job.hp,counter:job.counter,pp:job.actions.map(a=>a.pp)})),native_probes:job.probes,passive_turns:job.clock.length,elapsed_ms:job.elapsed};
}
export const passiveEndgameProof={id:'native-passive-resources-v1',algorithm:'exact-native-passive-resource-endgame',
 opponentModel:'optimized player; opponent has one fixed retaliation move',enabled:o=>o.passiveEndgames!==false&&o.exactEndgames!==false,
 mayApply:s=>['psn','tox'].includes(s.opponent.build.status)&&!s.player.build.status&&s.opponent.build.moves.length===1&&fixedMove(completeMoveDex.moves.get(s.opponent.build.moves[0]))&&
  [s.player,s.opponent].every(p=>['','Leftovers'].includes(p.build.item||'')&&inert.has((p.build.ability||'').toLowerCase().replace(/[^a-z]/g,'')))&&s.player.build.moves.some(id=>actionKind(completeMoveDex.moves.get(id))),start:startPassiveEndgame,advance:advancePassiveEndgame};
