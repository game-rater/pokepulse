import {readFileSync} from 'node:fs';
import {makeRules} from '../engine.mjs';
import {defaultBuild,defaultField,scoreBattle} from '../battle-engine.mjs';
const pack = JSON.parse(readFileSync('data/pokedex.json'));
const chart = JSON.parse(readFileSync('data/type-chart.json'));
const opponent = pack.species.find(p=>p.id === 'weavile');
let checked = 0;
for (const preset of ['modern','classic']) {
  const rules = makeRules(chart,preset);
  const opponentBuild = defaultBuild(opponent,rules.generation);
  for (const player of pack.species.filter(p=>p.types.every(t=>rules.available_types.includes(t)))) {
    try {
      const result = scoreBattle(player,opponent,rules,{player_hp:100,opponent_hp:100},{player:defaultBuild(player,rules.generation),opponent:opponentBuild},defaultField());
      if (!Number.isFinite(result.victory) || result.model !== 'Smogon damage calculator') throw Error('Nonfinite score or unexpected fallback.');
      checked++;
    } catch(error) {console.error(`${preset}: ${player.id}: ${error.message}`);process.exitCode = 1;}
  }
}
console.log(`Calculated ${checked} catalog matchups across modern and classic mechanics.`);
