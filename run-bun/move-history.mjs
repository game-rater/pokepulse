// Infer entry-turn eligibility only from observed decision states. An app
// attached halfway through a battle does not invent the previous move history.
export function annotateEntryTurns(snapshot,history){
  if(snapshot.battle_phase?.kind!=='selection')return;
  const turn=snapshot.battle_phase.turn;
  for(const side of ['player','opponent']){
    const mon=snapshot[side],identity=mon.effects.personality??JSON.stringify([mon.species,mon.build.level,mon.build.ivs]),old=history[side];
    let first;
    if(turn===0||old&&old.identity!==identity)first=true;
    else if(old&&turn!==old.turn)first=false;
    else first=old?.first;
    if(first!==undefined&&mon.effects.first_turn===undefined)mon.effects.first_turn=first;
    history[side]={identity,turn,first};
  }
}
