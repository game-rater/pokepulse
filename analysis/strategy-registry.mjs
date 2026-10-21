// Ordered search hints, never move legality, trainer AI, damage or probability.
// Maps index immutable move metadata. Battle conditions are checked afresh.
import {BoundedCache} from './bounded-cache.mjs';
import {expandedStrategyPatterns} from './strategy-expansions.mjs';
import {selfBoostChanges,inflictedStatuses,createStrategyRequirements,expandedMoveEligible} from './strategy-conditions.mjs';
export {surveyStrategyCoverage} from './strategy-expansions.mjs';
export const STRATEGY_VERSION=2;
const step=(tag,...requires)=>({tag,requires});
const plan=(id,...steps)=>({id,steps});
export const strategyPatterns=Object.freeze([
 plan('sleep-wake-up',step('inflict:slp'),step('move:wakeupslap','foe:slp')),
 plan('sleep-dream-eater',step('inflict:slp'),step('move:dreameater','foe:slp')),
 plan('status-hex',step('inflict:status'),step('move:hex','foe:status')),
 plan('poison-venoshock',step('inflict:poison'),step('move:venoshock','foe:poison')),
 plan('paralysis-smelling-salts',step('inflict:par'),step('move:smellingsalts','foe:par')),
 plan('rest-sleep-talk',step('move:rest'),step('move:sleeptalk','self:slp')),
 plan('rest-snore',step('move:rest'),step('move:snore','self:slp')),
 plan('attack-physical',step('boost:atk'),step('attack:physical','self:atk')),
 plan('special-attack-special',step('boost:spa'),step('attack:special','self:spa')),
 plan('defense-body-press',step('boost:def'),step('move:bodypress','self:def')),
 plan('speed-electro-ball',step('boost:spe'),step('move:electroball','self:spe')),
 plan('lower-defense-attack',step('drop:def'),step('attack:vs-def','foe:def-down')),
 plan('lower-special-defense-attack',step('drop:spd'),step('attack:vs-spd','foe:spd-down')),
 plan('boost-stored-power',step('boost:any'),step('move:storedpower','self:boost')),
 plan('boost-power-trip',step('boost:any'),step('move:powertrip','self:boost')),
 plan('poison-protect',step('inflict:poison'),step('protect','foe:poison')),
 plan('poison-recovery',step('inflict:poison'),step('heal','foe:poison','self:damaged')),
 plan('poison-protect-recovery',step('inflict:poison'),step('protect','foe:poison'),step('heal','foe:poison','self:after-protect','self:damaged')),
 plan('seed-protect',step('volatile:leechseed'),step('protect','foe:seed')),
 plan('seed-recovery',step('volatile:leechseed'),step('heal','foe:seed','self:damaged')),
 plan('seed-substitute-protect',step('volatile:leechseed'),step('volatile:substitute','foe:seed'),step('protect','foe:seed','self:substitute')),
 plan('substitute-focus-punch',step('volatile:substitute'),step('move:focuspunch','self:substitute')),
 plan('defense-curl-rollout',step('volatile:defensecurl'),step('move:rollout','self:defensecurl')),
 plan('defense-curl-ice-ball',step('volatile:defensecurl'),step('move:iceball','self:defensecurl')),
 plan('charge-electric',step('volatile:charge'),step('attack:electric','self:charge')),
 plan('focus-energy-attack',step('volatile:focusenergy'),step('attack:scalable','self:focusenergy')),
 plan('rain-water',step('weather:raindance'),step('attack:water','weather:rain')),
 plan('rain-thunder',step('weather:raindance'),step('move:thunder','weather:rain')),
 plan('rain-hurricane',step('weather:raindance'),step('move:hurricane','weather:rain')),
 plan('sun-fire',step('weather:sunnyday'),step('attack:fire','weather:sun')),
 plan('sun-solar-beam',step('weather:sunnyday'),step('move:solarbeam','weather:sun')),
 plan('sun-solar-blade',step('weather:sunnyday'),step('move:solarblade','weather:sun')),
 plan('sun-growth-attack',step('weather:sunnyday'),step('move:growth','weather:sun'),step('attack:special','weather:sun','self:spa')),
 plan('weather-weather-ball',step('weather:any'),step('move:weatherball','weather:any')),
 plan('hail-blizzard',step('weather:hail'),step('move:blizzard','weather:hail')),
 plan('sand-shore-up',step('weather:sandstorm'),step('move:shoreup','weather:sand','self:damaged')),
 plan('lock-on-inaccurate',step('lockon'),step('attack:inaccurate','self:lockon')),
 plan('endure-low-hp-attack',step('volatile:endure'),step('attack:low-hp','self:low-hp')),
 plan('stockpile-spit-up',step('volatile:stockpile'),step('move:spitup','self:stockpile')),
 plan('stockpile-swallow',step('volatile:stockpile'),step('move:swallow','self:stockpile','self:damaged')),
 ...expandedStrategyPatterns,
]);
for(const rule of strategyPatterns){for(const s of rule.steps){Object.freeze(s.requires);Object.freeze(s);}Object.freeze(rule.steps);Object.freeze(rule);}
const byTag=new Map();
for(const rule of strategyPatterns)for(const s of rule.steps)for(const tag of s.tag.split('|')){if(!byTag.has(tag))byTag.set(tag,new Set());byTag.get(tag).add(rule);}
const indexes=new WeakMap(),toId=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]/g,'');
function indexFor(dex){
 let index=indexes.get(dex);
 if(!index){const owner='strategy-metadata-'+(dex.currentMod||'native');index={traits:new BoundedCache({name:'move-strategy-traits',owner,limit:1024}),sets:new BoundedCache({name:'moveset-strategy-bindings',owner,limit:256})};indexes.set(dex,index);}
 return index;
}
function traits(dex,id){
 const index=indexFor(dex);let tags=index.traits.get(id);if(tags)return tags;
 const m=dex.moves.get(id);tags=new Set(['move:'+m.id]);
 for(const status of inflictedStatuses(m)){tags.add('inflict:'+status);tags.add('inflict:status');if(['psn','tox'].includes(status))tags.add('inflict:poison');}
 // Index both signs. Current Contrary/Simple/secondary suppression is checked
 // at lookup time, so static bindings survive ability and item changes.
 for(const boosts of selfBoostChanges(m))for(const [stat,n]of Object.entries(boosts))if(n){tags.add('boost:any');tags.add('boost:'+stat);if(['def','spd'].includes(stat))tags.add('boost:defense');}
 if(m.id==='acupressure')tags.add('boost:any');
 if(m.target==='normal'&&m.boosts)for(const [stat,n] of Object.entries(m.boosts))if(n<0)tags.add('drop:'+stat);
 if(m.volatileStatus)tags.add('volatile:'+m.volatileStatus);
 if(m.weather){tags.add('weather:'+toId(m.weather));tags.add('weather:any');tags.add('weather:speed');}
 if(m.terrain){tags.add('terrain:'+m.terrain);tags.add('terrain:any');tags.add('terrain:seed');}
 if(m.pseudoWeather)tags.add('field:'+m.pseudoWeather);
 if(m.sideCondition){tags.add('side:'+m.sideCondition);if(['reflect','lightscreen','auroraveil'].includes(m.sideCondition))tags.add('side:screen');}
 if(['trick','switcheroo'].includes(m.id))tags.add('item:transfer');
 if(m.id!=='lastresort')tags.add('history:unused');
 if(typeof m.accuracy==='number'&&m.accuracy<100&&!m.ohko)tags.add('accuracy:imperfect');
 if(['counter','mirrorcoat','metalburst'].includes(m.id))tags.add('attack:retaliation');
 if([m.secondary,...m.secondaries||[]].some(e=>e?.volatileStatus==='flinch'))tags.add('attack:flinch');
 if([m.secondary,...m.secondaries||[]].some(e=>e?.volatileStatus==='confusion'))tags.add('volatile:confusion');
 if(m.target==='self'&&(m.heal||['rest','synthesis','morningsun','moonlight','shoreup'].includes(m.id)))tags.add('heal');
 if(['protect','detect','kingsshield','spikyshield','banefulbunker','obstruct'].includes(m.id))tags.add('protect');
 if(['lockon','mindreader'].includes(m.id))tags.add('lockon');
 if(['reversal','flail'].includes(m.id))tags.add('attack:low-hp');
 if(m.category!=='Status'&&m.basePower>0&&!m.damage&&!m.damageCallback&&!m.ohko){
  tags.add('attack:scalable');tags.add('attack:'+toId(m.type));
  if(!m.overrideOffensivePokemon&&(!m.overrideOffensiveStat||m.overrideOffensiveStat===(m.category==='Physical'?'atk':'spa')))tags.add('attack:'+m.category.toLowerCase());
  tags.add('attack:vs-'+(m.overrideDefensiveStat||(m.category==='Physical'?'def':'spd')));
  if(m.priority>0)tags.add('attack:priority');if(m.priority===0)tags.add('attack:ordinary');
  if(m.flags?.sound)tags.add('attack:sound');
  if(typeof m.accuracy==='number'&&m.accuracy<100)tags.add('attack:inaccurate');
 }
 index.traits.set(id,tags);return tags;
}
export function compileStrategyMoveset(dex,moveIds){
 const ids=[...new Set(moveIds.map(toId))].sort(),key=STRATEGY_VERSION+'|'+ids.join(','),index=indexFor(dex);
 let bindings=index.sets.get(key);if(bindings)return bindings;
 const candidates=new Set();for(const id of ids)for(const tag of traits(dex,id))for(const rule of byTag.get(tag)||[])candidates.add(rule);
 bindings=Object.freeze([...candidates].map(rule=>{
  const moves=rule.steps.map(s=>Object.freeze(ids.filter(id=>s.tag.split('|').some(tag=>traits(dex,id).has(tag)))));
  return Object.freeze({rule,moves:Object.freeze(moves)});
 }));
 index.sets.set(key,bindings);return bindings;
}
function conditions(p){
 const foe=p.side.foe.active[0],facts=new Set(),weather=p.effectiveWeather();
 if(foe.status){facts.add('foe:status');facts.add('foe:'+foe.status);if(['psn','tox'].includes(foe.status))facts.add('foe:poison');}
 if(foe.hasAbility('comatose')){facts.add('foe:slp');facts.add('foe:status');}
 if(p.status==='slp'||p.hasAbility('comatose'))facts.add('self:slp');
 if(p.hp<p.maxhp)facts.add('self:damaged');if(p.hp<=p.maxhp/4)facts.add('self:low-hp');
 if(p.boosts.atk>0)facts.add('self:atk');if(p.boosts.spa>0)facts.add('self:spa');
 if(p.boosts.def>0)facts.add('self:def');if(p.boosts.spe>0)facts.add('self:spe');
 if(foe.boosts.def<0)facts.add('foe:def-down');if(foe.boosts.spd<0)facts.add('foe:spd-down');
 if(p.volatiles.stockpile?.layers>0)facts.add('self:stockpile');
 if(Object.values(p.boosts).some(n=>n>0))facts.add('self:boost');
 for(const id of ['substitute','defensecurl','charge','focusenergy','lockon'])if(p.volatiles[id])facts.add('self:'+id);
 if(foe.volatiles.leechseed)facts.add('foe:seed');
 if(p.lastMove&&traits(p.battle.dex,p.lastMove.id).has('protect'))facts.add('self:after-protect');
 if(weather){facts.add('weather:any');if(['raindance','primordialsea'].includes(weather))facts.add('weather:rain');if(['sunnyday','desolateland'].includes(weather))facts.add('weather:sun');if(['hail','snowscape'].includes(weather))facts.add('weather:hail');if(weather==='sandstorm')facts.add('weather:sand');}
 return facts;
}
function usableHint(p,move,tag,check){
 const foe=p.side.foe.active[0],bypasses=p.hasAbility(['moldbreaker','teravolt','turboblaze']);
 if(!expandedMoveEligible(p,move,tag,check))return false;
 if(p.status==='slp'&&p.statusState.time>(p.hasAbility('earlybird')?2:1)&&!move.sleepUsable)return false;
 if(p.volatiles.flinch)return false;
 if(tag.startsWith('inflict:')){
  if(foe.status)return false;
  if(move.flags?.powder&&(foe.hasType('Grass')||foe.hasItem('safetygoggles')||!bypasses&&foe.hasAbility('overcoat')))return false;
  const statuses=inflictedStatuses(move).filter(s=>tag==='inflict:status'||tag==='inflict:poison'?tag==='inflict:status'||['psn','tox'].includes(s):tag==='inflict:'+s);
  if(!statuses.length||statuses.every(status=>status==='slp'&&!bypasses&&foe.hasAbility(['insomnia','vitalspirit','sweetveil','comatose'])||['psn','tox'].includes(status)&&(!p.hasAbility('corrosion')&&foe.hasType(['Poison','Steel'])||!bypasses&&check('foe:poison-ability-immune'))||status==='par'&&foe.hasType('Electric')||status==='brn'&&foe.hasType('Fire')))return false;
  if(!move.status&&(p.hasAbility('sheerforce')||!bypasses&&foe.hasAbility('shielddust')||foe.hasItem('covertcloak')))return false;
  if(foe.side.sideConditions.safeguard&&!p.hasAbility('infiltrator'))return false;
  if(foe.isGrounded()&&(p.battle.field.terrain==='mistyterrain'||statuses.every(s=>s==='slp')&&p.battle.field.terrain==='electricterrain'))return false;
 }
 if(tag.startsWith('boost:')){
  if(move.id==='curse'&&p.hasType('Ghost'))return false;
  const changes=selfBoostChanges(move).filter((_,i)=>!p.hasAbility('sheerforce')||i===0&&(move.boosts||move.self?.boosts||move.selfBoost)),sign=p.hasAbility('contrary')?-1:1;
  const stat=tag.slice(6),matches=s=>stat==='any'||stat==='defense'?stat==='any'||['def','spd'].includes(s):s===stat;
  if(move.id==='acupressure'){if(sign<0||!Object.values(p.boosts).some(n=>n<6))return false;}
  else if(!changes.some(boosts=>Object.entries(boosts).some(([s,n])=>matches(s)&&n*sign>0&&p.boosts[s]<6)))return false;
 }
 if(tag.startsWith('drop:')&&(foe.hasAbility(['contrary','fullmetalbody'])||!bypasses&&foe.hasAbility(['clearbody','whitesmoke'])||!Object.entries(move.boosts||{}).some(([s,n])=>s===tag.slice(5)&&n<0&&foe.boosts[s]>-6)))return false;
 if(move.id==='bellydrum'&&p.hp<=p.maxhp/2)return false;
 if(move.id==='stockpile'&&p.volatiles.stockpile?.layers>=3)return false;
 if(move.id==='rest'&&(p.hp===p.maxhp||p.status==='slp'||p.hasAbility(['insomnia','vitalspirit','comatose'])))return false;
 if(tag==='lockon'&&p.volatiles.lockon)return false;
 if(tag==='heal'&&p.hp===p.maxhp)return false;
 if(move.volatileStatus==='substitute'&&(p.volatiles.substitute||p.hp<=p.maxhp/4))return false;
 if(move.volatileStatus==='leechseed'&&(foe.volatiles.leechseed||foe.hasType('Grass')))return false;
 if(['defensecurl','charge','focusenergy','lockon'].includes(move.volatileStatus)&&p.volatiles[move.volatileStatus])return false;
 if(tag.startsWith('weather:')&&toId(move.weather)===p.effectiveWeather())return false;
 if(tag==='protect'&&p.lastMove&&traits(p.battle.dex,p.lastMove.id).has('protect'))return false;
 return true;
}
export function strategyOrdering(p,choices){
 const dex=p.battle.dex,bindings=compileStrategyMoveset(dex,p.moveSlots.map(m=>m.id)),facts=conditions(p),check=createStrategyRequirements(p,facts),matches=[],priorities=choices.map(()=>0);
 const available=new Set(p.moveSlots.filter(m=>m.pp>0).map(m=>m.id));
 for(const {rule,moves} of bindings){
  if(rule.id.startsWith('poison-')&&rule.id!=='poison-venoshock'&&p.side.foe.active[0].hasAbility(['poisonheal','magicguard']))continue;
  for(let phase=rule.steps.length-1;phase>=0;phase--){
   const s=rule.steps[phase];if(!moves[phase].length)continue;
   if(moves.slice(phase+1).some(ids=>!ids.some(id=>available.has(id))))continue;
   if(!s.requires.every(check))continue;
   const next=choices.flatMap((choice,i)=>available.has(choice.id)&&moves[phase].includes(choice.id)&&s.tag.split('|').some(tag=>traits(dex,choice.id).has(tag)&&usableHint(p,dex.moves.get(choice.id),tag,check))?[i]:[]);
   if(!next.length)continue;
   // Specific finishers outrank a generic "attack while asleep/boosted" hint.
   const priority=phase>0?(s.tag.startsWith('move:')?12:s.tag==='attack:scalable'?6:8):4;
   for(const i of next)priorities[i]=Math.max(priorities[i],priority);
   matches.push({id:rule.id,phase,sequence:moves,nextSlots:next.map(i=>choices[i].slot)});break;
  }
 }
 return {priorities,matches};
}
