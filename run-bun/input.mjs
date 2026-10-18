import {STATS,validateField} from '../battle-engine.mjs';
import {nativeVolatiles,nativeSideConditions,nativeFieldConditions} from './live-effects.mjs';
import {observationProvenance} from './battle-state.mjs';
function effectMap(value,allowed,label,catalog){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error(`Invalid ${label}.`);
 const result={};
 for(const [id,props] of Object.entries(value)){
  if(!allowed.has(id)||!props||typeof props!=='object'||Array.isArray(props))throw Error(`Invalid ${label}.`);
  result[id]={};
  for(const [key,n] of Object.entries(props)){
   if(['source'].includes(key)){if(!['self','foe'].includes(n))throw Error(`Invalid ${label} source.`);}
   else if(['move','sourceEffect'].includes(key)){if(!catalog.moves.some(m=>m.name===n))throw Error(`Invalid ${label} move.`);}
   else if(!['duration','trueDuration','totalDamage','hitCount','contactHitCount','layers','def','spd','boundDivisor'].includes(key)||!Number.isInteger(n)||n<(['def','spd'].includes(key)?-6:0)||n>100000)throw Error(`Invalid ${label} counter.`);
   result[id][key]=n;
  }
 }
 return result;
}
// Adapters (JSON now, emulator later) return this same complete snapshot.
export function normalizeSnapshot(input,pack,catalog,{source='unattributed'}={}){
  if(!input || input.schema_version!==1 || input.game!=='run-bun')throw Error('Expected a version 1 Run & Bun snapshot.');
  const battle={},builds={},effects={},live={};
  const ids={};
  for(const side of ['player','opponent']){
    const p=input[side];if(!p || !pack.species.some(s=>s.id===p.species))throw Error(`Unknown ${side} species.`);
    ids[side]=p.species;
    if(!Number.isFinite(p.hp_percent)||p.hp_percent<0||p.hp_percent>100)throw Error('HP must be between 0 and 100.');
    battle[`${side}_hp`]=p.hp_percent;
    const b=p.build;
    if(!b || !Number.isInteger(b.level)||b.level<1||b.level>100 || !catalog.natures.includes(b.nature))throw Error('Invalid level or nature.');
    for(const [key,max,min] of [['evs',252,0],['ivs',31,0],['boosts',6,-6]])for(const stat of (key==='boosts'?[...STATS.filter(s=>s!=='hp'),'accuracy','evasion']:STATS))if(!Number.isInteger(b[key]?.[stat])||b[key][stat]<min||b[key][stat]>max)throw Error(`Invalid ${key}.`);
    if(Object.values(b.evs).reduce((a,b)=>a+b,0)>510)throw Error('Total EVs cannot exceed 510.');
    if(!['','brn','par','psn','tox','slp','frz'].includes(b.status)||typeof b.critical!=='boolean')throw Error('Invalid status or critical hit.');
    if(b.ability&&!catalog.abilities.includes(b.ability))throw Error(`Unknown ${side} ability: ${b.ability}.`);
    if(b.item&&!catalog.items.includes(b.item))throw Error(`Unknown ${side} item: ${b.item}.`);
    if(!Array.isArray(b.moves)||b.moves.length<1||b.moves.length>4||b.moves.some(m=>!catalog.moves.some(n=>n.name===m)))throw Error('Select one to four recognized moves.');
    builds[side]=structuredClone(b);
    if(p.actual_stats!==undefined){
      for(const stat of STATS)if(!Number.isInteger(p.actual_stats[stat])||p.actual_stats[stat]<1||p.actual_stats[stat]>999)throw Error('Invalid actual stats.');
      if(!Number.isInteger(p.current_hp)||p.current_hp<0||p.current_hp>p.actual_stats.hp)throw Error('Invalid exact HP.');
      if(Math.abs(p.hp_percent-100*p.current_hp/p.actual_stats.hp)>0.001)throw Error('Exact HP disagrees with percentage.');
      live[side]={actual_stats:structuredClone(p.actual_stats),current_hp:p.current_hp};
    }
    if(p.pp!==undefined){
      for(const move of b.moves)if(!Number.isInteger(p.pp[move])||p.pp[move]<0||p.pp[move]>64)throw Error('Invalid PP.');
      live[side]={...live[side],pp:structuredClone(p.pp)};
    }
    const e=p.effects||{};
    const extra={};
    for(const key of ['toxic_counter','taunt_turns','disable_turns','encore_turns','reflect_turns','light_screen_turns','tailwind_turns','trick_room_turns','weather_turns','terrain_turns','trap_turns','rampage_turns','micle_turns']){
      if(e[key]===undefined)continue;
      if(e[key]!==null&&(!Number.isInteger(e[key])||e[key]<(key==='toxic_counter'?0:1)||e[key]>255)&&!(['weather_turns','terrain_turns'].includes(key)&&e[key]===-1))throw Error(`Invalid ${key}.`);
      extra[key]=e[key];
    }
    for(const key of ['live_data','first_turn','move_history_known','transformed','truant_loafing','foresight','miracle_eye','nature_unknown','disguise_busted','recharge','leech_seed','binding_band','flash_fire','unburden','micle_boost','defense_curl']){
      if(e[key]!==undefined){if(typeof e[key]!=='boolean')throw Error(`Invalid ${key}.`);extra[key]=e[key];}
    }
    if(e.substitute_hp!==undefined){if(!Number.isInteger(e.substitute_hp)||e.substitute_hp<0||e.substitute_hp>999)throw Error('Invalid substitute HP.');extra.substitute_hp=e.substitute_hp;}
    if(e.personality!==undefined){if(!Number.isInteger(e.personality)||e.personality<0||e.personality>0xffffffff)throw Error('Invalid personality.');extra.personality=e.personality;}
    for(const key of ['charging_move','rampage_move','last_move','battle_last_move','rolling_move'])if(e[key]!==undefined){if(!catalog.moves.some(m=>m.name===e[key]))throw Error(`Invalid ${key}.`);extra[key]=e[key];}
    if(e.types!==undefined){if(!Array.isArray(e.types)||!e.types.length||e.types.length>3||e.types.some(t=>!['Normal','Fighting','Flying','Poison','Ground','Rock','Bug','Ghost','Steel','Fire','Water','Grass','Electric','Psychic','Ice','Dragon','Dark','Fairy'].includes(t)))throw Error('Invalid live types.');extra.types=[...e.types];}
    if(e.slow_start_turns!==undefined){if(!Number.isInteger(e.slow_start_turns)||e.slow_start_turns<0||e.slow_start_turns>5)throw Error('Invalid Slow Start counter.');extra.slow_start_turns=e.slow_start_turns;}
    if(e.autotomize_count!==undefined){if(!Number.isInteger(e.autotomize_count)||e.autotomize_count<0||e.autotomize_count>255)throw Error('Invalid Autotomize counter.');extra.autotomize_count=e.autotomize_count;}
    if(e.used_moves!==undefined){if(!Array.isArray(e.used_moves)||e.used_moves.some(m=>!b.moves.includes(m)))throw Error('Invalid used move history.');extra.used_moves=[...e.used_moves];}
    for(const [key,allowed] of [['native_volatiles',nativeVolatiles],['native_side_conditions',nativeSideConditions],['native_field_conditions',nativeFieldConditions]])if(e[key]!==undefined)extra[key]=effectMap(e[key],allowed,key,catalog);
    if(e.pending_wish!==undefined){const w=e.pending_wish;if(!w||!Number.isInteger(w.turns)||w.turns<1||w.turns>2||!Number.isInteger(w.hp)||w.hp<1||w.hp>999)throw Error('Invalid pending Wish.');extra.pending_wish={turns:w.turns,hp:w.hp};}
    if(e.pending_future!==undefined){const f=e.pending_future,s=f?.snapshot;
     if(!f||!Number.isInteger(f.turns)||f.turns<1||f.turns>3||!['self','foe'].includes(f.source)||!catalog.moves.some(m=>m.name===f.move)||!s||!pack.species.some(p=>p.name===s.species)||!Number.isInteger(s.level)||s.level<1||s.level>100||STATS.some(stat=>!Number.isInteger(s.actual_stats?.[stat])||s.actual_stats[stat]<1||s.actual_stats[stat]>999)||Object.values(s.boosts||{}).some(n=>!Number.isInteger(n)||n< -6||n>6)||s.ability&&!catalog.abilities.includes(s.ability)||s.item&&!catalog.items.includes(s.item))throw Error('Invalid pending future attack.');
     extra.pending_future=structuredClone(f);
    }
    if(e.rolling_hits!==undefined){if(!Number.isInteger(e.rolling_hits)||e.rolling_hits<0||e.rolling_hits>4)throw Error('Invalid rolling hit count.');extra.rolling_hits=e.rolling_hits;}
    if(e.semi_invulnerable!==undefined){if(!['air','underground','underwater','vanished'].includes(e.semi_invulnerable))throw Error('Invalid semi-invulnerable state.');extra.semi_invulnerable=e.semi_invulnerable;}
    if(e.unknown_effects!==undefined){if(!Array.isArray(e.unknown_effects)||e.unknown_effects.some(x=>typeof x!=='string'||x.length>150)||e.unknown_effects.length>20)throw Error('Invalid unknown effects.');extra.unknown_effects=e.unknown_effects;}
    if(e.focus_energy!==undefined&&typeof e.focus_energy!=='boolean')throw Error('Focus Energy must be true or false.');
    if(e.protect_streak!==undefined&&e.protect_streak!==null&&(!Number.isInteger(e.protect_streak)||e.protect_streak<0||e.protect_streak>255))throw Error('Invalid protection counter.');
    if(e.sleep_counter!==undefined&&(!Number.isInteger(e.sleep_counter)||e.sleep_counter<1||e.sleep_counter>7||b.status!=='slp'))throw Error('Invalid sleep counter.');
    if(e.confusion_turns!==undefined&&(!Number.isInteger(e.confusion_turns)||e.confusion_turns<1||e.confusion_turns>7))throw Error('Invalid confusion counter.');
    if(e.taunted!==undefined&&typeof e.taunted!=='boolean')throw Error('Taunted must be true or false.');
    for(const k of ['encore_move','locked_move'])if(e[k]!==undefined && !b.moves.includes(e[k]))throw Error(`${k} must be a selected move.`);
    if(e.disabled_moves!==undefined&&(!Array.isArray(e.disabled_moves)||e.disabled_moves.some(m=>!b.moves.includes(m))))throw Error('Disabled moves must be selected moves.');
    effects[side]={...extra,...(e.focus_energy!==undefined?{focus_energy:e.focus_energy}:{}),taunted:e.taunted||false,disabled_moves:e.disabled_moves||[],...(e.protect_streak!==undefined?{protect_streak:e.protect_streak}:{}),...(e.encore_move?{encore_move:e.encore_move}:{}),...(e.locked_move?{locked_move:e.locked_move}:{}),...(e.sleep_counter!==undefined?{sleep_counter:e.sleep_counter}:{}),...(e.confusion_turns!==undefined?{confusion_turns:e.confusion_turns}:{})};
  }
  validateField(input.field,8);
  live.observation_provenance=observationProvenance(input,source);
  return {...ids,battle,builds,field:structuredClone(input.field),effects:structuredClone(effects),live};
}
