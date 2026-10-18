// Repeatable local benchmark; no emulator, ROM, save, or live-server mutation.
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {makeRules} from '../engine.mjs';
import {pack,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';

const rules=makeRules(JSON.parse(await readFile(new URL('../data/type-chart.json',import.meta.url))),'gen8');
const player=pack.species.find(s=>s.id==='garchomp');
const opponent=pack.species.find(s=>s.id==='weavile');
const builds={player:{...defaultBuild(player),moves:['Earthquake','Dragon Claw','Stone Edge','Fire Fang']},opponent:{...defaultBuild(opponent),moves:['Ice Shard','Icicle Crash','Night Slash','Low Kick']}};
const field=defaultField(),effects={player:{},opponent:{}};
const calculate=i=>scoreBattle(player,opponent,rules,{player_hp:80+i%20,opponent_hp:60+i%40},builds,field,effects);
const example=calculate(0);
for(let i=0;i<2;i++)calculate(i);
const cpuStart=process.cpuUsage(),start=performance.now(),times=[];
for(let i=0;i<20;i++){const before=performance.now();calculate(i);times.push(performance.now()-before);}
const elapsed=performance.now()-start,cpu=process.cpuUsage(cpuStart);
times.sort((a,b)=>a-b);
console.log(JSON.stringify({calculations:times.length,search_nodes:example.outlook.nodes,search_depth:example.outlook.depth,cache_hits:example.outlook.cache_hits,example_unresolved:example.outlook.unresolved,damaging_moves:8,mean_ms:elapsed/times.length,p50_ms:times[Math.ceil(times.length*0.5)-1],p95_ms:times[Math.ceil(times.length*0.95)-1],max_ms:times.at(-1),cpu_ms:(cpu.user+cpu.system)/1000,rss_mib:process.memoryUsage().rss/1048576,heap_used_mib:process.memoryUsage().heapUsed/1048576},null,2));
