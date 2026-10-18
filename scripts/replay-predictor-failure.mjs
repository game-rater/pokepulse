import {readFileSync} from 'node:fs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {scoreBattle,pack,catalog} from '../run-bun/profile.mjs';
import {makeRules} from '../engine.mjs';
const report=JSON.parse(readFileSync(process.argv[2])),id=Number(process.argv[3]);
const observed=report.events.find(e=>e.kind==='battle-state'&&e.state_id===id).snapshot;
const s=normalizeSnapshot(observed,pack,catalog()),rules=makeRules(JSON.parse(readFileSync('data/type-chart.json')),'gen8'),session={};
for(let pass=0;pass<200;pass++){
 try{
  const r=scoreBattle(pack.species.find(p=>p.id===s.player),pack.species.find(p=>p.id===s.opponent),rules,s.battle,s.builds,s.field,s.effects,s.live,{session,forceNativeForecast:true,approximateCompleteMoves:true,timeMs:50});
  if(pass%20===0)console.log({pass,score:r.outlook.provisional_score,states:session.turnGraph?.nodes.size});
 }catch(error){console.error(error.stack);process.exitCode=1;break;}
}
