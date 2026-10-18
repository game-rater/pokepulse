// Run & Bun inherits Gen 8 status rules unless changed in the creator's document:
// https://drive.google.com/file/d/1NMIafT_5Gl2ebmuP3AnCwAMpW0YItysH/view
// Action prevention: https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts
// Damage/stat modifiers remain the calculator's responsibility.
const thawingMoves=new Set(['Burn Up','Flame Wheel','Flare Blitz','Fusion Flare','Pyro Ball','Sacred Fire','Scald','Scorching Sands','Steam Eruption']);
export function actionOpportunity(side,pokemon,move){
 const status=pokemon.status,comatose=pokemon.hasAbility('Comatose');
 let chance=1;const notes=[];
 if(status==='slp'){
  const counter=side.effects.sleep_counter;
  const wakes=Number.isInteger(counter)&&counter<=(pokemon.hasAbility('Early Bird')?2:1);
  if(move.name==='Snore')return wakes?{chance:0,note:'Wakes before acting; Snore requires sleep.'}:{chance:1,note:'Snore can be used while asleep.'};
  if(!wakes)return {chance:0,note:counter===undefined?'Asleep; wake-up timer unavailable.':'Asleep for the next action.'};
  notes.push('Wakes before the next action.');
 }
 if(move.name==='Snore'&&!comatose&&status!=='slp')return {chance:0,note:'Snore requires sleep.'};
 if(status==='frz'){
  if(thawingMoves.has(move.name)&&(move.name!=='Burn Up'||pokemon.hasType('Fire')))notes.push('This move thaws its user before attacking.');
  else {chance*=0.2;notes.push('Frozen; 20% chance to thaw before acting.');}
 }
 if(status==='par'){chance*=0.75;notes.push('Paralyzed; 25% chance to miss the action.');}
 if(side.effects.confusion_turns){chance*=2/3;notes.push('Confused; 1/3 chance to hurt itself instead.');}
 return {chance,note:notes.join(' ')||null};
}
