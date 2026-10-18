import calculator from '../vendor/run-bun/index.js';
import {generateMoveDist} from '../vendor/npc-ai/predictor.mjs';
import {completeMoveDex,MissingInput,nativeMoveChoices} from '../analysis/native-battle.mjs';

const gen=calculator.Generations.get(8);
const names={raindance:'Rain',sunnyday:'Sun',sandstorm:'Sand',hail:'Hail',snow:'Hail',electricterrain:'Electric',grassyterrain:'Grassy',mistyterrain:'Misty',psychicterrain:'Psychic'};
const name=(kind,id)=>completeMoveDex[kind].get(id).name;
function mon(p){
 const result=new calculator.Pokemon(gen,p.species.name,{level:p.level,ability:name('abilities',p.ability),item:p.item?name('items',p.item):'',status:p.status,boosts:{...p.boosts},gender:p.gender});
 result.rawStats={hp:p.maxhp,...p.storedStats};result.stats={...result.rawStats};result.originalCurHP=p.hp;result.types=p.getTypes();result.skipEntryEffects=true;
 result.abilityOn=!!(p.volatiles.flashfire||p.volatiles.unburden);
 result.toxicCounter=Math.max(1,(p.statusState.stage||0)+1);
 const copy=result.clone.bind(result);result.clone=()=>{const clone=copy();clone.rawStats={...result.rawStats};clone.stats={...result.stats};clone.types=[...result.types];clone.skipEntryEffects=true;return clone;};
 return result;
}
function fieldSide(p){const s=p.side.sideConditions;return {isReflect:!!s.reflect,isLightScreen:!!s.lightscreen,isAuroraVeil:!!s.auroraveil,isTailwind:!!s.tailwind,spikes:s.spikes?.layers||0,tspikes:s.toxicspikes?.layers||0,isSR:!!s.stealthrock,isSeeded:!!p.volatiles.leechseed};}
function moves(p){const legal=nativeMoveChoices(p);return legal.length?legal:[{id:'struggle',slot:1}];}
function rolls(d){return typeof d==='number'?[d]:Array.isArray(d[0])?d[0].map((v,i)=>v+(d[1]?.[i]||0)):d;}

// The predictor enumerates randomized score bonuses and uniformly splits ties.
// The policy is recalculated from each simulated state, before either move.
export function npcMoveDistribution(battle,{playerRemaining,opponentRemaining}={}){
 const ps=battle.sides.map(s=>s.active[0]),legal=ps.map(moves);
 if(legal[1].length===1)return [{slot:legal[1][0].slot,move:name('moves',legal[1][0].id),probability:1}];
 // Upstream's generic status bonus includes no-effect moves. Exclude these
 // singles-only failures when the NPC has a meaningful alternative.
 const useful=legal[1].filter(m=>!['splash','celebrate','holdhands','happyhour','helpinghand','afteryou','quash'].includes(m.id));
 if(useful.length)legal[1]=useful;
 const sensitive=legal[1].some(m=>['explosion','selfdestruct','finalgambit','memento','healingwish','lunardance','perishsong','batonpass'].includes(m.id));
 if(sensitive&&(playerRemaining==null||opponentRemaining==null))throw new MissingInput('NPC AI needs remaining team counts for this move.');
 const mons=ps.map(mon),field=new calculator.Field({weather:names[battle.field.weather],terrain:names[battle.field.terrain],isGravity:!!battle.field.pseudoWeather.gravity,isTrickRoom:!!battle.field.pseudoWeather.trickroom,attackerSide:fieldSide(ps[0]),defenderSide:fieldSide(ps[1])});
 mons.forEach((p,i)=>{p.moves=legal[i].map(m=>new calculator.Move(gen,name('moves',m.id),{ability:p.ability,item:p.item,overrides:!gen.moves.get(m.id)?completeMoveDex.moves.get(m.id):undefined}));});
 const results=mons.map((p,i)=>p.moves.map(move=>{const f=field.clone();if(i)f.swap();const result=calculator.calculate(gen,p,mons[1-i],move,f);result.damage=rolls(result.damage);result.damageRolls=()=>result.damage;return result;}));
 const a=ps[1],p=ps[0],last=a.lastMove?.id,protectCount=a.volatiles.stall?.counter||1;
 const protectEffects=['curse','attract','perishsong','leechseed','yawn'];
 const aiOptions={firstTurnOutAiOpt:a.activeTurns<=1,playerFirstTurnOutAiOpt:p.activeTurns<=1||!!p.volatiles.encore,suckerPunchAiOpt:last==='suckerpunch',lastMonAiOpt:opponentRemaining===1,playerLastMonAiOpt:playerRemaining===1,playerCharmedOrConfusedAiOpt:!!p.volatiles.confusion||(p.boosts.atk||0)<0,tauntAiOpt:!!p.volatiles.taunt,imprisonAiOpt:!!a.volatiles.imprison,encoreAiOpt:!!p.lastMove&&completeMoveDex.moves.get(p.lastMove.id).category==='Status',magnetRiseAiOpt:!!a.volatiles.magnetrise,playerMagnetRisenAiOpt:!!p.volatiles.magnetrise,protectIncentiveAiOpt:protectEffects.some(id=>!!p.volatiles[id]),protectDisincentiveAiOpt:protectEffects.some(id=>!!a.volatiles[id]),protectLastAiOpt:protectCount>1,protectLastTwoAiOpt:protectCount>3,enableDebugLogging:false};
 const speed=ps[0].speed===ps[1].speed?'tie':(ps[0].speed>ps[1].speed)!==!!field.isTrickRoom?'0':'1';
 aiOptions.playerGroundedAiOpt=!!p.isGrounded();
 let probabilities=generateMoveDist(results,speed,aiOptions);
 const total=probabilities.reduce((s,v)=>s+v,0);
 if(!Number.isFinite(total)||total<=0||probabilities.some(v=>!Number.isFinite(v)||v<0))throw new MissingInput('NPC move scoring returned no valid probability distribution.');
 return legal[1].map((m,i)=>({slot:m.slot,move:name('moves',m.id),probability:probabilities[i]/total}));
}
export function weightedNpcBounds(low,high,probabilities){
 if(probabilities.length!==low[0].length||Math.abs(probabilities.reduce((s,p)=>s+p,0)-1)>1e-8)throw Error('Invalid NPC policy weights');
 const expected=matrix=>matrix.map(row=>row.reduce((s,v,i)=>s+v*probabilities[i],0));
 const lowerRows=expected(low),upperRows=expected(high);
 return {lower:Math.max(...lowerRows),upper:Math.max(...upperRows),lowerRows,upperRows};
}
