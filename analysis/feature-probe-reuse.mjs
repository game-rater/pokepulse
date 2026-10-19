// Conservative native-probe dependency projections. No scoring or execution.
import {observationKey} from './observation-key.mjs';
const reusableDefinitions=new WeakMap();
function reusableDefinition(move){
 if(reusableDefinitions.has(move))return reusableDefinitions.get(move);
 const hasFunction=x=>x&&typeof x==='object'&&Object.values(x).some(v=>typeof v==='function'||hasFunction(v));
 const eligible=!(hasFunction(move)||move.multihit||move.recoil||move.mindBlownRecoil||move.hasCrashDamage||move.drain||move.self||move.selfdestruct||move.damage||move.volatileStatus||move.sideCondition||move.slotCondition||move.weather||move.terrain||move.pseudoWeather||move.category==='Status'&&!move.heal&&!move.boosts&&!move.status);
 reusableDefinitions.set(move,eligible);return eligible;
}
export function reusableProbeContext(state){
 const s=state.saved;
 if(s.field.weather||s.field.terrain||Object.keys(s.field.pseudoWeather||{}).length||s.sides.some(side=>side.pokemon.length!==1||Object.keys(side.sideConditions||{}).length||side.slotConditions.some(c=>Object.keys(c).length)||side.pokemon.some(p=>p.hp<=0||p.ability||p.item||Object.keys(p.volatiles).length||p.transformed)))return null;
 const keys=new Map();
 return (side,choice,move)=>{
 // Declarative single-hit attacks, boosts, statuses and recovery have no
 // additional HP readers here. Future Struggle already probes at full HP and
 // its recoil is max-HP based. Cache native results, never a new damage formula.
 const futureStruggle=choice.future&&move.id==='struggle';
 if(!futureStruggle&&!reusableDefinition(move))return null;
 const projection=move.heal?side:'attack';
 if(!keys.has(projection)){
 const saved={...s,lastMove:null,sides:s.sides.map((s,i)=>({...s,lastMove:null,lastEnemyMove:null,pokemon:s.pokemon.map(p=>({...p,hp:move.heal&&i===side?Math.min(p.hp,Math.max(1,Math.floor(p.maxhp/4))):p.maxhp,
  moveSlots:[],lastMove:null,lastMoveUsed:null,activeTurns:2,activeMoveActions:1,set:{...p.set,moves:[]}}))}))};
 keys.set(projection,observationKey({...state,saved}));
 }
 return keys.get(projection)+'|damage|'+side+'|'+move.id;
 };
}
