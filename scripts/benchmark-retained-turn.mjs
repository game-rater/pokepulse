// Run isolated, repeatable A/B cases. No ROM, save file or live capture needed.
import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {searchFixtures} from './search-benchmark-fixtures.mjs';
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const quick=process.argv.includes('--quick'),seconds=Number(arg('seconds')||(quick?1:3)),trials=Number(arg('trials')||(quick?1:3));
if(!(seconds>0&&seconds<=120&&Number.isInteger(trials)&&trials>=1&&trials<=20))throw Error('Use seconds 0–120 and trials 1–20');
const cases=arg('case')?searchFixtures.filter(f=>f.id===arg('case')):searchFixtures;
if(!cases.length)throw Error('Unknown benchmark case');
const root=fileURLToPath(new URL('../',import.meta.url)),worker=fileURLToPath(new URL('./benchmark-retained-turn-worker.mjs',import.meta.url));
const sourceHashes=Object.fromEntries(['analysis/sampled-moves.mjs','analysis/retained-turn.mjs','analysis/complete-moves.mjs',
 'analysis/search.mjs','vendor/showdown/dist/sim/battle-actions.js'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const rows=[];
for(let trial=0;trial<trials;trial++)for(const fixture of cases)for(const mode of trial%2?['hybrid','baseline']:['baseline','hybrid']){
 const child=spawnSync(process.execPath,['--expose-gc',worker,fixture.id,mode,String(seconds)],{cwd:root,encoding:'utf8',timeout:seconds*2500+30000,maxBuffer:1024*1024});
 if(child.status!==0)throw Error(`${fixture.id}/${mode}: ${child.stderr||child.error||child.stdout}`);
 const row={trial,...JSON.parse(child.stdout)};rows.push(row);
 console.log(`${fixture.id}/${mode}: first ${row.first_estimate_ms?.toFixed(0)??'none'} ms; ${row.samples} samples; reroot ${row.reroot?.first_estimate_ms?.toFixed(0)??'-'} ms; ${row.peak_rss_mb.toFixed(0)} MB`);
}
const median=values=>{const v=values.filter(x=>x!==null&&x!==undefined).sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
const summary=cases.flatMap(f=>['baseline','hybrid'].map(mode=>{
 const r=rows.filter(row=>row.case===f.id&&row.mode===mode);
 return {case:f.id,mode,first_estimate_ms:median(r.map(x=>x.first_estimate_ms)),elapsed_ms:median(r.map(x=>x.elapsed_ms)),
  reroot_first_estimate_ms:median(r.map(x=>x.reroot?.first_estimate_ms)),reuse_hits:r.filter(x=>x.reroot?.reused).length,
  samples:median(r.map(x=>x.samples)),peak_rss_mb:median(r.map(x=>x.peak_rss_mb)),completed:r.filter(x=>x.done).length};
}));
const destination=resolve(root,arg('out')||`.local-tools/search-benchmarks/${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
mkdirSync(dirname(destination),{recursive:true});
writeFileSync(destination,JSON.stringify({created_at:new Date().toISOString(),node:process.version,seconds,trials,source_hashes:sourceHashes,
 method:'Isolated processes; engine initialization excluded; fixed native RNG seeds; alternating mode order; identical per-pass and sample budgets.',summary,rows},null,2));
console.log(`Saved ${destination}`);
