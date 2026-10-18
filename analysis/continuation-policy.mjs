// Continuation strategies are approximate. Candidate moves execute a complete
// native turn; this module never substitutes a made-up effect for a callback.
import {restoreCompleteBattle,installChanceTape,nativeMoveChoices} from './complete-moves.mjs';
import {observationKey} from './observation-key.mjs';

export const CONTINUATION_VERSION=2;
const firstOnly=new Set(['fakeout','firstimpression','matblock']);
export function continuationChoices(p){
 const moves=nativeMoveChoices(p),useful=moves.filter(m=>!firstOnly.has(m.id)||p.activeMoveActions===0);
 return useful.length?useful:moves.length?moves:[{slot:1,id:'struggle'}];
}
function random(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function terminal(b){const [p,q]=b.sides.map(s=>s.active[0]);return p.hp<=0?0:q.hp<=0?1:b.ended?(b.winner==='Player'?1:0):null;}

// A nonterminal evaluation, not a probability certificate. Damage pressure
// comes from isolated native move execution, including immunity/accuracy and
// callbacks. In particular, getDamage alone bypasses ability immunity and
// conditional-move success, so it is deliberately not used as a substitute.
const pressureCache=new Map();
function pressure(state,side){
 const key=observationKey(state)+'|pressure|'+side;
 if(pressureCache.has(key))return pressureCache.get(key);
 const original=restoreCompleteBattle(state),p=original.sides[side].active[0];
 let best=0;
 for(const choice of continuationChoices(p)){
  if(original.dex.moves.get(choice.id).category==='Status')continue;
  let total=0;
  for(const [stratum,quantile] of [0.25,0.75].entries()){
   const probe=restoreCompleteBattle(state),source=probe.sides[side].active[0],target=probe.sides[1-side].active[0],before=target.hp,beforeSub=target.volatiles.substitute?.hp||0;
   // Sleep tempo is evaluated separately; inspect the attack available on waking.
   if(source.status==='slp'){source.status='';source.statusState={};}
   let weighted=false,weight=0.5;
   installChanceTape(probe,[],state.unknownNature||[false,false],state,branches=>{
    if(!weighted&&branches.length===2){
     weighted=true;weight=branches[stratum].probability;
     return branches.slice(0,stratum).reduce((s,c)=>s+c.probability,0)+weight*0.5;
    }
    return quantile;
   });
   const move=probe.dex.getActiveMove(choice.id);if(move.willCrit!==true)move.willCrit=false;
   probe.actions.runMove(move,source,1);
   total+=(Math.max(0,before-target.hp)+Math.max(0,beforeSub-(target.volatiles.substitute?.hp||0)))*weight;
  }
  best=Math.max(best,total);
 }
 pressureCache.set(key,best);while(pressureCache.size>2048)pressureCache.delete(pressureCache.keys().next().value);
 return best;
}
export function continuationValue(b){
 const done=terminal(b);if(done!==null)return done;
 // Evaluation must not consume the real trajectory's RNG or leave hit-event
 // bookkeeping on it. All pressure calculations use their own native clone.
 const saved={saved:b.toJSON()},copy=restoreCompleteBattle(saved),[p,q]=copy.sides.map(s=>s.active[0]);
 const attacks=[pressure(saved,0),pressure(saved,1)];
 const health=m=>m.hp+(m.volatiles.substitute?.hp||0);
 const delay=m=>m.status==='slp'?Math.max(0,(m.statusState.time||1)-1)/(m.hasAbility('earlybird')?2:1):m.volatiles.mustrecharge?1:0;
 const endurance=[health(p)/Math.max(1,attacks[1])+delay(q),health(q)/Math.max(1,attacks[0])+delay(p)];
 const speed=p.getActionSpeed()-q.getActionSpeed();
 const initiative=speed===0?0:(speed>0?1:-1)*(copy.field.pseudoWeather.trickroom?-1:1)*0.5;
 // Keep heuristic leaves distinct from actual wins/losses.
 return Math.max(0.02,Math.min(0.98,1/(1+Math.exp(-Math.max(-12,Math.min(12,(endurance[0]-endurance[1]+initiative)*1.2))))));
}
function strategies(matrix,weights){
 const rows=matrix.length,cols=matrix[0].length;
 if(weights){const values=matrix.map(row=>row.reduce((s,v,j)=>s+v*weights[j],0)),best=Math.max(...values),ties=values.map(v=>Math.abs(v-best)<1e-9);return [ties.map(t=>t/ties.filter(Boolean).length),weights];}
 // Fictitious play returns mixed strategies for simultaneous choices. Each
 // side optimizes against the other distribution, not the revealed move.
 const p=Array(rows).fill(1),q=Array(cols).fill(1);
 for(let n=0;n<128;n++){
  const rv=matrix.map(row=>row.reduce((s,v,j)=>s+v*q[j],0));
  const cv=matrix[0].map((_,j)=>matrix.reduce((s,row,i)=>s+row[j]*p[i],0));
  p[rv.indexOf(Math.max(...rv))]++;q[cv.indexOf(Math.min(...cv))]++;
 }
 return [p.map(v=>v/p.reduce((s,x)=>s+x,0)),q.map(v=>v/q.reduce((s,x)=>s+x,0))];
}
export function nativeContinuationPolicy(state,cache,options={}){
 const observed=observationKey(state);
 const key=observed+'|policy-v'+CONTINUATION_VERSION+'|'+JSON.stringify(options.npcWeights||null);
 let entry=cache.get(key);
 if(!entry){
  const b=restoreCompleteBattle(state),actions=b.sides.map(s=>continuationChoices(s.active[0]).map(m=>m.slot));
  entry={actions,cursor:0,matrix:actions[0].map(()=>actions[1].map(()=>0)),samples:2};
  if(actions.every(a=>a.length===1))entry.policy={actions,probabilities:[[1],[1]],matrix:null};
  cache.set(key,entry);while(cache.size>2048)cache.delete(cache.keys().next().value);
 }
 if(entry.policy)return entry.policy;
 const count=entry.actions[0].length*entry.actions[1].length;
 while(entry.cursor<count*entry.samples){
  if(options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
  const index=Math.floor(entry.cursor/entry.samples),i=Math.floor(index/entry.actions[1].length),j=index%entry.actions[1].length;
  const b=restoreCompleteBattle(state),draw=random(parseInt(observed.slice(0,8),16)^Math.imul(entry.cursor+1,0x9e3779b9));
  installChanceTape(b,[],state.unknownNature,state,draw);
  for(let side=0;side<2;side++)if(!b.choose(`p${side+1}`,`move ${entry.actions[side][side?j:i]}`))throw Error('Native continuation move rejected: '+b.sides[side].choice.error);
  let value=continuationValue(b);
  if(terminal(b)===null){
   const before=state.saved.sides.map(s=>s.pokemon[0]),after=b.sides.map(s=>s.active[0]);
   // Break equal horizon evaluations in favor of actual progress. Otherwise a
   // failed move can tie an attack merely because both can win on a later turn.
   const progress=(before[1].hp-after[1].hp)/before[1].maxhp-(before[0].hp-after[0].hp)/before[0].maxhp;
   value=value*0.98+0.01+0.01*Math.max(-1,Math.min(1,progress));
  }
  entry.matrix[i][j]+=value/entry.samples;entry.cursor++;
 }
 const weights=options.npcWeights&&entry.actions[1].map(slot=>options.npcWeights.find(m=>m.slot===slot)?.probability||0);
 entry.policy={actions:entry.actions,probabilities:strategies(entry.matrix,weights),matrix:entry.matrix};
 return entry.policy;
}
export function drawContinuation(policy,draw){
 return policy.actions.map((slots,side)=>{let n=draw();for(let i=0;i<slots.length;i++){n-=policy.probabilities[side][i];if(n<0)return slots[i];}return slots.at(-1);});
}
