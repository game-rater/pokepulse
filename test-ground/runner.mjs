import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import calculator from '../vendor/run-bun/index.js';
import {makeRules} from '../engine.mjs';
import {pack,catalog,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';
import {actionOpportunity} from '../run-bun/actions.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
export async function runScenarios(file=path.join(here,'scenarios/run-bun.json'),{searchOptions={}}={}){
 const suite=JSON.parse(await readFile(file,'utf8'));
 if(suite.schema_version!==1||suite.game!=='run-bun')throw Error('Unsupported test-ground scenario schema.');
 const player=pack.species.find(p=>p.id===suite.species),opponent=pack.species.find(p=>p.id===suite.opponent);
 const rules=makeRules(JSON.parse(await readFile(new URL('../data/type-chart.json',import.meta.url))),'gen8');
 const results=[];
 for(const scenario of suite.scenarios){
  const create=(defaults,patch,move,base={})=>({...defaultBuild(defaults),...base,moves:patch.move?[patch.move]:base.moves||[move],status:patch.status||'',boosts:{...defaultBuild(defaults).boosts,...base.boosts,accuracy:patch.accuracy||0,evasion:patch.evasion||0}});
  const a=create(player,sce(scenario.player),suite.player_move,suite.player_build),b=create(opponent,sce(scenario.opponent),suite.opponent_move,suite.opponent_build);
  const effects={player:{...(scenario.player?.sleep_counter?{sleep_counter:scenario.player.sleep_counter}:{}),...(scenario.player?.confusion_turns?{confusion_turns:scenario.player.confusion_turns}:{})},opponent:{...(scenario.opponent?.sleep_counter?{sleep_counter:scenario.opponent.sleep_counter}:{}),...(scenario.opponent?.confusion_turns?{confusion_turns:scenario.opponent.confusion_turns}:{})}};
  const live=suite.live?{player:{...suite.live.player,...scenario.live?.player},opponent:{...suite.live.opponent,...scenario.live?.opponent}}:{};
  const result=scoreBattle(player,opponent,rules,{player_hp:scenario.player_hp??100,opponent_hp:scenario.opponent_hp??100},{player:a,opponent:b},defaultField(),effects,live,searchOptions);
  const move=result.outgoing_moves[0],incoming=result.incoming_moves[0];
  const actual={hit:move.effective_accuracy,action:move.action_chance,incomingHit:incoming.effective_accuracy,incomingAction:incoming.action_chance,victory:result.victory,unresolved:result.outlook.unresolved};
  for(const [key,value] of Object.entries(scenario.expected)){
   const matches=key==='victory'?value==='below-50'?actual.victory<50:value==='above-50'?actual.victory>50:actual.victory===value:actual[key]===value;
   if(!matches)throw Error(`${scenario.name}: expected ${key}=${value}, got ${actual[key]}.`);
  }
  results.push({name:scenario.name,...actual});
 }
 return results;
}
function sce(value={}){return value;}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const file=process.argv[2]?path.resolve(process.argv[2]):undefined;
 try{const rows=await runScenarios(file);for(const row of rows)console.log(`PASS ${row.name}: hit ${row.hit}% · action ${row.action}`);console.log(`Passed ${rows.length} reusable battle scenarios.`);}
 catch(error){console.error(error.message);process.exitCode=1;}
}
