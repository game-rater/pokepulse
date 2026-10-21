// Continuation strategies are approximate. Candidate moves execute a complete
// native turn; this module never substitutes a made-up effect for a callback.
import {restoreCompleteBattle,installChanceTape} from './native-battle.mjs';
import {observationKey} from './observation-key.mjs';
import {selectContinuationChoices} from './action-usefulness.mjs';
import {putCached} from './bounded-cache.mjs';

export const CONTINUATION_VERSION=7;
export function continuationChoices(p,options){return selectContinuationChoices(p,options).choices;}
function random(seed){let x=seed>>>0||1;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};}
function terminal(b){const [p,q]=b.sides.map(s=>s.active[0]);return p.hp<=0?0:q.hp<=0?1:b.ended?(b.winner==='Player'?1:0):null;}

// One temporal evaluation model is shared by policy probes and rollout leaves.
export {nativePositionValue as continuationValue} from './position-features.mjs';
import {nativePositionValue as continuationValue} from './position-features.mjs';
export function continuationStrategies(matrix,weights){
 const rows=matrix.length,cols=matrix[0].length;
 if(weights){const values=matrix.map(row=>row.reduce((s,v,j)=>s+v*weights[j],0)),best=Math.max(...values),ties=values.map(v=>Math.abs(v-best)<1e-9);return [ties.map(t=>t/ties.filter(Boolean).length),weights];}
 // At a saddle point both sides have an optimal pure strategy. Starting
 // fictitious play with pseudocounts would leak probability into losing moves,
 // including a move that gives up a guaranteed finishing attack.
 const rowFloors=matrix.map(row=>Math.min(...row)),columnCeilings=matrix[0].map((_,j)=>Math.max(...matrix.map(row=>row[j])));
 const lower=Math.max(...rowFloors),upper=Math.min(...columnCeilings);
 if(Math.abs(lower-upper)<1e-12){
  const p=rowFloors.map(v=>Math.abs(v-lower)<1e-12),q=columnCeilings.map(v=>Math.abs(v-upper)<1e-12);
  return [p.map(v=>Number(v)/p.filter(Boolean).length),q.map(v=>Number(v)/q.filter(Boolean).length)];
 }
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
// Integrate the already-probed action table at the rollout horizon rather
// than drawing another action pair and executing that same turn again.
// These are heuristic/sample values, not certified game bounds.
export function continuationPolicyValue(policy){
 if(policy.estimatedValue!==undefined)return policy.estimatedValue;
 if(!policy.matrix)return null;
 return policy.matrix.reduce((sum,row,i)=>sum+policy.probabilities[0][i]*row.reduce((s,v,j)=>s+v*policy.probabilities[1][j],0),0);
}
function probeTurn(state,observed,entry,cursor){
 const index=Math.floor(cursor/entry.samples),i=index%entry.actions[0].length,j=Math.floor(index/entry.actions[0].length);
 const b=restoreCompleteBattle(state),draw=random(parseInt(observed.slice(0,8),16)^Math.imul(cursor+1,0x9e3779b9));
 let first=true,weight=1/entry.samples;
 installChanceTape(b,[],state.unknownNature,state,branches=>{
  const index=cursor%entry.samples;
  if(first&&branches.length===2){first=false;weight=branches[index].probability;return branches.slice(0,index).reduce((s,c)=>s+c.probability,0)+weight*0.5;}
  first=false;return draw();
 });
 for(let side=0;side<2;side++)if(!b.choose(`p${side+1}`,`move ${entry.actions[side][side?j:i]}`))throw Error('Native continuation move rejected: '+b.sides[side].choice.error);
 return {b,i,j,weight,end:terminal(b)};
}
function terminalPolicy(entry,side,index){
 return {actions:entry.actions,probabilities:entry.actions.map((slots,s)=>slots.map((_,i)=>s===side?Number(i===index):1/slots.length)),matrix:null,estimatedValue:side===0?1:0,actionFlags:entry.actionFlags};
}
export function nativeContinuationPolicy(state,cache,options={}){
 const observed=observationKey(state);
 const key=observed+'|policy-v'+CONTINUATION_VERSION+'|'+JSON.stringify(options.npcWeights||null)+'|filter:'+Number(options.filterUselessTurns!==false);
 let entry=cache.get(key);
 if(!entry){
  const b=restoreCompleteBattle(state),selection=b.sides.map((s,i)=>selectContinuationChoices(s.active[0],{filterUselessTurns:options.filterUselessTurns!==false&&!(i===1&&options.npcWeights)}));
  const actions=selection.map(s=>s.choices.map(m=>m.slot)),actionFlags=selection.map(s=>({flags:s.flags,filtered:s.filtered,waiting:s.waiting}));
  entry={actions,actionFlags,cursor:0,matrix:actions[0].map(()=>actions[1].map(()=>0)),samples:2,
   scan:0,scanOrder:Array.from({length:actions[0].length*actions[1].length},(_,i)=>i),terminalPairs:actions[0].map(()=>actions[1].map(()=>true)),terminalValues:actions[0].map(()=>actions[1].map(()=>0)),
   terminalRows:actions[0].map(()=>true),terminalColumns:actions[1].map(()=>true),rowCounts:actions[0].map(()=>0),columnCounts:actions[1].map(()=>0)};
  if(actions.every(a=>a.length===1))entry.policy={actions,probabilities:[[1],[1]],matrix:null,actionFlags};
  putCached(cache,key,entry,2048);
 }
 if(entry.policy)return entry.policy;
 const count=entry.actions[0].length*entry.actions[1].length;
 // Check immediate native terminal replies before expensive heuristic leaves.
 // No native battle objects are retained: unfinished pairs replay their same
 // probe seed when feature evaluation begins. Both sides get the same test.
 while(!options.npcWeights&&entry.scan<count*entry.samples){
  if(options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
  const cursor=entry.scanOrder[Math.floor(entry.scan/entry.samples)]*entry.samples+entry.scan%entry.samples;
  const {i,j,weight,end}=probeTurn(state,observed,entry,cursor);entry.scan++;
  entry.terminalPairs[i][j]&&=end!==null;
  if(end!==null)entry.terminalValues[i][j]+=end*weight;
  entry.terminalRows[i]&&=end===1;entry.terminalColumns[j]&&=end===0;
  entry.rowCounts[i]++;entry.columnCounts[j]++;
  // An anchor KO for the player asks for the rest of that row first. An
  // anchor loss already follows column order. Seeds remain pair-specific.
  if(entry.scan===entry.samples&&entry.terminalRows[0])entry.scanOrder.sort((a,b)=>Number(b%entry.actions[0].length===0)-Number(a%entry.actions[0].length===0));
  if(entry.terminalRows[i]&&entry.rowCounts[i]===entry.actions[1].length*entry.samples)return entry.policy=terminalPolicy(entry,0,i);
  if(entry.terminalColumns[j]&&entry.columnCounts[j]===entry.actions[0].length*entry.samples)return entry.policy=terminalPolicy(entry,1,j);
 }
 while(entry.cursor<count*entry.samples){
  if(options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
  const index=Math.floor(entry.cursor/entry.samples),i=index%entry.actions[0].length,j=Math.floor(index/entry.actions[0].length);
  if(!options.npcWeights&&entry.terminalPairs[i][j]){entry.matrix[i][j]=entry.terminalValues[i][j];entry.cursor+=entry.samples;continue;}
  const {b,weight,end}=probeTurn(state,observed,entry,entry.cursor);
  let value=end??continuationValue(b,options);
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
 entry.policy={actions:entry.actions,probabilities:continuationStrategies(entry.matrix,weights),matrix:entry.matrix,actionFlags:entry.actionFlags};
 return entry.policy;
}
export function drawContinuation(policy,draw){
 return policy.actions.map((slots,side)=>{let n=draw();for(let i=0;i<slots.length;i++){n-=policy.probabilities[side][i];if(n<0)return slots[i];}return slots.at(-1);});
}
