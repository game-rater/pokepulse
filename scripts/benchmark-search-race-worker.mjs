import {SearchService} from '../run-bun/search-service.mjs';
import {pack,defaultBuild,defaultField} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
import {readFileSync} from 'node:fs';
import {searchFixtures,observeSimpleTurn} from './search-benchmark-fixtures.mjs';
import {completeMoveDex} from '../analysis/complete-moves.mjs';
const fixture=searchFixtures.find(f=>f.id===process.argv[2]),mode=process.argv[3],seconds=Number(process.argv[4]||3);
if(!fixture||!['fallback','race'].includes(mode)||!Number.isFinite(seconds)||seconds<=0)throw Error('Invalid race benchmark arguments');
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function args(snapshot){
 const p=pack.species.find(s=>s.name===snapshot.player.species),q=pack.species.find(s=>s.name===snapshot.opponent.species);
 const build=(input,species)=>{const defaults=defaultBuild(species);return {...defaults,...input.build,boosts:{...defaults.boosts,...input.build.boosts}};};
 const effects=input=>{const e={...input.effects};for(const key of ['last_move','battle_last_move'])if(e[key])e[key]=completeMoveDex.moves.get(e[key]).name;return e;};
 return [p,q,rules,{player_hp:100*snapshot.player.current_hp/snapshot.player.actual_stats.hp,
  opponent_hp:100*snapshot.opponent.current_hp/snapshot.opponent.actual_stats.hp},
  {player:build(snapshot.player,p),opponent:build(snapshot.opponent,q)},defaultField(),
  {player:effects(snapshot.player),opponent:effects(snapshot.opponent)},
  {player:{current_hp:snapshot.player.current_hp,actual_stats:snapshot.player.actual_stats,pp:snapshot.player.pp},
   opponent:{current_hp:snapshot.opponent.current_hp,actual_stats:snapshot.opponent.actual_stats,pp:snapshot.opponent.pp}}];
}
const service=new SearchService({parallel:mode==='race'});
let peak=process.memoryUsage().rss;const memoryTimer=setInterval(()=>peak=Math.max(peak,process.memoryUsage().rss),25);
async function measure(input,firstOnly=false){
 const start=performance.now(),cpuStart=process.cpuUsage();let first=null,firstScore=null,last,updates=0;const readings=[];
 await new Promise((resolve,reject)=>{
  const deadline=setTimeout(resolve,seconds*1000);
  service.start(input,result=>{
   updates++;last=result;
   readings.push({elapsed_ms:performance.now()-start,score:result.display_score??null,algorithm:result.outlook.algorithm});
   if(Number.isFinite(result.display_score)&&first===null){first=performance.now()-start;firstScore=result.display_score;if(firstOnly){clearTimeout(deadline);resolve();}}
   if(result.outlook.complete){clearTimeout(deadline);resolve();}
  },error=>{clearTimeout(deadline);reject(error);});
 });
 const cpu=process.cpuUsage(cpuStart);
 return {first_estimate_ms:first,first_score:firstScore,algorithm:last?.outlook.algorithm,elapsed_ms:performance.now()-start,cpu_ms:(cpu.user+cpu.system)/1000,
  first_second:readings.filter(r=>r.elapsed_ms<=1000&&Number.isFinite(r.score)).at(-1)||null,readings,
  score:last?.display_score??null,complete:last?.outlook.complete||false,updates,
  selected:last?.outlook.search_race?.selected||'fallback',race:last?.outlook.search_race,
  reused:!!last?.outlook.reused_next_turn_estimate,samples:last?.outlook.samples??0};
}
try{
 let preload_ms=null;if(process.argv.includes('--preload')){const start=performance.now();await service.preload();preload_ms=performance.now()-start;}
 const cold=await measure(args(fixture.snapshot));
 const warm=fixture.reroot?await measure(args(observeSimpleTurn(fixture.snapshot).observed),true):null;
 console.log(JSON.stringify({case:fixture.id,mode,preload_ms,worker_preloaded:preload_ms!==null,cold,warm,peak_rss_mb:peak/1048576}));
}finally{clearInterval(memoryTimer);service.cancel();}
