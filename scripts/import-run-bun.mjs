import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {patchCalculator,calculatorPatches} from './run-bun-calculator-patches.mjs';
const repo='ForwardFeed/runbuncalc';
async function get(url,json=false){const r=await fetch(url);if(!r.ok)throw Error(`${r.status}: ${url}`);return json?r.json():r.text();}
const commit=await get(`https://api.github.com/repos/${repo}/commits/master`,true);
const sha=commit.sha;
const tree=await get(`https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`,true);
const files=tree.tree.filter(x=>x.type==='blob' && /^dist\/calc\/.*\.js$/.test(x.path) && !/test|production|min\.js/.test(x.path));
for(const f of files){const target=`vendor/run-bun/${f.path.slice('dist/calc/'.length)}`;await mkdir(target.slice(0,target.lastIndexOf('/')),{recursive:true});await writeFile(target,await get(`https://raw.githubusercontent.com/${repo}/${sha}/${f.path}`));}
const mechanicsPath='vendor/run-bun/mechanics/gen789.js';
await writeFile(mechanicsPath,patchCalculator(await readFile(mechanicsPath,'utf8')));
await writeFile('vendor/run-bun/package.json',JSON.stringify({type:'commonjs',private:true}));
await writeFile('vendor/run-bun/LICENSE',await get(`https://raw.githubusercontent.com/${repo}/${sha}/LICENSE`));
await writeFile('vendor/run-bun/source.json',JSON.stringify({repository:`https://github.com/${repo}`,commit:sha,imported_at:new Date().toISOString(),patches:calculatorPatches,notice:'Community Run & Bun calculator fork with explicit armor/priority patches. Exact ROM version compatibility must be checked.'},null,2));
console.log(`Imported ${files.length} calculator files at ${sha}`);
