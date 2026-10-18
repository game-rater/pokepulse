import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {fastMoves,nativeInteractionReasons} from './mechanics-contract.mjs';
const require=createRequire(import.meta.url);
const {Battle}=require('../vendor/showdown/dist/sim/battle.js');
const {Dex,toID}=require('../vendor/showdown/dist/sim/dex.js');
const {Pokemon}=require('../vendor/showdown/dist/sim/pokemon.js');
export const completeMoveDex=Dex.mod('runbun');
export function genderFromIdentity(species,personality,explicit){
  const data=completeMoveDex.species.get(species);
  if(data.gender)return data.gender;
  if(['M','F'].includes(explicit))return explicit;
  if(personality===undefined)return undefined;
  return (personality&255)<Math.floor(data.genderRatio.F*255)?'F':'M';
}
export {nativeInteractionReasons} from './mechanics-contract.mjs';
export function requiresCompleteMoves(snapshot){
  if(nativeInteractionReasons(snapshot).length)return true;
  if([snapshot.player,snapshot.opponent].some(s=>s.effects?.native_volatiles||s.effects?.native_side_conditions||s.effects?.native_field_conditions||s.effects?.pending_wish||s.effects?.pending_future||s.effects?.transformed||s.effects?.charging_move||s.effects?.recharge||s.effects?.autotomize_count||s.effects?.types&&s.effects.types.join('/')!==completeMoveDex.species.get(s.species).types.join('/')))return true;
  if([snapshot.player,snapshot.opponent].some(s=>['Prankster','Protean','Libero','Color Change','Mimicry','Magic Bounce','Triage','Truant','Slow Start'].includes(s.build.ability)||['Quick Claw','Custap Berry','Lagging Tail','Full Incense','Micle Berry'].includes(s.build.item)||s.effects?.micle_boost))return true;
  return [snapshot.player,snapshot.opponent].some(side=>side.build.moves.some(name=>{
    if(fastMoves.has(name))return false;
    const move=completeMoveDex.moves.get(name);
    const callbacks=Object.keys(move).some(key=>typeof move[key]==='function');
    const basicStatus=move.boosts||move.status||move.heal;
    return move.category==='Status'&&!basicStatus||move.flags?.powder||move.volatileStatus||move.forceSwitch||move.selfSwitch||callbacks;
  }));
}
const seed=[1,2,3,4];
const pinchBerries=new Set(['figyberry','wikiberry','magoberry','aguavberry','iapapaberry']);
class RandomDraw extends Error {constructor(choices){super('Enumerate chance');this.choices=choices;}}
export class MissingInput extends Error {}

