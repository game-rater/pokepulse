import {calculate,Generations,Pokemon,Move,Field} from '@smogon/calc';
import {getFinalSpeed} from '@smogon/calc/dist/mechanics/util.js';
import {readFileSync} from 'node:fs';
import {scoreMatchup} from './engine.mjs';
const metadata = JSON.parse(readFileSync(new URL('./data/battle-data.json',import.meta.url)));
const id = s => s.toLowerCase().replace(/[^a-z0-9]/g,'');
export const STATS = ['hp','atk','def','spa','spd','spe'];
const STATUSES = ['','brn','par','psn','tox','slp','frz'];
const WEATHER = ['','Sun','Rain','Sand','Hail','Snow','Harsh Sunshine','Heavy Rain','Strong Winds'];
const TERRAIN = ['','Electric','Grassy','Psychic','Misty'];
export function catalog(generation = 9) {
  const gen = Generations.get(generation >= 3 && generation <= 9 ? generation : 9);
  return {moves:[...gen.moves].filter(m=> !m.isZ && !m.isMax).map(m=>({id:m.id,name:m.name,type:m.type,category:m.category || 'Physical',power:m.basePower,priority:m.priority || 0,accuracy:metadata.moves[m.id]?.accuracy ?? null})),abilities:[...gen.abilities].map(a=>a.name),items:[...gen.items].map(i=>i.name),natures:[...gen.natures].map(n=>n.name)};
}
export function defaultBuild(species,generation) {
  const gen = Generations.get(generation >= 3 && generation <= 9 ? generation : 9);
  const pool = species.moves || metadata.learnsets[species.id] || metadata.learnsets[id(species.name.split('-')[0])] || [];
  const excluded = new Set(['explosion','selfdestruct','hyperbeam','gigaimpact','solarbeam','solarblade','skullbash','skyattack','razorwind','fly','dig','dive','bounce','phantomforce','shadowforce']);
  const moves = pool.map(n=>gen.moves.get(id(n))).filter(m=>m && m.basePower > 0 && m.basePower <= 120 && m.category !== 'Status' && !m.isZ && !m.isMax && !m.multihit && !excluded.has(m.id) && (metadata.moves[m.id]?.accuracy ?? 100) >= 85);
  moves.sort((a,b)=> {
    const strength = m => m.basePower * (species.types.includes(m.type) ? 1.5 : 1) * species.base_stats[(generation < 4 ? ['Fire','Water','Grass','Electric','Ice','Psychic','Dragon','Dark'].includes(m.type) : m.category === 'Special') ? 'spa' : 'atk'];
    return strength(b) - strength(a);
  });
  const chosen = [], seen = new Set();
  for (const move of moves) if (!seen.has(move.type)) {chosen.push(move.name);seen.add(move.type);if (chosen.length === 4) break;}
  return {level:50,nature:'Serious',ability:'',item:'',status:'',evs:Object.fromEntries(STATS.map(s=>[s,0])),ivs:Object.fromEntries(STATS.map(s=>[s,31])),boosts:Object.fromEntries([...STATS.filter(s=>s!=='hp'),'accuracy','evasion'].map(s=>[s,0])),moves:chosen.length ? chosen : ['Tackle'],critical:false};
}
export function validateBuild(build,generation) {
  const gen = Generations.get(generation >= 3 && generation <= 9 ? generation : 9);
  if (!build || !Number.isInteger(build.level) || build.level < 1 || build.level > 100) throw Error('Level must be 1–100.');
  if (!gen.natures.get(id(build.nature || ''))) throw Error('Select a recognized nature.');
  for (const [key,table,max] of [['evs',build.evs,252],['ivs',build.ivs,31],['boosts',build.boosts,6]]) {
    const names=key==='boosts'?[...STATS.filter(s=>s!=='hp'),'accuracy','evasion']:STATS;
    for (const stat of names) if (!Number.isInteger(table?.[stat]) || table[stat] < (key === 'boosts' ? -6 : 0) || table[stat] > max) throw Error(`Invalid ${key} for ${stat}.`);
  }
  if (Object.values(build.evs).reduce((a,b)=>a+b,0) > 510) throw Error('Total EVs cannot exceed 510.');
  if (!STATUSES.includes(build.status) || typeof build.critical !== 'boolean') throw Error('Invalid status or critical-hit setting.');
  if (build.ability && !gen.abilities.get(id(build.ability))) throw Error('Ability is unavailable in this generation.');
  if (build.item && !gen.items.get(id(build.item))) throw Error('Item is unavailable in this generation.');
  if (!Array.isArray(build.moves) || build.moves.length < 1 || build.moves.length > 4 || build.moves.some(m=>typeof m !== 'string' || !gen.moves.get(id(m)))) throw Error('Select 1–4 moves available in this generation.');
  return build;
}
export function defaultField() {return {weather:'',terrain:'',trick_room:false,player:{reflect:false,light_screen:false,tailwind:false},opponent:{reflect:false,light_screen:false,tailwind:false}};}
export function validateField(field,generation) {
  if (!field || !WEATHER.includes(field.weather) || !TERRAIN.includes(field.terrain) || typeof field.trick_room !== 'boolean') throw Error('Invalid field conditions.');
  if (generation < 6 && field.terrain) throw Error('Terrain requires generation 6 or later.');
  if (generation < 4 && field.trick_room) throw Error('Trick Room requires generation 4 or later.');
  if (generation < 4 && (field.player?.tailwind || field.opponent?.tailwind)) throw Error('Tailwind requires generation 4 or later.');
  if (field.weather === 'Snow' && generation < 9 || ['Harsh Sunshine','Heavy Rain','Strong Winds'].includes(field.weather) && generation < 6) throw Error('This weather is unavailable in the selected generation.');
  for (const side of ['player','opponent']) for (const key of ['reflect','light_screen','tailwind']) if (typeof field[side]?.[key] !== 'boolean') throw Error('Invalid side conditions.');
  return field;
}
function makePokemon(species,build,hp,gen) {
  const native = gen.species.get(id(species.name)) || Generations.get(9).species.get(id(species.name));
  const overrides = {...native,name:species.name,types:species.types,baseStats:species.base_stats,weightkg:species.weightkg || native?.weightkg || 100,abilities:{0:''}};
  const pokemon = new Pokemon(gen,species.name,{...build,overrides});
  pokemon.originalCurHP = hp === 0 ? 0 : Math.max(1,Math.round(pokemon.maxHP() * hp / 100));
  return pokemon;
}
function calcField(field,side) {
  const convert = s=>({isReflect:s.reflect,isLightScreen:s.light_screen,isTailwind:s.tailwind});
  return new Field({gameType:'Singles',weather:field.weather || undefined,terrain:field.terrain || undefined,attackerSide:convert(field[side]),defenderSide:convert(field[side === 'player' ? 'opponent' : 'player'])});
}
function supported(rules) {
  if (rules.generation < 3 || rules.generation > 9) return 'Damage calculation currently supports generations 3–9.';
  if (rules.physical_special_split !== (rules.generation >= 4)) return 'This custom physical/special split differs from the calculator’s generation rules.';
  const gen = Generations.get(rules.generation);
  for (const a of rules.available_types) for (const b of rules.available_types) if (gen.types.get(id(a))?.effectiveness[b] !== rules.type_chart[a][b]) return 'This custom type chart differs from the calculator’s generation rules.';
  return null;
}
function movesFor(attacker,defender,build,field,gen) {
  return build.moves.map(name=> {
    const move = new Move(gen,name,{isCrit:build.critical,ability:attacker.ability,item:attacker.item});
    const result = calculate(gen,attacker.clone(),defender.clone(),move,field.clone());
    const [min,max] = result.range();
    const currentHP = defender.curHP();
    const accuracy = metadata.moves[id(name)]?.accuracy ?? null;
    return {name,type:result.move.type,category:result.move.category,priority:result.move.priority || 0,accuracy,min,max,min_percent:100 * min / defender.maxHP(),max_percent:100 * max / defender.maxHP(),pressure:currentHP > 0 ? (min + max) / 2 / currentHP : 0,guaranteed_ko_on_hit:currentHP > 0 && min >= currentHP,possible_ko_on_hit:currentHP > 0 && max >= currentHP,status_move:result.move.category === 'Status',speed:getFinalSpeed(gen,result.attacker,result.field,result.field.attackerSide),note:result.move.category === 'Status' ? 'Status effect is not simulated.' : null};
  });
}
export function scoreBattle(player,opponent,rules,battle,builds,field) {
  const base = scoreMatchup(player,opponent,rules,battle);
  const reason = supported(rules);
  if (reason) return {...base,victory:battle.opponent_hp === 0 && battle.player_hp > 0 ? 100 : battle.player_hp === 0 && battle.opponent_hp > 0 ? 0 : Math.max(1,Math.min(99,100-base.difficulty)),model:'Type/stat heuristic',warnings:[reason,'No damage calculations were used.'],explanations:[reason,...base.explanations]};
  validateBuild(builds.player,rules.generation);validateBuild(builds.opponent,rules.generation);validateField(field,rules.generation);
  const gen = Generations.get(rules.generation);
  const a = makePokemon(player,builds.player,battle.player_hp,gen), b = makePokemon(opponent,builds.opponent,battle.opponent_hp,gen);
  const outgoing = movesFor(a,b,builds.player,calcField(field,'player'),gen);
  const incoming = movesFor(b,a,builds.opponent,calcField(field,'opponent'),gen);
  const best = rows=>rows.reduce((a,b)=>b.pressure > a.pressure ? b : a);
  const ours = best(outgoing), theirs = best(incoming);
  let order = ours.priority === theirs.priority ? Math.sign(ours.speed - theirs.speed) * (field.trick_room ? -1 : 1) : Math.sign(ours.priority - theirs.priority);
  const total = ours.pressure + theirs.pressure;
  const share = total ? ours.pressure / total : 0.5;
  let victory = Math.max(1,Math.min(99,100 * share + 10 * order));
  if (battle.opponent_hp === 0 && battle.player_hp > 0) victory = 100;
  else if (battle.player_hp === 0 && battle.opponent_hp > 0) victory = 0;
  else if (battle.player_hp === 0 && battle.opponent_hp === 0) victory = 50;
  const warnings = ['Victory outlook is a damage-based index, not a calculated win probability. Active battles stay between 1 and 99; 100/0 require the opposing/your Pokémon to be fainted.','Move sets are assumed until you edit them. Move legality, PP, accuracy/evasion, secondary effects, healing, recoil, switching, teams, and future turns are not simulated. Critical-hit inputs affect damage, not critical-hit likelihood.'];
  warnings.push('Turn order estimates use move priority and effective Speed; conditional priority abilities and random item order effects are not modeled. Status inputs affect supported damage/speed modifiers, but sleep/freeze action prevention and end-of-turn residual damage are not simulated.');
  if ([...outgoing,...incoming].some(m=>m.status_move)) warnings.push('Selected status moves have zero direct damage; their strategic effects are not included in the outlook.');
  if (!gen.species.get(id(player.name)) || !gen.species.get(id(opponent.name))) warnings.push('Species data was supplied through the normalized pack rather than the calculator’s native generation roster.');
  if ([player,opponent].some(p=>!p.weightkg && !Generations.get(9).species.get(id(p.name)))) warnings.push('Unknown species without weight data use an assumed 100 kg; supply weightkg for weight-dependent moves.');
  const describe = (who,m)=>`${who}: ${m.name} deals ${m.min_percent.toFixed(1)}–${m.max_percent.toFixed(1)}% of target maximum HP${m.guaranteed_ko_on_hit ? '; every modeled damage roll KOs on hit' : m.possible_ko_on_hit ? '; some modeled damage rolls KO on hit' : ''}.`;
  return {...base,victory,model:'Smogon damage calculator',warnings,outgoing_moves:outgoing,incoming_moves:incoming,stats:{player:{...a.rawStats,current_hp:a.curHP()},opponent:{...b.rawStats,current_hp:b.curHP()}},explanations:[describe(player.name,ours),describe(opponent.name,theirs),`Selected strongest damage moves: ${order > 0 ? 'you act first' : order < 0 ? 'opponent acts first' : 'turn order is tied'} by move priority and effective Speed (${ours.speed} vs ${theirs.speed}); ${field.trick_room ? 'Trick Room active' : 'normal speed order'}.`,'0 = hopeless / lost; 100 = victory secured. Values in between describe the current damage advantage under the inputs.']};
}
