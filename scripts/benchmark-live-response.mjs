// Real normalization -> SearchService -> worker -> publication timing. No live
// emulator, HTTP server, settings or user process is touched.
import {SearchService} from '../run-bun/search-service.mjs';
import {pack,catalog,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {makeRules} from '../engine.mjs';
import {searchFixtures} from './search-benchmark-fixtures.mjs';
import {benchmarkReference} from './benchmark-oracles.mjs';
import {assessInitialEstimate} from './prediction-target.mjs';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const arg=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.split('=').slice(1).join('=');
const fixture=searchFixtures.find(f=>f.id===(arg('case')||'strategy-recover-1'));
if(!fixture)throw Error('Unknown fixture');
const trials=Number(arg('trials')||3),cold=process.argv.includes('--cold');
if(!Number.isInteger(trials)||trials<1||trials>10)throw Error('Use 1–10 trials');
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url),'utf8')),'gen8'),c=catalog(),reference=benchmarkReference(fixture,'minimax'),rows=[];
for(let trial=0;trial<trials;trial++){
 const service=new SearchService({parallel:false}),readings=[],hold=setInterval(()=>{},1000);let error=null,timer,firstProcessMs=null;
 try{
  if(!cold)await service.preload();
  const start=performance.now();
  const input={schema_version:1,game:'run-bun',...structuredClone(fixture.snapshot),field:{...defaultField(),...fixture.snapshot.field}};
  for(const side of ['player','opponent']){
   const mon=input[side],species=pack.species.find(s=>s.id===mon.species.toLowerCase().replace(/[^a-z0-9]/g,''));
   mon.species=species.id;mon.hp_percent=100*mon.current_hp/mon.actual_stats.hp;mon.build={...defaultBuild(species),...mon.build,critical:false};
  }
  const n=normalizeSnapshot(input,pack,c,{source:'diagnostic'});
  const args=[pack.species.find(s=>s.id===n.player),pack.species.find(s=>s.id===n.opponent),rules,n.battle,n.builds,n.field,n.effects,n.live];
  await new Promise(resolve=>{
   timer=setTimeout(resolve,2000);
   service.start(args,r=>{
    readings.push({elapsed_ms:performance.now()-start,score:r.display_score,kind:r.prediction.kind});
    if(firstProcessMs===null&&Number.isFinite(r.display_score))firstProcessMs=performance.now();
    if(r.outlook.complete||r.outlook.input_blocked){clearTimeout(timer);resolve();}
   },e=>{error=e.message;clearTimeout(timer);resolve();});
  });
  const row={trial,case:fixture.id,mode:cold?'cold-worker':'preloaded-worker',reference,initial_estimate:assessInitialEstimate(readings,reference.expected_percent),first_estimate_ms:readings.find(r=>Number.isFinite(r.score))?.elapsed_ms??null,process_start_to_first_result_ms:trial===0?firstProcessMs:null,error,readings};
  rows.push(row);console.log(JSON.stringify(row));
 }finally{clearTimeout(timer);clearInterval(hold);service.cancel();}
}
if(arg('out')){const path=resolve(arg('out'));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify({method:'Real normalization and worker publication. Cold-worker mode includes worker startup; preloaded mode excludes it. RAM-file decoding, HTTP polling and UI animation are excluded. Concurrent app load is uncontrolled.',rows},null,2)+'\n');}
