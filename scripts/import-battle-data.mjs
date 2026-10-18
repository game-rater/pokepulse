import {writeFileSync} from 'node:fs';
import vm from 'node:vm';
import {Generations} from '@smogon/calc';
async function download(file) {
  const response = await fetch(`https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/${file}.ts`);
  if (!response.ok) throw Error(`Download failed: ${response.status}`);
  return response.text();
}
const learnsetSource = await download('learnsets');
const learnsets = vm.runInNewContext(learnsetSource.replace(/^export const \w+:[^=]+=/,'const Learnsets =') + ';Learnsets',{}, {timeout:5000});
const dexSource = await download('pokedex');
const dex = vm.runInNewContext(dexSource.replace(/^export const \w+:[^=]+=/,'const Pokedex =') + ';Pokedex',{}, {timeout:5000});
const toID = name=>name.toLowerCase().replace(/[^a-z0-9]/g,'');
function inheritedMoves(speciesID,seen = new Set()) {
  if (seen.has(speciesID)) return [];
  seen.add(speciesID);
  const species = dex[speciesID];
  const parents = [species?.prevo,species?.baseSpecies].filter(Boolean).map(toID).filter(p=>p !== speciesID);
  return [...new Set([...Object.keys(learnsets[speciesID]?.learnset || {}),...parents.flatMap(p=>inheritedMoves(p,seen))])];
}
const moveSource = await download('moves');
const metadata = {};
for (const match of moveSource.matchAll(/^\t([a-z0-9]+): \{\n([\s\S]*?)(?=^\t\},)/gm)) {
  const accuracy = match[2].match(/^\t\taccuracy: (true|\d+)/m);
  metadata[match[1]] = {accuracy:accuracy ? (accuracy[1] === 'true' ? 100 : Number(accuracy[1])) : null};
}
writeFileSync('data/battle-data.json',JSON.stringify({source:'https://github.com/smogon/pokemon-showdown',imported_at:new Date().toISOString(),learnsets:Object.fromEntries([...new Set([...Object.keys(learnsets),...Object.keys(dex)])].map(id=>[id,inheritedMoves(id)])),moves:metadata}));
console.log(`Imported ${Object.keys(learnsets).length} learnsets and ${Object.keys(metadata).length} move metadata entries.`);
console.log(`Calculator generation 9: ${[...Generations.get(9).moves].length} moves.`);