// Full move callbacks execute inside their native engine. The adapter enumerates
// randomness; it neither supplies trainer AI nor samples/renormalizes chance.
export function installChanceTape(battle,tape=[],unknownNature=[false,false],uncertain={},sample=null){
  let cursor=0;
  const choose=choices=>{
    choices=choices.filter(c=>c.probability>0);
    if(choices.length===1)return choices[0].value;
    if(sample){let roll=sample(choices);for(const c of choices){roll-=c.probability;if(roll<0)return c.value;}return choices.at(-1).value;}
    if(cursor>=tape.length)throw new RandomDraw(choices);
    return tape[cursor++];
  };
  battle.prng.randomChance=(n,d)=>choose([{value:true,probability:n/d},{value:false,probability:1-n/d}]);
  battle.prng.random=(from,to)=>{
    if(from===undefined)throw Error('Unbounded random draw in the move engine');
    if(to===undefined){to=from;from=0;}
    const count=Math.floor(to)-Math.floor(from);
    return choose(Array.from({length:count},(_,i)=>({value:Math.floor(from)+i,probability:1/count})));
  };
  const getDamage=battle.actions.getDamage.bind(battle.actions);
  battle.actions.getDamage=(source,target,move,...args)=>{
    if(source.set.critical&&move&&typeof move==='object')move.willCrit=true;
    return getDamage(source,target,move,...args);
  };
  battle.sides.forEach((side,i)=>side.pokemon.forEach(p=>{
    const addVolatile=p.addVolatile.bind(p);
    p.addVolatile=(status,source,...args)=>{
      if(toID(status)==='attract'&&uncertain.unknownGender?.some(Boolean)&&
        !(['N',''].includes(p.gender)&&!uncertain.unknownGender[i])&&
        !(['N',''].includes(source?.gender)&&!uncertain.unknownGender[source.side.id==='p1'?0:1]))
        throw new MissingInput('Attraction requires the live Pokémon genders.');
      return addVolatile(status,source,...args);
    };
    const eat=p.eatItem.bind(p);
    p.eatItem=(...args)=>{
      if(unknownNature[i]&&pinchBerries.has(p.item))throw new MissingInput('Pinch berry flavor requires the live nature');
      return eat(...args);
    };
  }));
  for(const method of ['runMove','useMove']){
    const run=battle.actions[method].bind(battle.actions);
    battle.actions[method]=(move,pokemon,...args)=>{
      const id=toID(move),i=pokemon.side.id==='p1'?0:1;
      if(['fakeout','firstimpression','matblock'].includes(id)&&uncertain.unknownFirst?.[i])throw new MissingInput('First-turn move eligibility requires an observed entry or completed turn.');
      if(['attract','captivate'].includes(id)&&uncertain.unknownGender?.some(Boolean))throw new MissingInput('This move requires the live Pokémon genders.');
      if(['mimic','sketch','mirrormove','disable','encore','spite','eeriespell','instruct'].includes(id)&&uncertain.unknownHistory?.[1-i]&&!battle.sides[1-i].active[0].lastMove)throw new MissingInput('This move requires the opponent’s previous move.');
      if(id==='copycat'&&!battle.lastMove&&uncertain.unknownHistory?.some(Boolean))throw new MissingInput('Copycat requires the previous battle move.');
      return run(move,pokemon,...args);
    };
  }
}
export function packed(battle,unknownNature=[false,false],uncertain={}){
  const saved=battle.toJSON();
  // Message history does not influence mechanics. Move/volatile histories do.
  saved.log=[];saved.inputLog=[];saved.messageLog=[];saved.sentLogPos=0;saved.lastMoveLine=-1;
  const turn=saved.turn;
  const key=JSON.stringify(saved,(name,value)=>name==='turn'?0:['lastTurn','endingTurn','startingTurn'].includes(name)&&typeof value==='number'?value-turn:
    name==='activeTurns'?Math.min(2,value):value);
  return {kind:'decision',saved,unknownNature,...uncertain,key:createHash('sha256').update(key+JSON.stringify([unknownNature,uncertain])).digest('hex')};
}
function addVolatile(battle,p,name,props={}){p.addVolatile(name,p);if(p.volatiles[name])Object.assign(p.volatiles[name],props);}
export function createCompleteBattle(snapshot){
  const sides=[snapshot.player,snapshot.opponent];
  const team=side=>[{...side.build,species:side.species,gender:genderFromIdentity(side.species,side.effects?.personality,side.build.gender)||'N',name:side.species}];
  const battle=new Battle({formatid:'runbun',seed,p1:{name:'Player',team:team(sides[0])},p2:{name:'Opponent',team:team(sides[1])}});
  const unknownNature=sides.map(s=>!!s.effects?.nature_unknown);
  const uncertain={unknownFirst:sides.map(s=>!!s.effects?.live_data&&s.effects.first_turn===undefined),
    unknownGender:sides.map(s=>genderFromIdentity(s.species,s.effects?.personality,s.build.gender)===undefined),
    unknownHistory:sides.map(s=>!!s.effects?.live_data&&!s.effects.move_history_known&&!s.effects.last_move)};
  battle.sides.forEach((side,i)=>{
    const input=sides[i],p=side.active[0],e=input.effects||{};
    if(input.actual_stats){p.maxhp=input.actual_stats.hp;p.baseMaxhp=p.maxhp;p.storedStats={...input.actual_stats};delete p.storedStats.hp;if(!e.transformed)p.baseStoredStats={...p.storedStats};}
    p.hp=input.current_hp??p.maxhp;p.fainted=p.hp<=0;
    p.boosts={atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0,...input.build.boosts};
    p.status=input.build.status||'';p.statusState=battle.initEffectState({id:p.status,target:p});
    if(p.status==='slp')p.statusState.time=e.sleep_counter??0;
    if(p.status==='tox')p.statusState.stage=e.toxic_counter??0;
    p.item=toID(input.build.item||'');p.itemState=battle.initEffectState({id:p.item,target:p});
    for(const slot of p.moveSlots){const pp=input.pp?.[slot.move]??input.pp?.[completeMoveDex.moves.get(slot.id).name];if(pp!==undefined&&pp!==null)slot.pp=pp;}
    if(e.used_moves)for(const slot of p.moveSlots)slot.used=e.used_moves.includes(slot.move);
    if(e.autotomize_count)p.weighthg=Math.max(1,p.weighthg-1000*e.autotomize_count);
    if(e.confusion_turns)addVolatile(battle,p,'confusion',{time:e.confusion_turns});
    if(e.focus_energy)addVolatile(battle,p,'focusenergy');
    if(e.protect_streak>0)addVolatile(battle,p,'stall',{duration:1,counter:3**Math.min(6,e.protect_streak)});
    if(e.taunted)addVolatile(battle,p,'taunt',{duration:e.taunt_turns});
    if(e.encore_move)addVolatile(battle,p,'encore',{move:toID(e.encore_move),duration:e.encore_turns});
    if(e.disabled_moves?.length)addVolatile(battle,p,'disable',{move:toID(e.disabled_moves[0]),duration:e.disable_turns});
    if(e.substitute_hp)addVolatile(battle,p,'substitute',{hp:e.substitute_hp});
    if(e.leech_seed)addVolatile(battle,p,'leechseed',{source:battle.sides[1-i].active[0],sourceSlot:battle.sides[1-i].active[0].getSlot()});
    if(e.recharge)addVolatile(battle,p,'mustrecharge');
    if(e.last_move)p.lastMove=completeMoveDex.getActiveMove(e.last_move);
    if(e.foresight)addVolatile(battle,p,'foresight');
    if(e.miracle_eye)addVolatile(battle,p,'miracleeye');
    if(e.first_turn===false){p.activeTurns=2;p.activeMoveActions=1;}
    if(e.first_turn===true){p.activeTurns=1;p.activeMoveActions=0;}
    if(e.types)p.types=[...e.types];
    if(e.transformed)p.transformed=true;
    if(e.locked_move){p.volatiles.choicelock=battle.initEffectState({id:'choicelock',target:p,move:toID(e.locked_move)});}
    if(e.flash_fire)addVolatile(battle,p,'flashfire');
    if(e.unburden)addVolatile(battle,p,'unburden');
    if(e.micle_boost)addVolatile(battle,p,'micleberry');
    if(e.truant_loafing!==undefined){delete p.volatiles.truant;if(e.truant_loafing)addVolatile(battle,p,'truant');}
    if(e.slow_start_turns!==undefined){if(e.slow_start_turns)p.abilityState.counter=e.slow_start_turns;else delete p.abilityState.counter;}
    for(const [id,data] of Object.entries(e.native_volatiles||{})){
      const source=data.source==='foe'?battle.sides[1-i].active[0]:p,props={...data};delete props.source;
      if(props.move)props.move=toID(props.move);
      if(props.sourceEffect)props.sourceEffect=completeMoveDex.moves.get(props.sourceEffect);
      p.volatiles[id]=battle.initEffectState({id,target:p,source,sourceSlot:source.getSlot(),...props});
      if(id==='bide')p.volatiles[id].lastDamageSource=source;
      if(id==='leechseed')p.volatiles[id].sourceSlot=source.getSlot();
      if(id==='partiallytrapped')p.volatiles[id].boundDivisor=source.item==='bindingband'?6:8;
    }
    if(e.charging_move){
      const move=toID(e.charging_move),target=battle.sides[1-i].active[0];
      p.volatiles.twoturnmove=battle.initEffectState({id:'twoturnmove',target:p,source:p,move,duration:1});
      p.volatiles[move]=battle.initEffectState({id:move,target:p,source:p,targetLoc:p.getLocOf(target)});
      p.lastMove=completeMoveDex.getActiveMove(move);p.lastMoveTargetLoc=p.getLocOf(target);
    }
  });
  const field=snapshot.field||{};
  battle.field.clearWeather();battle.field.clearTerrain();
  const weather={Sun:'sunnyday',Rain:'raindance',Sand:'sandstorm',Hail:'hail'}[field.weather];
  if(weather)battle.field.setWeather(weather,battle.p1.active[0]);
  if(field.terrain)battle.field.setTerrain(toID(field.terrain)+'terrain',battle.p1.active[0]);
  if(field.isTrickRoom)battle.field.addPseudoWeather('trickroom',battle.p1.active[0]);
  const effect=sides.find(s=>s.effects?.weather_turns!==undefined)?.effects;
  if(weather&&effect){if(effect.weather_turns===-1)delete battle.field.weatherState.duration;else battle.field.weatherState.duration=effect.weather_turns;}
  const terrainEffect=sides.find(s=>s.effects?.terrain_turns!==undefined)?.effects;
  if(field.terrain&&terrainEffect){if(terrainEffect.terrain_turns===-1)delete battle.field.terrainState.duration;else battle.field.terrainState.duration=terrainEffect.terrain_turns;}
  const roomEffect=sides.find(s=>s.effects?.trick_room_turns!==undefined)?.effects;
  if(field.isTrickRoom&&roomEffect)battle.field.pseudoWeather.trickroom.duration=roomEffect.trick_room_turns;
  for(let i=0;i<2;i++){
    const conditions=i?field.defenderSide:field.attackerSide,e=sides[i].effects||{};
    for(const [flag,id,counter] of [['isReflect','reflect','reflect_turns'],['isLightScreen','lightscreen','light_screen_turns'],['isTailwind','tailwind','tailwind_turns']]){
      if(!conditions?.[flag])continue;battle.sides[i].addSideCondition(id,battle.sides[i].active[0]);if(e[counter]!==undefined)battle.sides[i].sideConditions[id].duration=e[counter];
    }
    const p=battle.sides[i].active[0];
    for(const [id,props] of Object.entries(e.native_side_conditions||{}))battle.sides[i].sideConditions[id]=battle.initEffectState({id,target:battle.sides[i],source:p,sourceSlot:p.getSlot(),...props});
    for(const [id,props] of Object.entries(e.native_field_conditions||{}))battle.field.pseudoWeather[id]=battle.initEffectState({id,source:p,sourceSlot:p.getSlot(),...props});
    if(e.pending_wish){const w=e.pending_wish;battle.sides[i].slotConditions[0].wish=battle.initEffectState({id:'wish',target:battle.sides[i],isSlotCondition:true,source:p,sourceSlot:p.getSlot(),hp:w.hp,startingTurn:battle.getOverflowedTurnCount()+w.turns-2});}
    if(e.pending_future){
      const f=e.pending_future,s=f.snapshot,sourceSide=f.source==='foe'?battle.sides[1-i]:battle.sides[i];
      const source=new Pokemon({species:s.species,level:s.level,nature:'Serious',moves:[f.move],ability:s.ability,item:s.item},sourceSide);
      source.position=sourceSide.pokemon.length;sourceSide.pokemon.push(source);sourceSide.team.push(source.set);source.storedStats={...s.actual_stats};delete source.storedStats.hp;
      source.maxhp=s.actual_stats.hp;source.baseMaxhp=source.maxhp;source.hp=s.current_hp??source.maxhp;source.fainted=true;source.isActive=true;source.boosts={...source.boosts,...s.boosts};
      if(s.focus_energy)source.volatiles.focusenergy=battle.initEffectState({id:'focusenergy',target:source,source});
      const move=completeMoveDex.getActiveMove(f.move);
      const moveData={id:move.id,name:move.name,accuracy:move.accuracy,basePower:move.basePower,category:move.category,priority:0,type:move.type,effectType:'Move',ignoreImmunity:false,flags:{futuremove:1}};
      battle.sides[i].slotConditions[0].futuremove=battle.initEffectState({id:'futuremove',target:battle.sides[i],isSlotCondition:true,targetSlot:p.getSlot(),source,sourceSlot:source.getSlot(),move:move.id,moveData,endingTurn:battle.getOverflowedTurnCount()+f.turns-1});
    }
  }
  battle.sides.forEach(side=>side.active[0].updateSpeed());
  const previous=sides.find(s=>s.effects?.battle_last_move)?.effects.battle_last_move;
  if(previous)battle.lastMove=completeMoveDex.getActiveMove(previous);
  if(!battle.sides.some(side=>side.active[0].hp<=0))battle.makeRequest('move');
  return packed(battle,unknownNature,uncertain);
}
export function restoreCompleteBattle(state){return Battle.fromJSON(structuredClone(state.saved));}
// Choice slots index the current native request, which can shrink to one move
// during Rollout, charge turns, recharge or another forced action.
export function nativeMoveChoices(pokemon){
 const moves=pokemon.side.activeRequest?.active?.[pokemon.position]?.moves||pokemon.getMoves();
 return moves.map((move,i)=>({...move,slot:i+1})).filter(move=>!move.disabled&&(move.pp===undefined||move.pp>0));
}
function terminal(state){
  if(state===null)return null;if(state.kind==='chance')return null;
  const [a,b]=state.saved.sides.map(s=>s.pokemon[0]);
  return a.hp<=0?0:b.hp<=0?1:state.saved.ended?(state.saved.winner==='Player'?1:state.saved.winner==='Opponent'?0:0):null;
}
export function completeMoveAdapter(reasons=new Set()){
  return {
    key:s=>s===null?'unknown':s.kind==='chance'?`chance:${s.root.key}:${s.a}:${s.b}:${JSON.stringify(s.tape)}`:s.key,
    terminal,
    depthCost:s=>s?.kind==='chance'?0:1,
    actions:s=>{
      if(s===null)return [[],[]];if(s.kind==='chance')return [[0],[0]];
      const battle=restoreCompleteBattle(s);
      return battle.sides.map(side=>{
        const legal=nativeMoveChoices(side.active[0]).map(m=>m.slot);
        return legal.length?legal:[1];
      });
    },
    transitions:(s,a,b)=>{
      if(s.kind!=='chance')return [{state:{kind:'chance',root:s,a,b,tape:[]},probability:1}];
      const battle=restoreCompleteBattle(s.root);installChanceTape(battle,s.tape,s.root.unknownNature,s.root);
      try{
        battle.choose('p1',`move ${s.a}`);battle.choose('p2',`move ${s.b}`);
        if(!battle.ended&&battle.requestState!=='move')throw Error(`Unexpected single-duel request: ${battle.requestState}`);
        return [{state:packed(battle,s.root.unknownNature,{unknownGender:s.root.unknownGender,unknownFirst:[false,false],unknownHistory:[false,false]}),probability:1}];
      }catch(error){
        if(error instanceof RandomDraw)return error.choices.map(c=>({state:{...s,tape:[...s.tape,c.value]},probability:c.probability}));
        if(error instanceof MissingInput){reasons.add(error.message);return [{state:null,probability:1}];}
        throw error;
      }
    }
  };
}
