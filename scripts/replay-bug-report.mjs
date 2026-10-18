// Read a private local bug report; never sends data or controls the emulator.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {pack,catalog,scoreBattle} from '../run-bun/profile.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {modelContext} from '../run-bun/search-service.mjs';
import {makeRules} from '../engine.mjs';

const [file,...flags]=process.argv.slice(2);
if(!file)throw Error('Usage: node scripts/replay-bug-report.mjs <report.json> [--state ID] [--time-ms 1000]');
const option=(name,fallback)=>{const index=flags.indexOf(name);return index<0?fallback:Number(flags[index+1]);};
const timeMs=option('--time-ms',1000),stateId=option('--state',null);
if(!Number.isFinite(timeMs)||timeMs<0||timeMs>60000)throw Error('Replay time budget must be between 0 and 60000 ms per state.');
const path=resolve(file),report=JSON.parse(await readFile(path,'utf8'));
if(report.schema_version!==1||!Array.isArray(report.events))throw Error('Unsupported bug report schema.');
const root=fileURLToPath(new URL('../',import.meta.url));
const rules=makeRules(JSON.parse(await readFile(join(root,'data/type-chart.json'),'utf8')),'gen8');
const changed=[];
for(const [file,expected] of Object.entries(report.metadata?.engine_hashes||{})){
 const target=resolve(root,file);if(!target.startsWith(root))throw Error('Invalid engine fingerprint path.');
 try{if(createHash('sha256').update(await readFile(target)).digest('hex')!==expected)changed.push(file);}catch{changed.push(file);}
}
const states=report.events.filter(e=>e.kind==='battle-state'&&(stateId===null||e.state_id===stateId));
const selected=stateId===null?states.slice(-12):states;
let context=null,session={};const comparisons=[];
for(const event of selected){
 const next=normalizeSnapshot(event.snapshot,pack,catalog());
 const args=[pack.species.find(p=>p.id===next.player),pack.species.find(p=>p.id===next.opponent),rules,next.battle,next.builds,next.field,next.effects,next.live];
 const key=modelContext(args);if(key!==context){session={};context=key;}
 const result=scoreBattle(...args,{session,timeMs,maxDepth:256,maxNodes:Infinity});
 const original=report.events.filter(e=>e.kind==='estimate'&&e.state_id===event.state_id).at(-1)?.estimate;
 comparisons.push({state_id:event.state_id,changes:event.changes,original:original?{display_score:original.display_score,lower:original.outlook.lower_bound,upper:original.outlook.upper_bound}:null,
  replay:{lower:result.outlook.lower_bound,upper:result.outlook.upper_bound,complete:result.outlook.complete,nodes:result.outlook.nodes,unresolved_reasons:result.outlook.unresolved_reasons},warnings:result.warnings});
}
if(!comparisons.length)throw Error('No captured battle state matches the requested replay.');
let note=report.note||'';try{note=await readFile(join(dirname(path),'note.txt'),'utf8');}catch{}
const summary={report:path,note,changed_engine_files:changed,limitations:['Replays observed snapshots using the current engine and a bounded diagnostic budget.','States are not confirmed turn boundaries. Different traversal timing may produce different unfinished bounds.'],review_flags:report.events.filter(e=>e.kind==='review-flag'),comparisons};
const output=join(dirname(path),'replay.json');await writeFile(output,JSON.stringify(summary,null,2));
console.log(JSON.stringify({output,states:comparisons.length,changed_engine_files:changed,comparisons:comparisons.map(c=>({state_id:c.state_id,original:c.original,replay:c.replay}))},null,2));
