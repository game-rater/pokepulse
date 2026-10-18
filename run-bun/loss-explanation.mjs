// Explain observed outcomes. No controller input, NPC policy, or counterfactual
// claim is inferred from a probability drop. Native message evidence is retained.
export function describeBattleEvent(e){
 const who=e.actor==='player'?`Your ${e.actor_species}`:`Opponent’s ${e.actor_species}`;
 const target=e.target==='player'?`your ${e.target_species}`:`opponent’s ${e.target_species}`;
 const texts={
  'move-used':`${who} used ${e.move}.`,
  'critical-hit':`${who} landed a critical hit with ${e.move} on ${target}.`,
  miss:`${who}’s ${e.move} missed.`,avoided:`${who}’s ${e.move} was avoided.`,
  paralyzed:`${who} could not move because of paralysis.`,flinched:`${who} flinched and could not act.`,
  'confusion-self-hit':`${who} hurt itself in confusion.`,asleep:`${who} was asleep and could not act.`,
  frozen:`${who} was frozen and could not act.`,
  'poison-damage':`${who} was hurt by poison.`, 'burn-damage':`${who} was hurt by its burn.`,
  protected:`${who} protected itself.`, 'woke-up':`${who} woke up.`,
  endured:`${who} endured the hit.`, 'survived-item':`${who} survived a hit using its item.`,
  'capture-gap':'Some battle messages were missed because the event buffer filled.',
 };
 return texts[e.kind]||'A battle event was recorded.';
}
export function outcomeEvidence(messages){
 return messages.map(e=>({...e,hidden:['other-message','hp-change'].includes(e.kind),text:describeBattleEvent(e),unfavorable:
  e.kind==='critical-hit'?e.actor==='opponent':e.actor==='player'&&['miss','avoided','paralyzed','flinched','confusion-self-hit','asleep','frozen','poison-damage','burn-damage'].includes(e.kind)}));
}
export function explainKnockout(before,after,events,{complete,consecutive}={}){
 if(!complete||after?.player?.current_hp!==0||before.player.current_hp<=0)return null;
 const name=before.player.species,final=events.filter(e=>e.player_hp===0),critical=final.findLast(e=>e.kind==='critical-hit'&&e.actor==='opponent'&&e.target==='player');
 let cause;
 if(consecutive&&critical)cause=`Opponent’s ${critical.move} critically hit and knocked out your ${name}.`;
 else if(consecutive&&final.some(e=>e.actor==='player'&&e.kind==='confusion-self-hit'))cause=`Your ${name} fainted after hurting itself in confusion.`;
 else if(consecutive){
  const index=events.findLastIndex(e=>e.kind==='hp-change'&&e.actor==='player'&&e.after_hp===0);
  const damage=events[index];
  // Only a contiguous native operation can attribute ordinary damage. Unknown
  // messages and journal gaps are barriers, rather than silently skipped clues.
  const operation=index>0?events.slice(0,index).findLast(e=>e.kind!=='hp-change'):null;
  const same=damage&&operation&&damage.turn===operation.turn&&damage.phase!==null&&damage.phase===operation.phase&&Number.isInteger(damage.action_index)&&damage.action_index===operation.action_index;
  if(same&&operation.kind==='move-used'&&operation.actor==='opponent'&&operation.target==='player'&&damage.phase===0x0803e371)cause=`Opponent’s ${operation.move} knocked out your ${name}.`;
  else if(same&&operation.actor==='player'&&operation.kind==='confusion-self-hit')cause=`Your ${name} fainted after hurting itself in confusion.`;
  else if(same&&operation.actor==='player'&&['poison-damage','burn-damage'].includes(operation.kind))cause=`Your ${name} fainted from ${operation.kind==='poison-damage'?'poison':'burn'} damage.`;
 }
 cause??=`Your ${name} reached 0 HP during this recorded sequence. The exact final damage source was not captured.`;
 return {scope:'active-pokemon',headline:`Your ${name} fainted.`,cause,
  unfavorable_events:events.filter(e=>e.unfavorable).map(e=>e.text),
  evidence:'Observed battle messages and HP. This does not prove that a different roll or move would have won, and an active Pokémon fainting does not establish a full-team loss.'};
}
