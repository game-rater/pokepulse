// Local captures stay local. This audit writes only aggregate verification
// metadata, never ROM, save, or captured RAM into regression fixtures.
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {decodeMemory} from '../run-bun/memory.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {pack,catalog} from '../run-bun/profile.mjs';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/complete-moves.mjs';
const directory=process.argv[2]||'.local-tools/move-engine/effect-probes';
const maps=JSON.parse(readFileSync('run-bun/reference/mappings.json')),c=catalog();
const lookup={species:new Set(pack.species.map(s=>s.id)),moves:new Set(c.moves.map(m=>m.name)),abilities:new Set(c.abilities),items:new Set(c.items)};
const failures=[],results=[];
for(const file of readdirSync(directory).filter(f=>f.endsWith('.bin'))){
 try{
  const decoded=decodeMemory(readFileSync(join(directory,file)),maps,lookup);if(decoded.status!=='battle')throw Error(decoded.message);
  const s=normalizeSnapshot(decoded.snapshot,pack,c);
  const side=key=>({species:pack.species.find(p=>p.id===s[key]).name,build:s.builds[key],effects:s.effects[key],...s.live[key]});
  const field={weather:s.field.weather,terrain:s.field.terrain,isTrickRoom:s.field.trick_room,attackerSide:{isReflect:s.field.player.reflect,isLightScreen:s.field.player.light_screen,isTailwind:s.field.player.tailwind},defenderSide:{isReflect:s.field.opponent.reflect,isLightScreen:s.field.opponent.light_screen,isTailwind:s.field.opponent.tailwind}};
  const b=restoreCompleteBattle(createCompleteBattle({player:side('player'),opponent:side('opponent'),field}));
  b.prng.random=(from,to)=>to===undefined?0:from;b.prng.randomChance=(n,d)=>n>=d;
  const choices=b.sides.map(side=>{const moves=side.active[0].getMoves();const i=moves.findIndex(m=>!m.disabled&&m.pp>0);return i<0?1:i+1;});
  if(!b.choose('p1',`move ${choices[0]}`)||!b.choose('p2',`move ${choices[1]}`))throw Error('Restored turn rejected a legal move');
  results.push({case:file.replace('.bin',''),effects:Object.keys({...s.effects.player.native_volatiles,...s.effects.opponent.native_volatiles}),unknown:[...s.effects.player.unknown_effects,...s.effects.opponent.unknown_effects]});
 }catch(error){failures.push({case:file,error:error.message});}
}
console.log(JSON.stringify({checked:results.length+failures.length,passed:results.length,failures,unknown:results.filter(r=>r.unknown.length)},null,2));
if(failures.length)process.exitCode=1;
