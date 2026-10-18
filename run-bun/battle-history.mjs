import {createCompleteBattle,restoreCompleteBattle} from '../analysis/native-battle.mjs';
import {selectContinuationChoices} from '../analysis/action-usefulness.mjs';
import {outcomeEvidence,explainKnockout} from './loss-explanation.mjs';
const id=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const actors=s=>JSON.stringify(['player','opponent'].map(k=>[s[k]?.species,s[k]?.effects?.personality??null]));
const turn=s=>Number.isInteger(s.battle_phase?.turn)?s.battle_phase.turn:null;
const ended=s=>['player','opponent'].some(k=>s[k]?.current_hp===0);
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const explanations={
 'stat-limit':'The affected stats were already at their limit; this move could not change them.',
 'heal-before-damage-at-full-hp':'HP was full and this heal would act before every opponent option, so it could not restore HP.',
 'first-turn-expired':'This move only works on the first turn after entering; that opportunity had already passed.',
 'no-singles-effect':'This move has no useful direct effect in this singles battle.',
 'target-already-statused':'The target already had a status condition when this move would act.',
 'status-type-immunity':'The target’s type prevents this status condition.',
 'status-ability-immunity':'The target’s ability prevents this status condition.',
};
function spent(before,after){
 if(!before?.pp||!after?.pp)return [];
 return Object.entries(before.pp).filter(([m,n])=>finite(n)&&finite(after.pp[m])&&after.pp[m]<n)
  .map(([move,n])=>({move,pp_spent:n-after.pp[move],evidence:'pp-change',matches_last_move:id(after.effects?.last_move)===id(move)}));
}
function changes(before,after){
 const rows=[];
 for(const side of ['player','opponent']){
  const p=before[side],q=after[side];if(!p||!q)continue;
  const add=(kind,label,a,b)=>{if(a!==b)rows.push({side,kind,label,before:a??null,after:b??null});};
  add('hp','HP',p.current_hp,q.current_hp);add('status','Status',p.build?.status||'Healthy',q.build?.status||'Healthy');
  add('item','Held item',p.build?.item||'None',q.build?.item||'None');
  add('ability','Ability',p.build?.ability||'Unknown',q.build?.ability||'Unknown');
  for(const stat of ['atk','def','spa','spd','spe','accuracy','evasion'])add('boost',stat,p.build?.boosts?.[stat]||0,q.build?.boosts?.[stat]||0);
 }
 return rows;
}
function nativeFlags(snapshot,move){
 for(const side of [snapshot.player,snapshot.opponent]){
  if(!side.actual_stats||['hp','atk','def','spa','spd','spe'].some(k=>!finite(side.actual_stats[k])||side.actual_stats[k]<=0)||side.effects?.unknown_effects?.length)
   throw Error('Incomplete mechanics observation');
 }
 const b=restoreCompleteBattle(createCompleteBattle(snapshot)),selected=selectContinuationChoices(b.p1.active[0]);
 const slot=snapshot.player.build.moves.findIndex(m=>id(m)===id(move))+1;
 const flag=selected.flags.find(f=>f.slot===slot);
 return {reasons:flag?.reasons||[],filtered:selected.filtered.includes(slot),waiting:selected.waiting,
  alternatives:selected.choices.filter(c=>c.slot!==slot).map(c=>snapshot.player.build.moves[c.slot-1]).filter(Boolean)};
}
export class BattleHistory {
 constructor({classify=nativeFlags}={}){this.classify=classify;this.cache=new Map();}
 review(events,{limit=50,windowSeconds=600}={}){
  const groups=[];let current=null,battle=1,model='minimax';
  const estimates=new Map();
  for(const e of events){
   if(e.kind==='battle-message'){
    const matches=g=>e.message?.actor&&id(e.message.actor_species)===id(g.before.snapshot[e.message.actor]?.species)&&id(e.message.target_species)===id(g.before.snapshot[e.message.target]?.species);
    const group=e.message?.kind==='capture-gap'?(current||groups.at(-1)):groups.findLast(g=>(g.battle===battle||!current&&g===groups.at(-1)&&g.complete)&&g.turn===e.message?.turn&&matches(g));
    if(group&&!group.gap&&!group.messagesClosed&&e.message){
     group.messages.push(e.message);group.execution??=e.id;
    }
    continue;
   }
   if(e.kind==='optimizer'){model=e.opponent_model;if(current&&!current.execution)current.model=model;continue;}
   if(e.kind==='tracking'&&e.tracking?.status!=='battle'){
    if(groups.length)groups.at(-1).messagesClosed=true;
    if(current){current.gap=true;current=null;battle++;}continue;
   }
   if(e.kind==='estimate'){
    const score=e.estimate?.display_score;
    if(finite(score)&&!e.estimate.pending&&!e.estimate.outlook?.input_blocked){
     const values=estimates.get(e.state_id)||[];values.push({score,event:e.id,model});estimates.set(e.state_id,values);
    }
    continue;
   }
   if(e.kind!=='battle-state'||!e.snapshot?.player?.build||!e.snapshot?.opponent?.build)continue;
   const s=e.snapshot,selection=s.battle_phase?.kind==='selection';
   if(selection){
    if(ended(s)){if(current){current.after=e;current.complete=true;current=null;battle++;}continue;}
    if(current&&current.turn===turn(s)&&current.actors===actors(s)&&!current.execution){current.before=e;continue;}
    const previous=current;if(previous){previous.after=e;previous.complete=true;}
    current={before:e,turn:turn(s),actors:actors(s),battle,model,execution:null,after:null,complete:false,messages:[]};groups.push(current);
    if(previous)previous.next=current;
   }else if(current){
    current.execution??=e.id;current.after=e;
    if(ended(s)){current.complete=true;current=null;battle++;}
   }
  }
  const entries=groups.slice(-Math.min(100,Math.max(1,limit))).map(g=>{
   const a=g.before,b=g.next?.before||g.after,p=a.snapshot,q=b?.snapshot,same=q&&actors(q)===g.actors;
   const distance=q&&g.turn!==null&&turn(q)!==null?(turn(q)-g.turn+256)%256:null;
   const adjacent=same&&g.complete&&(ended(q)&&[0,1].includes(distance)||distance===1);
   const battleEvents=outcomeEvidence(g.messages);
   const observedMoves=side=>g.messages.filter(m=>m.kind==='move-used'&&m.actor===side).map(m=>({move:m.move,evidence:'native-game-message',matches_last_move:true}));
   const playerMoves=observedMoves('player').length?observedMoves('player'):same?spent(p.player,q.player):[];
   const opponentMoves=observedMoves('opponent').length?observedMoves('opponent'):same?spent(p.opponent,q.opponent):[];
   const observationChanges=same?changes(p,q):q?['player','opponent'].filter(k=>p[k]?.species!==q[k]?.species)
    .map(side=>({side,kind:'species',label:'Active Pokémon',before:p[side]?.species,after:q[side]?.species})):[];
   const notes=[];let assessment='observed',review=null;
   if(!g.complete){assessment='in-progress';notes.push(g.gap?'Tracking stopped before the next decision was observed.':'Waiting for the next decision or battle result.');}
   else if(!same){assessment='matchup-changed';notes.push('A Pokémon changed; moves and outcomes are not attributed across the change.');}
   else if(!adjacent){assessment='incomplete';notes.push('The observations do not establish one consecutive turn; action attribution is incomplete.');}
   else if(playerMoves.length===1){
    const move=playerMoves[0],key=a.state_id+'|'+move.move;
    if(!this.cache.has(key)){
     let flags;try{flags=this.classify(p,move.move);}catch{flags={reasons:[],filtered:false,waiting:false,unavailable:true};}
     this.cache.set(key,flags);while(this.cache.size>200)this.cache.delete(this.cache.keys().next().value);
    }
    const flags=this.cache.get(key);
    const ppAmbiguous=move.pp_spent>2||p.opponent.build.moves.some(m=>['spite','eeriespell','grudge'].includes(id(m)))||p.player.effects?.native_volatiles?.grudge;
    if(flags.unavailable)notes.push('Move mechanics could not be assessed from this capture.');
    else if(ppAmbiguous)notes.push('PP loss may include a PP-draining effect; a chosen move is not established.');
    else if(flags.filtered&&move.matches_last_move){
     assessment='review-decision';review={move:move.move,reasons:flags.reasons.map(r=>explanations[r]||r),alternatives:flags.alternatives||[],evidence:move.evidence==='native-game-message'?'The game reported this move being used.':'PP decreased and the recorded previous move matches. This is inferred, not an input recording.'};
    }else if(flags.reasons.length&&flags.waiting)notes.push('This move has no direct effect here, but waiting could be useful; it is not marked as a mistake.');
    else if(flags.filtered)notes.push('PP decreased on a potentially ineffective move, but the previous-move record does not confirm its use.');
   }
   if(playerMoves.length>1)notes.push('Several moves lost PP; this may include PP-draining effects or missed observations.');
   const cutoff=g.execution??g.after?.id??Infinity;
   const pre=estimates.get(a.state_id)?.filter(e=>e.model===g.model&&e.event<cutoff).at(-1);
   const postCutoff=g.next?.execution??g.next?.after?.id??Infinity;
   const post=b&&estimates.get(b.state_id)?.filter(e=>e.model===g.model&&e.event<postCutoff).at(-1);
   // Never compare a late old-state refinement with an outcome, or compare
   // different optimizer models. A missing estimate is an honest gap.
   const beforeScore=pre?.score??null,afterScore=g.complete?post?.score??null:null;
   if(beforeScore!==null&&afterScore!==null&&beforeScore-afterScore>=10&&!review)notes.push('The estimate fell, but these observations do not establish a worse choice. Outcomes and search refinement can also change it.');
   const knockout=same?explainKnockout(p,q,battleEvents,{complete:g.complete,consecutive:adjacent}):null;
   if(knockout)knockout.earlier_unfavorable_events=groups.filter(old=>old.battle===g.battle&&old.before.id<a.id)
    .flatMap(old=>outcomeEvidence(old.messages)).filter(m=>m.unfavorable).slice(-5).map(m=>m.text);
   return {id:a.state_id,battle:g.battle,turn:g.turn,at:a.at,complete:g.complete,assessment,battle_events:battleEvents,knockout,
    player:p.player.species,opponent:p.opponent.species,player_moves:playerMoves,opponent_moves:opponentMoves,
    changes:observationChanges,before_score:beforeScore,after_score:afterScore,review,notes};
  }).reverse();
  return {schema_version:1,window_seconds:windowSeconds,total_decisions:groups.length,omitted_decisions:Math.max(0,groups.length-entries.length),entries,
   explanation:'Game messages identify captured misses, critical hits and other battle effects. PP-only move identification is inferred. A probability drop alone is not a mistake; missing events are not guessed.'};
 }
}
