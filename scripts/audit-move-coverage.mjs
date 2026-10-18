import {readFileSync,writeFileSync} from 'node:fs';
import {createCompleteBattle,restoreCompleteBattle,completeMoveDex,requiresCompleteMoves} from '../analysis/complete-moves.mjs';
const names=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url))).move.filter(Boolean);
const side=moves=>({species:'Mew',current_hp:200,actual_stats:{hp:200,atk:40,def:40,spa:40,spd:40,spe:60},
  build:{level:30,moves,nature:'Serious',boosts:{},ability:'',item:''},effects:{}});
const records=[];
for(const name of names){
  const move=completeMoveDex.moves.get(name),snapshot={player:side([name]),opponent:side(['Splash']),field:{}};
  snapshot.opponent.actual_stats.spe=20;
  if(!move.exists)throw Error(`Missing executable move: ${name}`);
  const b=restoreCompleteBattle(createCompleteBattle(snapshot));
  b.prng.random=(from,to)=>to===undefined?0:from;b.prng.randomChance=(n,d)=>n>=d;
  if(!b.choose('p1','move 1')||!b.choose('p2','move 1'))throw Error(`Move rejected: ${name}`);
  records.push({name,id:move.id,category:move.category,type:move.type,power:move.basePower,accuracy:move.accuracy,pp:move.pp,
    route:requiresCompleteMoves(snapshot)?'complete-callback-engine':'fast-adapter',
    callbacks:Object.keys(move).filter(k=>typeof move[k]==='function'),turn_execution:'passed'});
}
writeFileSync(new URL('../run-bun/move-coverage.json',import.meta.url),JSON.stringify({scope:'Run & Bun ROM move catalogue; active single matchup',
  engine:'pokemon-showdown 0.11.11 with Run & Bun overrides',total:records.length,missing:0,
  verification:'Every move definition executed in a synthetic turn. Conditional mechanics have focused behavior tests; this is not a claim that every move has been live-ROM verified.',moves:records},null,2)+'\n');
console.log(`Move coverage: ${records.length}/${records.length} executable; 0 missing.`);
