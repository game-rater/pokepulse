// Continuation strategies are approximate. Candidate moves execute a complete
// native turn; this module never substitutes a made-up effect for a callback.
import {restoreCompleteBattle,installChanceTape} from './native-battle.mjs';
import {observationKey} from './observation-key.mjs';
import {selectContinuationChoices} from './action-usefulness.mjs';
import {putCached} from './bounded-cache.mjs';

export const CONTINUATION_VERSION=4;
export function continuationChoices(p,options){return selectContinuationChoices(p,options).choices;}
function random(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function terminal(b){const [p,q]=b.sides.map(s=>s.active[0]);return p.hp<=0?0:q.hp<=0?1:b.ended?(b.winner==='Player'?1:0):null;}

// One temporal evaluation model is shared by policy probes and rollout leaves.
export {nativePositionValue as continuationValue} from './position-features.mjs';
import {nativePositionValue as continuationValue} from './position-features.mjs';
function strategies(matrix,weights){
 const rows=matrix.length,cols=matrix[0].length;
 if(weights){const values=matrix.map(row=>row.reduce((s,v,j)=>s+v*weights[j],0)),best=Math.max(...values),ties=values.map(v=>Math.abs(v-best)<1e-9);return [ties.map(t=>t/ties.filter(Boolean).length),weights];}
 // Fictitious play returns mixed strategies for simultaneous choices. Each
 // side optimizes against the other distribution, not the revealed move.
 if(cols===1){const best=Math.max(...matrix.map(r=>r[0])),ties=matrix.map(r=>Math.abs(r[0]-best)<1e-9),n=ties.filter(Boolean).length;return [ties.map(t=>Number(t)/n),[1]];}
 if(rows===1){const best=Math.min(...matrix[0]),ties=matrix[0].map(v=>Math.abs(v-best)<1e-9),n=ties.filter(Boolean).length;return [[1],ties.map(t=>Number(t)/n)];}
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
 const key=observed+'|policy-v'+CONTINUATION_VERSION+'|'+JSON.stringify(options.npcWeights||null)+'|filter:'+Number(options.filterUselessTurns!==false);
 let entry=cache.get(key);
 if(!entry){
  const b=restoreCompleteBattle(state),selection=b.sides.map((s,i)=>selectContinuationChoices(s.active[0],{filterUselessTurns:options.filterUselessTurns!==false&&!(i===1&&options.npcWeights)}));
  const actions=selection.map(s=>s.choices.map(m=>m.slot)),actionFlags=selection.map(s=>({flags:s.flags,filtered:s.filtered,waiting:s.waiting}));
  entry={actions,actionFlags,cursor:0,matrix:actions[0].map(()=>actions[1].map(()=>0)),samples:2};
  if(actions.every(a=>a.length===1))entry.policy={actions,probabilities:[[1],[1]],matrix:null,actionFlags};
  putCached(cache,key,entry,2048);
 }
 if(entry.policy)return entry.policy;
 const count=entry.actions[0].length*entry.actions[1].length;
 while(entry.cursor<count*entry.samples){
  if(options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
  const index=Math.floor(entry.cursor/entry.samples),i=Math.floor(index/entry.actions[1].length),j=index%entry.actions[1].length;
  const b=restoreCompleteBattle(state),draw=random(parseInt(observed.slice(0,8),16)^Math.imul(entry.cursor+1,0x9e3779b9));
  let first=true,weight=1/entry.samples;
  installChanceTape(b,[],state.unknownNature,state,branches=>{
   const index=entry.cursor%entry.samples;
   if(first&&branches.length===2){first=false;weight=branches[index].probability;return branches.slice(0,index).reduce((s,c)=>s+c.probability,0)+weight*0.5;}
   first=false;return draw();
  });
  for(let side=0;side<2;side++)if(!b.choose(`p${side+1}`,`move ${entry.actions[side][side?j:i]}`))throw Error('Native continuation move rejected: '+b.sides[side].choice.error);
  let value=continuationValue(b,options);
  if(value===null)return null;
  if(terminal(b)===null){
   const before=state.saved.sides.map(s=>s.pokemon[0]),after=b.sides.map(s=>s.active[0]);
   // Break equal horizon evaluations in favor of actual progress. Otherwise a
   // failed move can tie an attack merely because both can win on a later turn.
   const progress=(before[1].hp-after[1].hp)/before[1].maxhp-(before[0].hp-after[0].hp)/before[0].maxhp;
   value=value*0.98+0.01+0.01*Math.max(-1,Math.min(1,progress));
  }
  entry.matrix[i][j]+=value*weight;entry.cursor++;
 }
 const weights=options.npcWeights&&entry.actions[1].map(slot=>options.npcWeights.find(m=>m.slot===slot)?.probability||0);
 entry.policy={actions:entry.actions,probabilities:strategies(entry.matrix,weights),matrix:entry.matrix,actionFlags:entry.actionFlags};
 return entry.policy;
}
export function drawContinuation(policy,draw){
 return policy.actions.map((slots,side)=>{let n=draw();for(let i=0;i<slots.length;i++){n-=policy.probabilities[side][i];if(n<0)return slots[i];}return slots.at(-1);});
}
