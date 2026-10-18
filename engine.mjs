export const LABELS = ['Free', 'Favored', 'Even', 'Dangerous', 'Nightmare'];
const SPECIAL_TYPES = ['Fire','Water','Grass','Electric','Ice','Psychic','Dragon','Dark'];
export function makeRules(chart, preset = 'modern') {
  const generation = preset === 'classic' ? 3 : /^gen[3-9]$/.test(preset) ? Number(preset.slice(3)) : 9;
  const old = generation < 6;
  const type_chart = structuredClone(chart);
  if (old) { type_chart.Ghost.Steel = 0.5; type_chart.Dark.Steel = 0.5; }
  return {id:preset, generation, physical_special_split:generation >= 4, available_types:Object.keys(chart).filter(t => !old || t !== 'Fairy'), type_chart};
}
export function validateRules(rules) {
  if (!rules || !Number.isInteger(rules.generation) || rules.generation < 1 || typeof rules.physical_special_split !== 'boolean' || !Array.isArray(rules.available_types) || !rules.available_types.length || new Set(rules.available_types).size !== rules.available_types.length) throw Error('Invalid mechanics configuration.');
  for (const a of rules.available_types) {
    if (typeof a !== 'string' || !a.length) throw Error('Invalid type name.');
    for (const b of rules.available_types) {
      const n = rules.type_chart?.[a]?.[b];
      if (!Number.isFinite(n) || n < 0 || n > 16) throw Error(`Missing or invalid type chart entry: ${a} → ${b}.`);
    }
  }
  if (!rules.physical_special_split && rules.available_types.some(t => !['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel',...SPECIAL_TYPES].includes(t))) throw Error('Type-based categories support the original 17 types. Use the physical/special split for custom types.');
  return rules;
}
export function normalizePack(pack, rules) {
  if (!pack || !Array.isArray(pack.species) || !pack.species.length || pack.species.length > 5000) throw Error('A data pack needs a species array (1–5,000 entries).');
  const ids = new Set();
  const species = pack.species.map(p => {
    if (typeof p.id !== 'string' || !/^[a-z0-9-]{1,80}$/.test(p.id) || ids.has(p.id)) throw Error('Species IDs must be unique lowercase letters, numbers, or hyphens.');
    ids.add(p.id);
    if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 100 || !Array.isArray(p.types) || p.types.length < 1 || p.types.length > 2 || new Set(p.types).size !== p.types.length || p.types.some(t => !(t in rules.type_chart))) throw Error(`Invalid name or types for ${p.id}.`);
    const stats = {};
    for (const key of ['hp','atk','def','spa','spd','spe']) {
      const n = p.base_stats?.[key];
      if (!Number.isInteger(n) || n < 1 || n > 999) throw Error(`Invalid base stat ${key} for ${p.id} (use integers 1–999).`);
      stats[key] = n;
    }
    if (p.weightkg !== undefined && (!Number.isFinite(p.weightkg) || p.weightkg <= 0 || p.weightkg > 10000)) throw Error(`Invalid weight for ${p.id}.`);
    return {id:p.id,name:p.name,types:p.types,base_stats:stats,abilities:Array.isArray(p.abilities) ? p.abilities.filter(a => typeof a === 'string').slice(0,10) : [],form:typeof p.form === 'string' ? p.form : 'Base',...(p.weightkg ? {weightkg:p.weightkg} : {}),...(Array.isArray(p.moves) ? {moves:p.moves.filter(m => typeof m === 'string').slice(0,200)} : {})};
  });
  return {name:typeof pack.name === 'string' ? pack.name.slice(0,150) : 'Custom data pack',species};
}
export function effectiveness(type, defender, rules) {
  return defender.types.reduce((mult, t) => mult * rules.type_chart[type][t], 1);
}
export function bestPressure(attacker, defender, rules) {
  // Equal level, equal move power and equal STAB bonus. HP scales the bulk proxy.
  // With a modern split, assume access to either attack category for each STAB type.
  const options = attacker.types.flatMap(type => {
    const categories = rules.physical_special_split ? ['physical','special'] : [SPECIAL_TYPES.includes(type) ? 'special' : 'physical'];
    return categories.map(category => {
      const special = category === 'special';
      const mult = effectiveness(type, defender, rules);
      const pressure = attacker.base_stats[special ? 'spa' : 'atk'] / defender.base_stats[special ? 'spd' : 'def'] * (100 / defender.base_stats.hp) * mult;
      return {type,category,effectiveness:mult,pressure};
    });
  });
  return options.sort((a,b) => b.pressure - a.pressure)[0];
}
export function scoreMatchup(player, opponent, rules, battle = {player_hp:100,opponent_hp:100}) {
  for (const key of ['player_hp','opponent_hp']) if (!Number.isFinite(battle[key]) || battle[key] < 0 || battle[key] > 100) throw Error('Remaining HP must be a number from 0 to 100.');
  for (const p of [player,opponent]) if (!p || p.types.some(t => !rules.available_types.includes(t))) throw Error('This Pokémon has a type unavailable under the selected mechanics.');
  const outgoing = bestPressure(player, opponent, rules);
  const incoming = bestPressure(opponent, player, rules);
  const total = incoming.pressure + outgoing.pressure;
  const pressureShare = total === 0 ? 0.5 : incoming.pressure / total;
  const speedEdge = (opponent.base_stats.spe - player.base_stats.spe) / (opponent.base_stats.spe + player.base_stats.spe);
  const inherent = Math.max(0, Math.min(100, 50 + 90 * (pressureShare - 0.5) + 15 * speedEdge));
  // Scale the initial tension odds by relative remaining HP; not actual win odds.
  const danger = inherent * battle.opponent_hp;
  const safety = (100 - inherent) * battle.player_hp;
  const difficulty = battle.player_hp === 0 && battle.opponent_hp === 0 ? 50 : battle.opponent_hp === 0 ? 0 : battle.player_hp === 0 ? 100 : 100 * danger / (danger + safety);
  const raw = Math.round(difficulty);
  const threat = raw < 20 ? 0 : raw < 40 ? 1 : raw < 60 ? 2 : raw < 80 ? 3 : 4;
  const speed = opponent.base_stats.spe === player.base_stats.spe ? 'Base Speed is tied.' : `${opponent.base_stats.spe > player.base_stats.spe ? opponent.name : player.name} has the higher base Speed (${opponent.base_stats.spe} vs ${player.base_stats.spe}, opponent vs yours).`;
  return {raw,difficulty,inherent,threat,label:LABELS[threat],incoming,outgoing,speedEdge,explanations:[`${opponent.name}’s strongest assumed STAB: ${incoming.type}, ${incoming.category}, ${incoming.effectiveness}× effectiveness.`,`${player.name}’s strongest assumed STAB: ${outgoing.type}, ${outgoing.category}, ${outgoing.effectiveness}× effectiveness.`,speed,`Remaining HP: yours ${battle.player_hp}%, opponent ${battle.opponent_hp}%. Difficulty adjusts relative to the initial ${inherent.toFixed(1)} / 100 matchup rating. This is not a win probability.`]};
}
