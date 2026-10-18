import {createHash} from 'node:crypto';
function moveId(move){return move?.id||move?.move||null;}
function canonical(value,turn=0){
 if(Array.isArray(value))return value.map(v=>canonical(v,turn));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.keys(value).sort().filter(k=>k!=='effectOrder').map(k=>[k,
  ['startingTurn','endingTurn','lastTurn'].includes(k)&&typeof value[k]==='number'?value[k]-turn:canonical(value[k],turn)]));
}
// Native log/request/random-generator history is not an observed mechanic.
// Persistent counters and histories are retained, including extra histories
// when a move or item can read them. Missing histories then prevent a match.
export function observationKey(state){
 const s=state.saved,ids=s.sides.flatMap(side=>side.pokemon[0].moveSlots.map(m=>m.id));
 const selected=['m','species','speciesState','baseSpecies','gender','hp','maxhp','baseMaxhp','storedStats','baseStoredStats','boosts',
  'ability','baseAbility','abilityState','item','itemState','lastItem','ateBerry','itemKnockedOff',
  'types','baseTypes','addedType','transformed','weighthg','hpType','hpPower','baseHpType','baseHpPower','status','statusState','volatiles',
  'truantTurn'];
 const pokemon=p=>{
  const out=Object.fromEntries(selected.map(k=>[k,p[k]]));
  const {item,status,boosts,...build}=p.set;out.build=build;
  out.moves=p.moveSlots.map(({id,pp,maxpp,used})=>({id,pp,maxpp,used}));
  out.firstTurn=p.activeTurns<=1;out.lastMove=moveId(p.lastMove);
  if(ids.some(id=>['fakeout','firstimpression','matblock'].includes(id)))out.activeMoveActions=p.activeMoveActions>0;
  if(ids.includes('conversion2'))out.lastMoveUsed=moveId(p.lastMoveUsed);
  if(ids.includes('ragefist'))out.timesAttacked=p.timesAttacked;
  if(ids.some(id=>['counter','mirrorcoat','metalburst','comeuppance'].includes(id)))out.attackedBy=p.attackedBy;
  if(ids.includes('stompingtantrum')||p.item==='metronome')out.previousMoveFailed=p.moveLastTurnResult===false;
  return out;
 };
 const key={format:s.formatData.id,field:s.field,lastMove:moveId(s.lastMove),ended:s.ended,winner:s.winner,
  sides:s.sides.map(side=>({pokemon:side.pokemon.map(pokemon),conditions:side.sideConditions,slots:side.slotConditions,
   faintedLastTurn:side.faintedLastTurn,faintedThisTurn:side.faintedThisTurn,totalFainted:side.totalFainted,lastMove:moveId(side.lastMove),lastEnemyMove:moveId(side.lastEnemyMove)})),
  nature:state.unknownNature||[false,false],first:state.unknownFirst||[false,false],
  history:state.unknownHistory||[false,false],gender:state.unknownGender||[false,false]};
 return createHash('sha256').update(JSON.stringify(canonical(key,s.turn))).digest('hex');
}

