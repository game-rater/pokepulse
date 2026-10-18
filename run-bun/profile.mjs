import calculator from '../vendor/run-bun/index.js';
import util from '../vendor/run-bun/mechanics/util.js';
import {analyzeBattle} from '../analysis/threat.mjs';
import {defaultBuild as standardBuild,defaultField, catalog as standardCatalog} from '../battle-engine.mjs';
import {normalizeSnapshot} from './input.mjs';
import {snapshotInput} from './battle-state.mjs';
import {actionOpportunity} from './actions.mjs';
import {hitChance} from './accuracy.mjs';
import {completeMoveDex,genderFromIdentity} from '../analysis/native-battle.mjs';
import {readFileSync} from 'node:fs';
const romMoves=JSON.parse(readFileSync(new URL('./reference/mappings.json',import.meta.url))).move.filter(Boolean);
export {defaultField};
export const generation=8;
const gen=calculator.Generations.get(generation);
export const pack={name:'Run & Bun community calculator data (version compatibility unverified)',species:[...gen.species].map(p=>({id:p.id,name:p.name,types:p.types,base_stats:p.baseStats,abilities:Object.values(p.abilities||{}),...(p.weightkg>0?{weightkg:p.weightkg}:{}),form:'Base'}))};
export function catalog(){return {...standardCatalog(8),moves:romMoves.map(name=>{const m=gen.moves.get(calculator.toID(name))||completeMoveDex.moves.get(name);return {id:m.id,name,type:m.type,category:m.category,power:m.basePower,priority:m.priority||0};}),abilities:[...gen.abilities].map(a=>a.name),items:[...gen.items].map(i=>i.name)};}
export function defaultBuild(species){const build=standardBuild(species,8);build.boosts.accuracy??=0;build.boosts.evasion??=0;build.moves=build.moves.filter(m=>gen.moves.get(calculator.toID(m)));if(!build.moves.length)build.moves=['Tackle'];return build;}
export function scoreBattle(player,opponent,rules,battle,builds,field,effects={player:{},opponent:{}},live={},searchOptions={}){
  if(rules.generation!==8)throw Error('The Run & Bun version uses its own Generation 8 calculator.');
  const normalized=normalizeSnapshot(snapshotInput([player,opponent,rules,battle,builds,field,effects,live]),pack,catalog());
  const side=(species,build,hp,conditions,exact)=>{const p=new calculator.Pokemon(gen,species.name,build),gender=genderFromIdentity(species.name,conditions.personality,build.gender);return {species:species.name,build:{...build,...(gender?{gender}:{})},current_hp:hp===0?0:Math.max(1,Math.round(p.maxHP()*hp/100)),effects:conditions,...exact};};
  const convert=s=>({isReflect:s.reflect,isLightScreen:s.light_screen,isTailwind:s.tailwind});
  const result=analyzeBattle({generation:8,player:side(player,builds.player,battle.player_hp,effects.player,live.player),opponent:side(opponent,builds.opponent,battle.opponent_hp,effects.opponent,live.opponent),field:{weather:field.weather||undefined,terrain:field.terrain||undefined,isTrickRoom:field.trick_room,isGravity:!!(effects.player.native_field_conditions?.gravity||effects.opponent.native_field_conditions?.gravity),attackerSide:convert(field.player),defenderSide:convert(field.opponent)}},calculator,util.getFinalSpeed,actionOpportunity,hitChance,{criticalRates:[1/16,1/8,1/2,1],...searchOptions,completeMoves:true});
  return {...result,observation_provenance:live.observation_provenance||normalized.live.observation_provenance};
}
