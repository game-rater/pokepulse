import {readFileSync} from 'node:fs';
import {makeRules} from '../engine.mjs';
import {pack,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';
const rules=makeRules(JSON.parse(readFileSync('data/type-chart.json')),'gen8');
const player=pack.species.find(s=>s.id==='herdier'),opponent=pack.species.find(s=>s.id==='wingull');
const build=(species,moves,level)=>({...defaultBuild(species),moves,level,ability:'',item:'',nature:'Serious'});
const builds={player:build(player,['Leer','Covet','Baby-Doll Eyes','Bite'],15),opponent:build(opponent,['Water Pulse','Air Cutter','Shock Wave','Rain Dance'],13)};
const live={player:{actual_stats:{hp:50,atk:35,def:27,spa:17,spd:27,spe:27},current_hp:38,pp:{Leer:10,Covet:25,'Baby-Doll Eyes':10,Bite:25}},opponent:{actual_stats:{hp:37,atk:14,def:16,spa:23,spd:16,spe:34},current_hp:37,pp:{'Water Pulse':32,'Air Cutter':24,'Shock Wave':20,'Rain Dance':5}}};
const session={},start=performance.now();let first=null,last;
const duration=Number(process.argv.find(a=>a.startsWith('--seconds='))?.split('=')[1]||10)*1000;
for(let pass=0;pass<1000;pass++){
 last=scoreBattle(player,opponent,rules,{player_hp:76,opponent_hp:100},builds,defaultField(),{player:{first_turn:false},opponent:{first_turn:false}},live,{session,timeMs:150,progressive:true,approximateCompleteMoves:process.argv.includes('--sampled'),maxDepth:4});
 if(first===null&&last.outlook.provisional_usable)first=performance.now()-start;
 if(last.outlook.sampling_complete||last.outlook.complete||performance.now()-start>duration)break;
}
console.log(JSON.stringify({first_estimate_ms:first,elapsed_ms:performance.now()-start,score:last.victory,samples:last.outlook.samples,done:last.outlook.sampling_complete,frontier_pending:last.outlook.frontier_pending,approximate:last.outlook.approximate,cache_hits:last.outlook.cache_hits,exact_endings:last.outlook.exact_endings,pair_samples:session.sampledMoves?.cells.map(row=>row.map(c=>c.n))},null,2));
