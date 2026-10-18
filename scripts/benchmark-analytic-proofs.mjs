import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {accuracyFixtures} from './accuracy-benchmark-fixtures.mjs';
import {analyticOracle,benchmarkReference} from './benchmark-oracles.mjs';
const out=resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'.local-tools/analytic-proof-timings.json');
const rows=accuracyFixtures.filter(f=>f.family==='proved-complex').map(f=>{
 const reference=benchmarkReference(f);analyticOracle(f);
 const times=[];for(let i=0;i<100;i++){const start=performance.now();const r=analyticOracle(f);times.push(performance.now()-start);if(r.expected_percent!==reference.expected_percent)throw Error('Oracle mismatch');}
 times.sort((a,b)=>a-b);return {case:f.id,expected_percent:reference.expected_percent,input_sha256:reference.input_sha256,repetitions:times.length,median_ms:(times[49]+times[50])/2,p95_ms:times[94],max_ms:times.at(-1)};
});
const paths=['scripts/benchmark-analytic-proofs.mjs','scripts/accuracy-benchmark-fixtures.mjs','scripts/benchmark-oracles.mjs','scripts/reference-damage-race.mjs','scripts/benchmark-references.json'];
const result={created_at:new Date().toISOString(),node:process.version,method:'Warm analytic proof checks with calculator damage ranges; 100 repeats; excludes module loading, worker startup and UI. Proof-domain prototype only, not a production engine speedup.',source_hashes:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),rows};
mkdirSync(dirname(out),{recursive:true});writeFileSync(out,JSON.stringify(result,null,2)+'\n');
for(const row of rows)console.log(`${row.case}: ${row.expected_percent}%; median ${row.median_ms.toFixed(3)} ms`);
