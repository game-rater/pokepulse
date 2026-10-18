import {applyBoosts,statusImmune} from './secondary-effects.mjs';
import {applyHeldDamage,activateBerry} from './held-items.mjs';
export function activateTerrainSeeds(state){
  for(let i=0;i<state.length;i++){
    const mon=state[i],terrain=mon.terrain;
    if(mon.hp<=0||mon.ability==='Klutz'||mon.item!==`${terrain} Seed`)continue;
    mon.item='';if(mon.ability==='Unburden')mon.unburden=true;applyBoosts(state,i,{[['Grassy','Electric'].includes(terrain)?'def':'spd']:1});
  }
}
export function absorbAttack(state,user,move,maxHP){
  const target=state[1-user];if(bypassAbility(state[user],move)||move.priority>0&&target.terrain==='Psychic'&&grounded(target))return false;
  const type=move.move_type,ability=target.ability;
  if(type==='Water'&&['Water Absorb','Dry Skin'].includes(ability)||type==='Electric'&&ability==='Volt Absorb'||type==='Ground'&&ability==='Earth Eater'){
    target.hp=Math.min(maxHP[1-user],target.hp+Math.max(1,Math.floor(maxHP[1-user]/4)));return true;
  }
  if(type==='Water'&&ability==='Storm Drain'||type==='Electric'&&ability==='Lightning Rod'){applyBoosts(state,1-user,{spa:1});return true;}
  if(type==='Electric'&&ability==='Motor Drive'){applyBoosts(state,1-user,{spe:1});return true;}
  if(type==='Fire'&&ability==='Flash Fire'){target.flashFire=true;return true;}
  return false;
}

