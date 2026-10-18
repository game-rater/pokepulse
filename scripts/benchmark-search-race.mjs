import {spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const seconds=Number(arg('seconds')||3),trials=Number(arg('trials')||3);
if(!(seconds>0&&seconds<=120&&Number.isInteger(trials)&&trials>0&&trials<=20))throw Error('Invalid seconds/trials');
const cases=arg('case')?[arg('case')]:['cheap-ending','reusable-next-turn','herdier-wingull'];
const root=fileURLToPath(new URL('../',import.meta.url)),worker=fileURLToPath(new URL('./benchmark-search-race-worker.mjs',import.meta.url));
const source_hashes=Object.fromEntries(['run-bun/search-service.mjs','run-bun/search-worker.mjs','run-bun/refinement.mjs',
 'analysis/retained-turn.mjs','analysis/sampled-moves.mjs'].map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]));
const rows=[];
for(let trial=0;trial<trials;trial++)for(const fixture of cases)for(const mode of trial%2?['race','fallback']:['fallback','race']){
 const result=spawnSync(process.execPath,[worker,fixture,mode,String(seconds)],{cwd:root,encoding:'utf8',timeout:seconds*2500+30000});
 if(result.status!==0)throw Error(result.stderr||result.error||result.stdout);
 const row={trial,...JSON.parse(result.stdout)};rows.push(row);
 console.log(`${fixture}/${mode}: initial ${row.cold.first_estimate_ms?.toFixed(0)??'none'} ms; next turn ${row.warm?.first_estimate_ms?.toFixed(0)??'-'} ms; RSS ${row.peak_rss_mb.toFixed(0)} MB; selected ${row.cold.selected}`);
}
const median=values=>{const v=values.filter(x=>x!==undefined&&x!==null).sort((a,b)=>a-b);return v.length?(v[Math.floor((v.length-1)/2)]+v[Math.ceil((v.length-1)/2)])/2:null;};
const summary=cases.flatMap(f=>['fallback','race'].map(mode=>{
 const r=rows.filter(x=>x.case===f&&x.mode===mode);
 return {case:f,mode,first_estimate_ms:median(r.map(x=>x.cold.first_estimate_ms)),
  next_turn_estimate_ms:median(r.map(x=>x.warm?.first_estimate_ms)),cpu_ms:median(r.map(x=>x.cold.cpu_ms)),
  peak_rss_mb:median(r.map(x=>x.peak_rss_mb)),completed:r.filter(x=>x.cold.complete).length};
}));
const destination=resolve(root,arg('out')||`.local-tools/search-benchmarks/race-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);
mkdirSync(dirname(destination),{recursive:true});writeFileSync(destination,JSON.stringify({created_at:new Date().toISOString(),seconds,trials,source_hashes,
 method:'Isolated processes and alternating order; actual persistent SearchService workers; initial measurement includes worker startup; observed-turn measurement reuses those workers.',summary,rows},null,2));
console.log(`Saved ${destination}`);
