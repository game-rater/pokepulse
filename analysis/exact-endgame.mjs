// Exact, bounded kernel for a known-order fixed-retaliation endgame. Native
// damage probes preserve Run & Bun rounding and exact live stats. No fixture
// IDs, benchmark targets, heuristic evaluations or sampling are used here.
import {restoreCompleteBattle,nativeMoveChoices} from './native-battle.mjs';
const inert=new Set(['','synchronize','innerfocus','naturalcure','runaway']);
const empty=x=>!x||Object.keys(x).length===0;
export function solveNativeEndgame(state,options={}){
 if(options.exactEndgames===false||options.shouldStop?.()||state?.kind!=='decision'||state.unknownNature?.some(Boolean))return null;
 const saved=state.saved?.sides?.map(s=>s.pokemon?.[0]);
 if(!saved||saved.length!==2||saved.some(p=>!p||p.status||p.item||!inert.has(p.ability)||!empty(p.volatiles)))return null;
 if(saved[1].moveSlots?.length!==1||saved[1].moveSlots[0].id!=='seismictoss'||saved[0].moveSlots?.some(m=>!['seismictoss','focusblast'].includes(m.id)))return null;
 const start=performance.now(),deadline=Math.min(options.deadline??Infinity,start+(options.exactEndgameMs??50));
 const stop=()=>options.shouldStop?.()||performance.now()>deadline;
 const b=restoreCompleteBattle(state),[p,q]=b.sides.map(s=>s.active[0]);
 if(b.format.id!=='runbun'||b.field.weather||b.field.terrain||!empty(b.field.pseudoWeather))return null;
 if([p,q].some(m=>!m||m.hp<=0||m.item||m.status||!inert.has(m.ability)||!empty(m.volatiles)||m.transformed||m.terastallized||m.set.critical||Object.values(m.boosts).some(Boolean)))return null;
 if(b.sides.some(s=>s.pokemon.length!==1||!empty(s.sideConditions)||s.slotConditions?.some(c=>!empty(c))))return null;
 const theirs=nativeMoveChoices(q),ours=nativeMoveChoices(p);
 if(theirs.length!==1||theirs[0].id!=='seismictoss'||!ours.length||ours.some(m=>!['seismictoss','focusblast'].includes(m.id)))return null;
 if(p.getActionSpeed()<=q.getActionSpeed()||!p.runImmunity('Fighting')||!q.runImmunity('Fighting'))return null;
 const turns=Math.ceil(p.hp/q.level);
 if(turns>3||q.moveSlots[theirs[0].slot-1].pp<turns||ours.some(m=>p.moveSlots[m.slot-1].pp<turns))return null;
 const outcomes=[],hasFixed=ours.some(m=>m.id==='seismictoss');
 let probes=0;
 for(const choice of ours){
  if(choice.id==='seismictoss'){outcomes.push([{damage:p.level,probability:1}]);continue;}
  const definition=b.dex.moves.get(choice.id);
  if(definition.accuracy!==80||definition.critRatio!==1||definition.priority!==0)return null;
  const damage=[];
  for(const critical of [false,true])for(let roll=0;roll<16;roll++){
   if(stop())return null;
   // Only random damage remains: crit is explicit and all other modifiers are
   // constant in this guarded domain. Probe a private native battle clone.
   b.prng.random=(from,to)=>{if(from===16&&to===undefined)return roll;throw Error('Unexpected endgame damage randomness');};
   const move=b.dex.getActiveMove(choice.id);move.willCrit=critical;
   const value=b.actions.getDamage(p,q,move,true);probes++;
   if(!Number.isInteger(value)||value<=0)return null;
   damage.push({damage:value,probability:0.8*(critical?1/16:15/16)/16,critical});
  }
  // Focus Blast can lower SpD. If a hit is nonterminal, a certain fixed-damage
  // finish must be available. That dominates any benefit of the stat drop;
  // otherwise this kernel cannot discard the changed defensive stage.
  const min=Math.min(...damage.map(d=>d.damage));
  if(min<q.hp&&(!hasFixed||min+p.level<q.hp))return null;
  outcomes.push([{damage:0,probability:0.2},...damage]);
 }
 let branches=0,merged=0;const memo=new Map();
 const solve=(hp,target)=>{
  if(target<=0)return 1;if(hp<=0)return 0;if(stop())throw TIMEOUT;
  const key=hp+':'+target;if(memo.has(key))return memo.get(key).value;
  if(memo.size>256)throw TIMEOUT;
  const values=outcomes.map(distribution=>{
   const groups=new Map();
   for(const o of distribution){
    let next=Math.max(0,target-o.damage);
    // A surviving faster player can certainly finish any HP in this band
    // with Seismic Toss. All such successors have the same proved value 1.
    if(hasFixed&&hp>q.level&&next<=p.level)next=0;
    if(groups.has(next))merged++;groups.set(next,(groups.get(next)||0)+o.probability);
   }
   let value=0;for(const [target,probability] of groups){branches++;value+=probability*solve(hp-q.level,target);}return value;
  });
  const value=Math.max(...values);memo.set(key,{value,values});return value;
 };
 let value;try{value=solve(p.hp,q.hp);}catch(e){if(e===TIMEOUT)return null;throw e;}
 value=Math.max(0,Math.min(1,value));
 return {value,action_values:memo.get(p.hp+':'+q.hp).values,actions:ours.map(m=>m.slot),states:memo.size,branches,merged,damage_probes:probes,elapsed_ms:performance.now()-start};
}
const TIMEOUT=Symbol('exact endgame budget exhausted');
// This filter only avoids preparing obviously unsupported native inputs.
function mayApply(snapshot){
 const [p,q]=[snapshot.player,snapshot.opponent];
 if(p.build.item||q.build.item||p.build.status||q.build.status||p.build.critical||q.build.critical)return false;
 if(q.build.moves.length!==1||q.build.moves[0]!=='Seismic Toss'||!p.build.moves.length||p.build.moves.some(m=>!['Seismic Toss','Focus Blast'].includes(m)))return false;
 return ![p,q].some(s=>!inert.has((s.build.ability||'').toLowerCase().replace(/[^a-z]/g,''))||s.effects?.unknown_effects?.length);
}
export const fixedRetaliationProof={
 id:'fixed-retaliation-v1',algorithm:'exact-native-fixed-retaliation-endgame',
 opponentModel:'optimized player; opponent has one legal fixed-damage move',
 enabled:options=>options.exactEndgames!==false,mayApply,solve:solveNativeEndgame,
};
