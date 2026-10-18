import {writeFileSync} from 'node:fs';
import calculator from '../vendor/run-bun/index.js';
const source='https://play.pokemonshowdown.com/data/moves.json';
const response=await fetch(source);
if(!response.ok)throw Error(`Move metadata download failed: ${response.status}`);
const moves=await response.json(),records={};
// Run & Bun's published changes; unspecified mechanics inherit Generation 8.
const chances={chargebeam:100,leaftornado:30,mirrorshot:20,mudbomb:20,nightdaze:30,octazooka:30,rocksmash:100,smog:100};
for(const move of calculator.Generations.get(8).moves){
  const data=moves[move.id];if(!data)continue;
  const secondaries=data.secondaries|| (data.secondary?[data.secondary]:[]);
  if(chances[move.id]!==undefined)secondaries[0].chance=chances[move.id];
  const record={secondaries,self:data.self?.boosts?{boosts:data.self.boosts}:data.selfBoost,multihit:data.multihit,multiaccuracy:data.multiaccuracy,sound:!!data.flags?.sound,defrost:!!data.flags?.defrost,
    accuracy:data.accuracy,flags:data.flags,target:data.target,boosts:data.boosts,status:data.status,volatile:data.volatileStatus,recoil:data.recoil,crash:!!data.hasCrashDamage,charge:!!data.flags?.charge,recharge:data.self?.volatileStatus==='mustrecharge',heal:data.heal};
  // Function-valued callbacks are intentionally omitted by Showdown's JSON.
  // Preserve their meaning explicitly rather than interpreting them as no-ops.
  if(move.id==='triattack')record.secondaries=[{chance:20,statuses:['brn','par','frz']}];
  if(move.id==='diamondstorm'){record.secondaries=[{chance:50,self:{boosts:{def:2}}}];delete record.self;}
  if(move.id==='clangoroussoulblaze'){record.secondaries=[{chance:100,self:{boosts:record.self.boosts}}];delete record.self;}
  if(move.id==='genesissupernova')record.secondaries=[{chance:100,self:{terrain:'Psychic'}}];
  if(move.id==='burningjealousy')record.secondaries=[{chance:100,status:'brn',requiresBoost:true}];
  if(['anchorshot','spiritshackle'].includes(move.id))record.secondaries=[{chance:100,volatileStatus:'trapped'}];
  if(move.id==='throatchop')record.secondaries=[{chance:100,volatileStatus:'throatchop'}];
  if(move.id==='eeriespell')record.secondaries=[{chance:100,ppDrain:3}];
  records[move.id]=record;
}
writeFileSync(new URL('../run-bun/move-effects.json',import.meta.url),JSON.stringify({source,mechanics:'Generation 8 with Run & Bun effect-chance overrides',moves:records},null,2)+'\n');
console.log(`Saved effect metadata for ${Object.keys(records).length} moves.`);
