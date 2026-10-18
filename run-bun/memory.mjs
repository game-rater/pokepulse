// Run & Bun 1.07 RAM decoder. No emulator, HTTP, filesystem, or scoring dependency.
import {readBattleIdentity} from './identity.mjs';
import {decodeLiveEffects} from './live-effects.mjs';
export const ROM_SHA1='cceadcd453d36e120b9a4e01e71f4003cf463716';
export const ROM_CRC32='0b5a9694';
export const layout={battleMons:0x233fc,battlerSize:92,battlersCount:0x233e4,positions:0x233ee,inBattle:0x426f9,weather:0x237c8,sideStatuses:0x23610,fieldStatuses:0x23a58,restrictionStride:40,disabledMove:0x2366c,protectStreak:0x23670,disableTimer:0x23677,encoreMove:0x2366e,encoreTimer:0x23679,tauntTimer:0x2367e};
// ROM-disassembled and observed live in 1.07: selection -> two queued
// action slots -> end-turn processing -> selection with an incremented counter.
export const phaseLayout={callback:0x45d04,turn:0x45d23,action:0x233fa,actionKind:0x233fb,order:0x233f6,selection:0x0803be39,actions:0x0803e371,endTurn:0x0803ba25};
export function readBattlePhase(ram){
 const callback=ram.readUInt32LE(phaseLayout.callback),action=ram[phaseLayout.action];
 const kind=callback===phaseLayout.selection?'selection':callback===phaseLayout.actions?'resolving':callback===phaseLayout.endTurn?'end-turn':'transition';
 return {kind,callback,turn:ram[phaseLayout.turn],action_index:action,action_kind:ram[phaseLayout.actionKind],order:[...ram.subarray(phaseLayout.order,phaseLayout.order+2)]};
}
const stats=['hp','atk','def','spe','spa','spd'];
const id=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
export function decodeMemory(ram,maps,catalog) {
 if(ram.length!==0x48000)throw Error('Incomplete memory capture.');
 if(!(ram[layout.inBattle]&2))return {status:'outside-battle',message:'Connected · waiting for a battle'};
 const count=ram[layout.battlersCount];
 if(count>2)return {status:'unsupported',message:'Double battles are not supported yet'};
 if(count!==2)return {status:'waiting',message:'Battle starting · waiting for both Pokémon'};
 // Values verified by executing the corresponding moves in the isolated 1.07 game.
 // 0x5 was observed in the native arena Kyogre/Drizzle battle.
 const weatherNames=new Map([[0,''],[1,'Rain'],[5,'Rain'],[0x40,'Sun'],[0x10,'Sand'],[0x200,'Hail']]);
 const weather=weatherNames.get(ram.readUInt16LE(layout.weather));
 if(weather===undefined)return {status:'unsupported',message:'Weather state not yet verified · estimate unavailable'};
 const fieldFlags=ram.readUInt32LE(layout.fieldStatuses);
 const terrains=[[0x40,'Grassy'],[0x80,'Misty'],[0x100,'Electric'],[0x200,'Psychic']].filter(([bit])=>fieldFlags&bit);
 if(terrains.length>1)throw Error('Field data is still changing.');
 const sideField=side=>{const flags=ram.readUInt32LE(layout.sideStatuses+side*4);return {reflect:!!(flags&1),light_screen:!!(flags&2),tailwind:!!(flags&0x400)};};
 const activeStatus2=[];
 const mon=index=>{
  const p=layout.battleMons+index*layout.battlerSize;
  const u16=o=>ram.readUInt16LE(p+o), u32=o=>ram.readUInt32LE(p+o);
  const name=maps.mons[u16(0)-1];
  if(!name||!catalog.species.has(id(name)))throw Error('Unrecognized active species.');
  const actual_stats={hp:u16(46),atk:u16(2),def:u16(4),spe:u16(6),spa:u16(8),spd:u16(10)};
  const hp=u16(42),level=ram[p+44];
  if(level<1||level>100||hp>actual_stats.hp||Object.values(actual_stats).some(s=>s<1||s>999))throw Error('Battler data is still changing.');
  const moves=[],pp={};
  for(let j=0;j<4;j++) {
   const mid=u16(12+j*2);if(!mid)continue;
   const move=maps.move[mid];if(!catalog.moves.has(move))throw Error('Unrecognized active move.');
   moves.push(move);pp[move]=ram[p+37+j];
  }
  if(!moves.length)throw Error('Waiting for active moves.');
  const ability=u16(32)?maps.abilityIds[u16(32)]:'';
  const item=u16(48)?maps.item[u16(48)-1]:'';
  if(u16(32)&&!catalog.abilities.has(ability)||item&&!catalog.items.has(item))throw Error('Unrecognized ability or held item.');
  const boosts={};for(const [stat,offset] of [['atk',25],['def',26],['spe',27],['spa',28],['spd',29],['accuracy',30],['evasion',31]]){
   const stage=ram[p+offset];if(stage>12)throw Error('Invalid stat stage.');boosts[stat]=stage-6;
  }
  const ivBits=u32(20), ivs={};stats.forEach((s,j)=>ivs[s]=(ivBits>>>(5*j))&31);
  const s=u32(80), status2=u32(84), status=s&7?'slp':s&0x80?'tox':s&8?'psn':s&16?'brn':s&32?'frz':s&64?'par':'';
  const confusionTurns=status2&7;
  const unknownEffects=[];
  const liveState=decodeLiveEffects(ram,index,maps,{status,status2,fieldFlags,weather,ability,item,moves,
   positions:[...ram.subarray(layout.positions,layout.positions+2)]});
  unknownEffects.push(...liveState.unknown);
  if(liveState.unknown.length)activeStatus2.push(name);
  const future=liveState.effects.pending_future;
  if(future){
   const f=future.mon_offset,sourceName=maps.mons[ram.readUInt16LE(f)-1];
   const sourceStats=Object.fromEntries(stats.map((stat,j)=>[stat,ram.readUInt16LE(f+(j===0?46:j*2))]));
   const sourceAbility=maps.abilityIds[ram.readUInt16LE(f+32)],sourceItem=ram.readUInt16LE(f+48);
   const sourceBoosts=Object.fromEntries(['atk','def','spe','spa','spd','accuracy','evasion'].map((stat,j)=>[stat,ram[f+25+j]-6]));
   future.source=future.source===index?'self':'foe';delete future.mon_offset;
   future.snapshot={species:sourceName,actual_stats:sourceStats,current_hp:ram.readUInt16LE(f+42),focus_energy:!!(ram.readUInt32LE(f+84)&0x100000),level:ram[f+44],boosts:sourceBoosts,
    ability:sourceAbility==='-------'?'':sourceAbility||'',item:sourceItem?maps.item[sourceItem-1]:''};
   if(!sourceName||!future.move||Object.values(sourceStats).some(n=>n<1||n>999))unknownEffects.push('future attack source is unavailable');
  }
  const r=index*layout.restrictionStride;
  const restrictionMove=(address,timer)=>{
   if(!(ram[timer+r]&15))return undefined;
   const move=maps.move[ram.readUInt16LE(address+r)];
   if(!moves.includes(move))throw Error('Move restriction data is still changing.');
   return move;
  };
  const disabled=restrictionMove(layout.disabledMove,layout.disableTimer),encore=restrictionMove(layout.encoreMove,layout.encoreTimer);
  const identity=readBattleIdentity(ram,p,maps);
  return {species:id(name),hp_percent:100*hp/actual_stats.hp,current_hp:hp,actual_stats,pp,
   build:{level,nature:identity?.nature||'Serious',...(identity?{happiness:identity.friendship}:{}),ivs,evs:Object.fromEntries(stats.map(s=>[s,0])),boosts,status,ability:ability==='None'?'':ability,item,critical:false,moves},
   effects:{...liveState.effects,live_data:true,nature_unknown:!identity,...(identity?{personality:identity.personality}:{}),unknown_effects:unknownEffects,taunted:!!(ram[layout.tauntTimer+r]&15),...(ram[layout.tauntTimer+r]&15?{taunt_turns:ram[layout.tauntTimer+r]&15}:{}),disabled_moves:disabled?[disabled]:[],...(disabled?{disable_turns:ram[layout.disableTimer+r]&15}:{}),protect_streak:ram[layout.protectStreak+r],...(encore?{encore_move:encore,encore_turns:ram[layout.encoreTimer+r]&15}:{}),...(status==='slp'?{sleep_counter:s&7}:{}),...(confusionTurns?{confusion_turns:confusionTurns}:{})}};
 };
 const positions=[...ram.subarray(layout.positions,layout.positions+2)];
 const playerIndex=positions.findIndex(p=>(p&1)===0),opponentIndex=positions.findIndex(p=>(p&1)===1);
 if(playerIndex<0||opponentIndex<0)throw Error('Waiting for battler positions.');
 return {status:'battle',snapshot:{schema_version:1,game:'run-bun',battle_phase:readBattlePhase(ram),player:mon(playerIndex),opponent:mon(opponentIndex),
  field:{weather,terrain:terrains[0]?.[1]||'',trick_room:!!(fieldFlags&2),player:sideField(0),opponent:sideField(1)}},
  warnings:[...(activeStatus2.length?[`${activeStatus2.join(' and ')}: inconsistent or unrecognized live effect data; affected forecasts remain unresolved.`]:[])]};
}
export function decodeCapture(buffer,maps,catalog,{acceptedRomCrc32=[]}={}) {
 if(buffer.length!==0x48000+20||buffer.toString('ascii',0,8)!=='PTHREAT1'||buffer.readUInt32LE(12)!==buffer.readUInt32LE(buffer.length-4))throw Error('Incomplete bridge packet.');
 const crc=buffer.subarray(8,12).toString('hex');
 if(crc!==ROM_CRC32&&!acceptedRomCrc32.includes(crc))return {status:'unsupported',message:'Unsupported ROM · this adapter requires a verified Run & Bun 1.07 or Athena arena build'};
 return decodeMemory(buffer.subarray(16,-4),maps,catalog);
}