export const protectMoves=new Set(['Protect','Detect',"King's Shield",'Spiky Shield','Baneful Bunker','Obstruct']);
export const chargeMoves=new Set(['Fly','Dig','Dive','Bounce','Phantom Force','Shadow Force','Solar Beam','Solar Blade','Sky Attack','Skull Bash','Razor Wind','Freeze Shock','Ice Burn','Meteor Beam','Geomancy']);
export const rechargeMoves=new Set(['Hyper Beam','Giga Impact','Blast Burn','Hydro Cannon','Frenzy Plant','Rock Wrecker','Roar of Time','Prismatic Laser','Meteor Assault','Eternabeam']);
export const rampageMoves=new Set(['Outrage','Thrash','Petal Dance']);
export const resistanceTypes={'Occa Berry':'Fire','Passho Berry':'Water','Wacan Berry':'Electric','Rindo Berry':'Grass','Yache Berry':'Ice','Chople Berry':'Fighting','Kebia Berry':'Poison','Shuca Berry':'Ground','Coba Berry':'Flying','Payapa Berry':'Psychic','Tanga Berry':'Bug','Charti Berry':'Rock','Kasib Berry':'Ghost','Haban Berry':'Dragon','Colbur Berry':'Dark','Babiri Berry':'Steel','Roseli Berry':'Fairy','Chilan Berry':'Normal'};
export const bypassAbility=(mon,move)=>['Mold Breaker','Teravolt','Turboblaze'].includes(mon.ability)||['Sunsteel Strike','Moongeist Beam','Photon Geyser','Light That Burns the Sky'].includes(move.name);
export const grounded=mon=>!mon.types.includes('Flying')&&mon.ability!=='Levitate'&&mon.item!=='Air Balloon';
export const indirect=(mon,damage)=>{if(mon.hp>0&&mon.ability!=='Magic Guard')mon.hp=Math.max(0,mon.hp-Math.max(1,Math.floor(damage)));};
export function extendState(mon,e,field,side){
  Object.assign(mon,{protect:'',substitute:e.substitute_hp??0,disguise:e.disguise_busted??(mon.ability==='Disguise'?null:false),recharge:e.recharge||false,charge:e.charging_move??null,semi:e.semi_invulnerable||'',rampage:e.rampage_move??null,rampageTurns:e.rampage_turns??null,
    taunt:e.taunted?(e.taunt_turns??null):0,disabled:e.disabled_moves||[],disableTurns:e.disabled_moves?.length?(e.disable_turns??null):0,encore:e.encore_move??null,encoreTurns:e.encore_move?(e.encore_turns??null):0,pendingTrap:false,roost:false,attempted:false,flashFire:!!e.flash_fire,unburden:!!e.unburden,micle:!!e.micle_boost,rolling:e.rolling_move??null,rollingHits:e.rolling_hits??0,defenseCurl:!!e.defense_curl,
    seeded:!!e.leech_seed,trapTurns:e.trap_turns===undefined?0:e.trap_turns,trapBand:!!e.binding_band,damageTaken:0,damageCategory:'',acted:false,natureUnknown:!!e.nature_unknown,unknownEffects:e.unknown_effects||[],
    reflect:!!side?.isReflect,reflectTurns:side?.isReflect?(e.reflect_turns??null):0,lightScreen:!!side?.isLightScreen,lightScreenTurns:side?.isLightScreen?(e.light_screen_turns??null):0,tailwind:!!side?.isTailwind,tailwindTurns:side?.isTailwind?(e.tailwind_turns??null):0,
    weather:field.weather||'',weatherTurns:field.weather?(e.weather_turns??null):0,trickRoom:!!field.isTrickRoom,trickRoomTurns:field.isTrickRoom?(e.trick_room_turns??null):0});
  if(e.nature_unknown&&((mon.ability==='Flash Fire'&&e.flash_fire===undefined)||(mon.ability==='Unburden'&&!mon.item&&e.unburden===undefined)))mon.unknownEffects=[...mon.unknownEffects,`${mon.ability} activation state`];
  if(e.terrain_turns!==undefined)mon.terrainTurns=e.terrain_turns;
  mon.rageConfusionPending=false;
  mon.micleTurns=mon.micle?(e.micle_turns??null):0;
  if(mon.status==='tox')mon.toxic=e.toxic_counter??null;
}
export function dynamicField(state,base){
  const side=m=>({isReflect:m.reflect,isLightScreen:m.lightScreen,isTailwind:m.tailwind});
  return {...base,weather:state[0].weather,terrain:state[0].terrain,isTrickRoom:state[0].trickRoom,attackerSide:side(state[0]),defenderSide:side(state[1])};
}
export function blockedByProtect(state,user,move,maxHP){
  const target=state[1-user],source=state[user];
  if(!target.protect||move.breaks_protect||source.ability==='Unseen Fist'&&move.contact||move.protectable===false||move.target_self)return false;
  if(["King's Shield",'Obstruct'].includes(target.protect)&&move.status_move)return false;
  if(move.contact){
    if(target.protect==='Spiky Shield')indirect(source,maxHP[user]/8);
    if(target.protect==="King's Shield")applyBoosts(state,user,{atk:-1},{source:1-user});
    if(target.protect==='Obstruct')applyBoosts(state,user,{def:-2},{source:1-user});
    if(target.protect==='Baneful Bunker'&&!source.status&&!statusImmune('psn',source))source.status='psn';
  }
  return true;
}
export function hitTarget(state,user,damage,move,maxHP,unknown){
  const target=state[1-user],source=state[user],bypass=bypassAbility(source,move);
  if(target.substitute&&!move.sound&&!move.bypass_substitute&&source.ability!=='Infiltrator'){
    const inflicted=Math.min(target.substitute,damage);target.substitute=Math.max(0,target.substitute-damage);return {damage:inflicted,substitute:true};
  }
  if(target.ability==='Disguise'&&!bypass&&damage>0){
    if(target.disguise===null){unknown('Disguise intact/busted state is unavailable.');return null;}
    if(!target.disguise){target.disguise=true;indirect(target,maxHP[1-user]/8);return {damage:0,disguise:true};}
  }
  if(target.ability==='Sturdy'&&!bypass&&target.hp===maxHP[1-user]&&damage>=target.hp)damage=target.hp-1;
  const hp=target.hp,inflicted=applyHeldDamage(target,damage,maxHP[1-user]);
  target.damageTaken+=inflicted;target.damageCategory=move.category;
  const superEffective=move.effectiveness>1;
  if(inflicted>0&&resistanceTypes[target.item]===move.move_type&&(superEffective||target.item==='Chilan Berry')&&!target.berryBlocked&&target.ability!=='Klutz')target.item=''; // calculator supplied reduced damage
  if(inflicted>0&&target.item==='Air Balloon')target.item='';
  if(inflicted>0&&target.hp>0&&target.item==='Weakness Policy'&&superEffective){target.item='';applyBoosts(state,1-user,{atk:2,spa:2});}
  if(inflicted>0&&target.hp>0&&target.item==='Absorb Bulb'&&move.move_type==='Water'){target.item='';applyBoosts(state,1-user,{spa:1});}
  if(inflicted>0&&target.hp>0&&target.item==='Cell Battery'&&move.move_type==='Electric'){target.item='';applyBoosts(state,1-user,{atk:1});}
  if(inflicted>0&&target.hp>0&&target.ability==='Stamina')applyBoosts(state,1-user,{def:1});
  if(inflicted>0&&target.hp>0&&target.ability==='Weak Armor'&&move.category==='Physical')applyBoosts(state,1-user,{def:-1,spe:2});
  if(inflicted>0&&target.hp>0&&target.ability==='Water Compaction'&&move.move_type==='Water')applyBoosts(state,1-user,{def:2});
  if(inflicted>0&&target.hp>0&&target.ability==='Justified'&&move.move_type==='Dark')applyBoosts(state,1-user,{atk:1});
  if(inflicted>0&&target.hp>0&&target.ability==='Rattled'&&['Dark','Ghost','Bug'].includes(move.move_type))applyBoosts(state,1-user,{spe:1});
  if(inflicted>0&&move.contact&&source.ability!=='Long Reach'&&source.item!=='Protective Pads'){
    if(['Rough Skin','Iron Barbs'].includes(target.ability))indirect(source,maxHP[user]/8);
    if(target.ability==='Gooey'||target.ability==='Tangling Hair')applyBoosts(state,user,{spe:-1},{source:1-user});
    if(target.ability==='Aftermath'&&hp>0&&target.hp===0&&!state.some(m=>m.ability==='Damp'))indirect(source,maxHP[user]/4);
  }
  return {damage:inflicted};
}
export function contactBranches(state,user,move){
  const target=state[1-user],source=state[user];
  const extra=branches=>{
    if(source.ability==='Poison Touch'&&move.contact&&source.ability!=='Long Reach')branches=branches.flatMap(b=>{
      if(b.state[1-user].hp<=0||b.state[1-user].status||b.state[1-user].ability==='Shield Dust'||b.state[1-user].item==='Covert Cloak'||statusImmune('psn',b.state[1-user],{terrain:b.state[1-user].terrain,weather:b.state[1-user].weather},b.state[user]))return [b];
      const s=structuredClone(b.state);s[1-user].status='psn';return [{...b,probability:b.probability*0.7},{state:s,probability:b.probability*0.3}];
    });
    if(target.ability==='Cursed Body'&&source.ability!=='Aroma Veil'&&move.move_index>=0&&source.pp[move.move_index]!==0&&!source.disabled.length)branches=branches.flatMap(b=>{const s=structuredClone(b.state);s[user].disabled=[move.name];s[user].disableTurns=4;return [{...b,probability:b.probability*0.7},{state:s,probability:b.probability*0.3}];});
    return branches;
  };
  if(!move.contact||source.ability==='Long Reach'||source.item==='Protective Pads'||source.hp<=0)return extra([{state,probability:1}]);
  const status={'Static':'par','Flame Body':'brn','Poison Point':'psn'}[target.ability];
  const statuses=target.ability==='Effect Spore'?['slp','psn','par']:status?[status]:[];
  if(!statuses.length||source.status||target.ability==='Effect Spore'&&(source.types.includes('Grass')||source.ability==='Overcoat'||source.item==='Safety Goggles'))return extra([{state,probability:1}]);
  const branches=[{state,probability:0.7}];
  for(const effect of statuses){
    if(statusImmune(effect,source,{terrain:source.terrain,weather:source.weather},target)){branches.push({state,probability:0.3/statuses.length});continue;}
    for(const duration of effect==='slp'?[2,3,4]:[null]){const s=structuredClone(state);s[user].status=effect;if(duration)s[user].sleep=duration;branches.push({state:s,probability:0.3/statuses.length/(effect==='slp'?3:1)});}
  }
  return extra(branches);
}
export function removeItem(state,user,move){
  const target=state[1-user],source=state[user];
  if(!target.item||target.ability==='Sticky Hold'&&!bypassAbility(source,move))return;
  if(!move.removable_item)return;
  if(move.name==='Knock Off')target.item='';
  if(['Thief','Covet'].includes(move.name)&&!source.item){source.item=target.item;target.item='';}
  if(['Bug Bite','Pluck'].includes(move.name)&&target.item.endsWith('Berry')){
    const berry=target.item;target.item='';
    if(berry==='Oran Berry')source.hp=Math.min(move.user_max_hp,source.hp+10);
    else if(berry==='Sitrus Berry')source.hp=Math.min(move.user_max_hp,source.hp+Math.max(1,Math.floor(move.user_max_hp/4)));
    else if(['Figy Berry','Wiki Berry','Mago Berry','Aguav Berry','Iapapa Berry'].includes(berry)){
      const old=source.item,hp=source.hp;source.item=berry;source.hp=Math.min(source.hp,Math.floor(move.user_max_hp/4));activateBerry(source,move.user_max_hp);source.hp=Math.min(move.user_max_hp,hp+Math.floor(move.user_max_hp/2));source.item=old;
    }else{const old=source.item;source.item=berry;activateBerry(source,move.user_max_hp);source.item=old;}
  }
}
export function finishTimers(state,unknown){
  for(const mon of state){
    for(const [active,counter] of [['reflect','reflectTurns'],['lightScreen','lightScreenTurns'],['tailwind','tailwindTurns'],['weather','weatherTurns'],['trickRoom','trickRoomTurns'],['terrain','terrainTurns']]){
      if(!mon[active])continue;
      if(mon[counter]===null){unknown(`${active}: remaining duration is unavailable.`);return false;}
      if(mon[counter]===-1)continue;
      if(--mon[counter]<=0){mon[active]=typeof mon[active]==='string'?'':false;mon[counter]=0;}
    }
    for(const [active,counter] of [['taunt','taunt'],['encore','encoreTurns'],['disabled','disableTurns']]){
      if(active==='disabled'?!mon.disabled.length:!mon[active]&&mon[active]!==null)continue;
      if(mon[counter]===null){unknown(`${active}: remaining duration is unavailable.`);return false;}
      if(--mon[counter]<=0){mon[active]=active==='disabled'?[]:active==='encore'?null:0;mon[counter]=0;}
    }
    mon.protect='';mon.damageTaken=0;mon.damageCategory='';mon.acted=false;mon.attempted=false;
    if(mon.micle){if(mon.micleTurns===null){unknown('Micle accuracy boost: remaining duration is unavailable.');return false;}if(--mon.micleTurns<=0)mon.micle=false;}
    if(mon.roost){mon.types=mon.originalTypes;mon.roost=false;}
  }
  return true;
}
export function residualEffects(state,maxHP,unknown,phase='weather',order=[0,1]){
  const weather=state[0].weather,suppressed=state.some(m=>['Air Lock','Cloud Nine'].includes(m.ability));
  for(const i of order){
    if(state.some(mon=>mon.hp<=0))break;
    const mon=state[i];if(mon.hp<=0)continue;
    if(phase==='weather'&&!suppressed){
      const immune=mon.item==='Safety Goggles'||['Magic Guard','Overcoat'].includes(mon.ability);
      if(weather==='Sand'&&!immune&&!mon.types.some(t=>['Rock','Ground','Steel'].includes(t))&&!['Sand Veil','Sand Rush','Sand Force'].includes(mon.ability))indirect(mon,maxHP[i]/16);
      if(weather==='Hail'&&!immune&&!mon.types.includes('Ice')&&mon.ability!=='Ice Body'&&mon.ability!=='Snow Cloak')indirect(mon,maxHP[i]/16);
      if(weather==='Rain'&&['Rain Dish','Dry Skin'].includes(mon.ability)||weather==='Hail'&&mon.ability==='Ice Body')mon.hp=Math.min(maxHP[i],mon.hp+Math.max(1,Math.floor(maxHP[i]/(mon.ability==='Dry Skin'?8:16))));
      if(weather==='Sun'&&['Solar Power','Dry Skin'].includes(mon.ability))indirect(mon,maxHP[i]/8);
    }
    if(phase==='seed'&&mon.seeded&&mon.ability!=='Magic Guard'&&state[1-i].hp>0){
      const amount=Math.min(mon.hp,Math.max(1,Math.floor(maxHP[i]/8)));mon.hp-=amount;
      if(state[1-i].hp>0){if(mon.ability==='Liquid Ooze')indirect(state[1-i],amount);else state[1-i].hp=Math.min(maxHP[1-i],state[1-i].hp+amount);}
    }
    if(phase==='trap'&&mon.trapTurns===null){unknown('Trapping damage: remaining duration is unavailable.');return false;}
    if(phase==='trap'&&mon.trapTurns>0){if(state[1-i].hp>0)indirect(mon,maxHP[i]/(mon.trapBand?6:8));mon.trapTurns--;}
    if(phase==='weather'&&mon.terrain==='Grassy'&&grounded(mon)&&mon.hp>0)mon.hp=Math.min(maxHP[i],mon.hp+Math.max(1,Math.floor(maxHP[i]/16)));
    if(phase==='status'&&mon.status==='tox'&&mon.toxic===null&&mon.ability!=='Magic Guard'&&mon.ability!=='Poison Heal'){unknown('Toxic poison: current damage counter is unavailable.');return false;}
  }
  return true;
}
