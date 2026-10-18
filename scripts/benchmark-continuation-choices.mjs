// Warm policy-construction microbenchmark; not a full battle probability oracle
// or a measurement of live startup/decoder/UI latency. No NPC policy is used.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {referenceMon as mon} from './accuracy-benchmark-fixtures.mjs';
import {createCompleteBattle} from '../analysis/native-battle.mjs';
import {nativeContinuationPolicy} from '../analysis/continuation-policy.mjs';
const definitions=[['capped-setup',['Swords Dance','Tackle'],s=>{s.player.build.boosts.atk=6;}],
 ['full-hp-fast-recovery',['Recover','Tackle'],()=>{}],
 ['sleep-immunity',['Hypnosis','Tackle'],s=>{s.opponent.build.ability='Insomnia';}]];
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const rows=[];
for(const [id,moves,edit] of definitions){
 const snapshot={player:mon('Mew',moves),opponent:mon('Machamp',['Tackle']),field:{}};edit(snapshot);
 const state=createCompleteBattle(snapshot),measure=enabled=>{
  const cache=new Map(),start=performance.now(),policy=nativeContinuationPolicy(state,cache,{filterUselessTurns:enabled});
  return {ms:performance.now()-start,actions:policy.actions,filtered:policy.actionFlags.map(s=>s.filtered),native_turn_probes:[...cache.values()].reduce((n,e)=>n+e.cursor,0)};
 };
 measure(false);measure(true);const readings={enabled:[],disabled:[]};
 for(let trial=0;trial<12;trial++)for(const enabled of trial%2?[true,false]:[false,true])readings[enabled?'enabled':'disabled'].push(measure(enabled));
 const summary=Object.fromEntries(Object.entries(readings).map(([mode,r])=>[mode,{median_ms:percentile(r.map(x=>x.ms),0.5),p95_ms:percentile(r.map(x=>x.ms),0.95),native_turn_probes:r[0].native_turn_probes,actions:r[0].actions,filtered:r[0].filtered}]));
 rows.push({case:id,summary,readings});console.log(id,JSON.stringify(summary));
}
const source_hashes=Object.fromEntries(['analysis/action-usefulness.mjs','analysis/continuation-policy.mjs','analysis/position-features.mjs','analysis/native-battle.mjs','scripts/benchmark-continuation-choices.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);if(out)writeFileSync(out,JSON.stringify({created_at:new Date().toISOString(),scope:'Alternating warm policy construction with fresh policy caches; shared temporal features are warmed. All timings exclude initialization. No full-battle latency or accuracy claim.',source_hashes,rows},null,2)+'\n');
