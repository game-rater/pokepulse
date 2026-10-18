import { mkdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
async function source(file, variable) {
  const response = await fetch(`https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/${file}.ts`);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const src = await response.text();
  return vm.runInNewContext(src.replace(/^export const \w+:[^=]+=/, `const ${variable} =`) + `;${variable}`, {}, { timeout: 3000 });
}
// Only evaluate the fixed upstream data tables in an isolated context, never user imports.
const dex = await source('pokedex', 'Pokedex');
const chart = await source('typechart', 'TypeChart');
const species = Object.entries(dex).filter(([id,p]) => p.num > 0 && p.num <= 1025 && p.baseStats && !p.requiredItem && !p.battleOnly && !p.isNonstandard).map(([id,p]) => ({id, name:p.name, types:p.types, base_stats:p.baseStats, abilities:Object.values(p.abilities || {}), form:p.forme || 'Base',...(p.weightkg > 0 ? {weightkg:p.weightkg} : {})}));
const types = Object.keys(chart).filter(t => t !== 'stellar').map(t => t[0].toUpperCase() + t.slice(1));
const matrix = Object.fromEntries(types.map(atk => [atk, Object.fromEntries(types.map(def => [def, ({1:2, 2:0.5, 3:0})[chart[def.toLowerCase()].damageTaken[atk]] ?? 1]))]));
mkdirSync('data', {recursive:true});
writeFileSync('data/pokedex.json', JSON.stringify({name:'Showdown snapshot — modern species stats and typing', source:'https://github.com/smogon/pokemon-showdown', imported_at:new Date().toISOString(), species}, null, 2));
writeFileSync('data/type-chart.json', JSON.stringify(matrix, null, 2));
console.log(`Imported ${species.length} species and ${types.length} types.`);
