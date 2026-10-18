import {snapshotEndgameResult} from './exact-endgame.mjs';
import {simulateOutlook,statusEffects} from './outlook.mjs';
import {predictionReport} from './result-contract.mjs';
import {readFileSync} from 'node:fs';
import {mixHit,convolveHits,hitCounts} from './damage-distribution.mjs';
import {dynamicField} from './turn-mechanics.mjs';
import {simulateCompleteMoves,requiresCompleteMoves,completeMoveDex} from './complete-moves.mjs';
const moveEffects=JSON.parse(readFileSync(new URL('../run-bun/move-effects.json',import.meta.url),'utf8')).moves;
// Convolve per-hit distributions rather than mistaking each hit for a whole move.
export function damageRolls(damage){
  if(!Array.isArray(damage))return [damage];
  if(!Array.isArray(damage[0]))return damage;
  let sums=[0];for(const hit of damage){sums=sums.flatMap(a=>hit.map(b=>a+b));}
  return sums;
}
const highCriticalMoves=new Set(['Aeroblast','Air Cutter','Attack Order','Blaze Kick','Crabhammer','Cross Chop','Drill Run','Karate Chop','Leaf Blade','Night Slash','Poison Tail','Psycho Cut','Razor Leaf','Razor Wind','Shadow Claw','Sky Attack','Slash','Spacial Rend','Stone Edge']);
const alwaysCriticalMoves=new Set(['Frost Breath','Storm Throw','Surging Strikes','Wicked Blow']);
const fixedDamageMoves=new Set(['Bide','Psywave','Endeavor','Seismic Toss','Night Shade','Sonic Boom','Dragon Rage','Super Fang',"Nature's Madness",'Ruination','Guardian of Alola','Final Gambit','Counter','Mirror Coat','Metal Burst','Fissure','Guillotine','Horn Drill','Sheer Cold']);
export function criticalProbability(move,attacker,defender,effects={},rates=[1/16,1/8,1/2,1]) {
  const definition=completeMoveDex.moves.get(move.name);
  const bypassArmor=['Mold Breaker','Teravolt','Turboblaze'].includes(attacker.ability)||['Sunsteel Strike','Moongeist Beam','Photon Geyser','Light That Burns the Sky'].includes(move.name);
  if(move.category==='Status'||fixedDamageMoves.has(move.name)||!bypassArmor&&['Battle Armor','Shell Armor','Magma Armor'].includes(defender.ability))return 0;
  if(alwaysCriticalMoves.has(move.name)||definition.willCrit===true)return 1;
  if(move.isCrit||attacker.ability==='Merciless'&&['psn','tox'].includes(defender.status))return 1;
  let stage=Math.max(highCriticalMoves.has(move.name)?1:move.name==='10,000,000 Volt Thunderbolt'?2:0,definition.exists?(definition.critRatio||1)-1:0)+(attacker.ability==='Super Luck'?1:0)+(effects.focus_energy?2:0);
  if(['Scope Lens','Razor Claw'].includes(attacker.item))stage++;
  if(['Leek','Stick'].includes(attacker.item)&&['Farfetch’d',"Farfetch'd",'Sirfetch’d',"Sirfetch'd"].includes(attacker.name))stage+=2;
  if(attacker.item==='Lucky Punch'&&attacker.name==='Chansey')stage+=2;
  return rates[Math.min(stage,rates.length-1)];
}
export function analyzeBattle(snapshot,calculator,getSpeed,actionOpportunity=()=>({chance:1}),hitChance=()=>({chance:1}),searchOptions={}) {
  const gen=calculator.Generations.get(snapshot.generation),sides=[snapshot.player,snapshot.opponent];
  const makeMon=(side,state)=>{
    const build={...side.build,item:state?.item??side.build.item,status:state?.status??side.build.status,boosts:{...(state?.boosts??side.build.boosts)}};
    const apply=p=>{
      if(side.actual_stats){p.rawStats={...side.actual_stats};p.stats={...side.actual_stats};}
      p.originalCurHP=state?.hp??side.current_hp;
      p.confusion=state?.confusion??side.effects.confusion_turns??0;
      p.acted=!!state?.acted;
      p.skipEntryEffects=true;
      p.abilityOn=!!(state?.flashFire??side.effects.flash_fire)||!!(state?.unburden??side.effects.unburden);
      p.micle=!!(state?.micle??side.effects.micle_boost);
      if(state?.types)p.types=[...state.types];
      else if(side.effects.types)p.types=[...side.effects.types];
      const clone=p.clone.bind(p);p.clone=()=>apply(clone());return p;
    };
    return apply(new calculator.Pokemon(gen,side.species,build));
  };
  const mons=sides.map(s=>makeMon(s));
  const calculationCache=new Map();
  function describe(state,i,j){
    const side=sides[i],attacker=makeMon(side,state?.[i]),defender=makeMon(sides[1-i],state?.[1-i]);
    const field=new calculator.Field(state?dynamicField(state,snapshot.field):snapshot.field);
    if(state)field.terrain=state[0].terrain??field.terrain;
    if(i)[field.attackerSide,field.defenderSide]=[field.defenderSide,field.attackerSide];
    const name=j===-1?'Struggle':side.build.moves[j];
    const moveOverrides=state&&['Rollout','Ice Ball'].includes(name)?{basePower:gen.moves.get(calculator.toID(name)).basePower*2**(state[i].rollingHits+(state[i].defenseCurl?1:0))}:undefined;
    const fallback=!gen.moves.get(calculator.toID(name))?completeMoveDex.moves.get(name):null;
    const move=new calculator.Move(gen,name,{isCrit:side.build.critical,ability:attacker.ability,item:attacker.item,overrides:moveOverrides||fallback});
    const e=side.effects;
    const reason=j===-1?null:side.pp?.[name]===0?'No PP':!state&&e.disabled_moves?.includes(name)?'Disabled':!state&&e.taunted&&move.category==='Status'?'Blocked by Taunt':!state&&e.encore_move&&e.encore_move!==name?'Blocked by Encore':e.locked_move&&e.locked_move!==name?'Locked into another move':null;
    const hit=hitChance(side,attacker,defender,move,field),action=actionOpportunity(side,attacker,move);
    // Conservative fast path for common early-game moves whose damage does not
    // depend on HP under these explicit ability/item combinations.
    const hpIndependent=['Tackle','Leafage','Scratch','Pound'].includes(name)&&
      sides.every(s=>!s.build.item&&['','Run Away','Cotton Down','Rough Skin','Sand Veil'].includes(s.build.ability||''));
    const calcKey=JSON.stringify([i,j,state?.map(s=>[hpIndependent?null:s.hp,s.status,s.boosts,s.item,s.types,s.terrain,s.weather,s.reflect,s.lightScreen,s.tailwind,s.trickRoom,s.flashFire,s.unburden,s.rollingHits,s.defenseCurl])??'initial']);
    let result=calculationCache.get(calcKey);
    if(!result&&move.category!=='Status'){
      result=calculator.calculate(gen,attacker,defender,move,field);calculationCache.set(calcKey,result);
    }
    if(result&&['Fissure','Guillotine','Horn Drill','Sheer Cold'].includes(name)){
      const immune=defender.types.some(type=>(gen.types.get(calculator.toID(move.type))?.effectiveness[type]??1)===0)||name==='Fissure'&&defender.hasAbility('Levitate')&&!attacker.hasAbility('Mold Breaker','Teravolt','Turboblaze');
      result.damage=immune?0:defender.curHP();
    }
    let rolls=result?damageRolls(result.damage):[0],range=result?.range()||[0,0];
    const critChance=criticalProbability(move,attacker,defender,{...e,focus_energy:state?.[i].focusEnergy??e.focus_energy},searchOptions.criticalRates);
    let criticalResult=result;
    if(result&&critChance>0){
      const key=calcKey+':critical';let critical=calculationCache.get(key);
      if(!critical){
        const critField=new calculator.Field(state?dynamicField(state,snapshot.field):snapshot.field);
        if(state)critField.terrain=state[0].terrain??critField.terrain;
        if(i)[critField.attackerSide,critField.defenderSide]=[critField.defenderSide,critField.attackerSide];
        critical=calculator.calculate(gen,makeMon(side,state?.[i]),makeMon(sides[1-i],state?.[1-i]),new calculator.Move(gen,name,{isCrit:true,ability:attacker.ability,item:attacker.item,overrides:moveOverrides||fallback}),critField);
        calculationCache.set(key,critical);
      }
      criticalResult=critical;
    }
    const metadata=moveEffects[calculator.toID(name)]||completeMoveDex.moves.get(name);
    const effectMove=result?.move||move;
    const effectiveness=defender.types.reduce((n,type)=>n*(effectMove.name==='Freeze-Dry'&&type==='Water'?2:gen.types.get(calculator.toID(effectMove.type))?.effectiveness[type]??1),1);
    const itemData=defender.item?gen.items.get(calculator.toID(defender.item)):null;
    const removableItem=!!defender.item&&!itemData?.megaEvolves&&!itemData?.onPlate&&!itemData?.onDrive&&!itemData?.onMemory&&!itemData?.zMove&&!['Blue Orb','Red Orb','Rusted Sword','Rusted Shield'].includes(defender.item);
    const asHits=d=>Array.isArray(d)&&Array.isArray(d[0])?d:[Array.isArray(d)?d:[d??0]];
    const normalHits=asHits(result?.damage),critHits=asHits(criticalResult?.damage);
    const counts=hitCounts(metadata.multihit,attacker.ability,Math.max(move.hits,normalHits.length));
    const maxHits=Math.max(...counts.map(c=>c.count)),hitDistributions=[];
    for(let k=0;k<maxHits;k++){
      let normal=normalHits[k]||normalHits[0],critical=critHits[k]||critHits[0];
      if(['Triple Axel','Triple Kick'].includes(name)){
        const perHit=crit=>calculator.calculate(gen,makeMon(side,state?.[i]),makeMon(sides[1-i],state?.[1-i]),
          new calculator.Move(gen,name,{isCrit:crit,ability:attacker.ability,item:attacker.item,
            overrides:{name:`${name} hit`,basePower:(name==='Triple Axel'?20:10)*(k+1),multihit:null}}),new calculator.Field(field)).damage;
        normal=damageRolls(perHit(false));critical=damageRolls(perHit(true));
      }
      hitDistributions.push(mixHit(normal,critical,critChance));
    }
    const damageDistribution=new Map();
    for(const {count,probability} of counts)for(const r of convolveHits(hitDistributions.slice(0,count)))
      damageDistribution.set(r.damage,(damageDistribution.get(r.damage)||0)+probability*r.probability);
    if(maxHits>1){rolls=[...damageDistribution.keys()];range=[Math.min(...rolls),Math.max(...rolls)];}
    return {name,move_index:j,available:!reason,reason,min:range[0],max:range[1],damage_rolls:rolls,damage_distribution:[...damageDistribution].map(([damage,probability])=>({damage,probability})),
      hit_distributions:hitDistributions,hit_counts:counts,secondary_effects:metadata.secondaries||[],self_effect:metadata.self,
      multiaccuracy:!!metadata.multiaccuracy&&attacker.ability!=='Skill Link',sound:!!metadata.sound,defrost:!!metadata.defrost,move_type:effectMove.type,
      critical_chance:critChance,status_move:move.category==='Status',category:move.category,effectiveness,removable_item:removableItem,user_max_hp:attacker.maxHP(),
      primary_effect:move.category==='Status'?metadata:null,recoil:move.recoil||metadata.recoil,crash:move.hasCrashDamage||metadata.crash,mind_blown:move.mindBlownRecoil,
      charge:metadata.charge,recharge:metadata.recharge,protectable:metadata.flags?.protect!==0&&!!metadata.flags?.protect,breaks_protect:move.breaksProtect,
      bypass_substitute:!!metadata.flags?.bypasssub,reflectable:!!metadata.flags?.reflectable,target_self:['self','allySide','allies'].includes(metadata.target),
      hit_chance:name==='Struggle'?1:hit.chance,accuracy_check:metadata.accuracy!==true,accuracy_unknown:name!=='Struggle'&&hit.chance===null,effective_accuracy:hit.accuracy,action_chance:action.chance,action_note:action.note,
      priority:(move.priority||0)+(attacker.ability==='Gale Wings'&&move.type==='Flying'?1:attacker.ability==='Triage'&&(move.drain||statusEffects[name]?.heal)?3:0),drain:move.drain?.[0]?move.drain[0]/move.drain[1]:0,flinch:name==='Bite'?0.3:name==='Hyper Fang'?0.1:0,contact:!!move.flags?.contact,multi_hit:move.hits>1,sheer_force:!!move.secondaries,speed:getSpeed(gen,result?.attacker||attacker,field,field.attackerSide),
      note:reason||[action.note,hit.note].filter(Boolean).join(' ')||null,
      min_percent:100*range[0]/defender.maxHP(),max_percent:100*range[1]/defender.maxHP(),
      guaranteed_ko_on_hit:!reason&&action.chance>0&&hit.chance>0&&defender.curHP()>0&&range[0]>=defender.curHP(),
      possible_ko_on_hit:!reason&&action.chance>0&&hit.chance>0&&defender.curHP()>0&&range[1]>=defender.curHP()};
  }
  const rows=sides.map((s,i)=>s.build.moves.map((_,j)=>describe(null,i,j)));
  const warnings=[
    'This searches the active matchup, not the full team battle. Both sides select simultaneous actions using a mixed-strategy minimax model; this is not verified Run & Bun AI.',
    'The meter uses the lower probability bound. The upper bound includes unexplored continuations. These are bounds within the modeled mechanics, not guarantees about the ROM.',
    'HP, status, stat stages, accuracy, speed, PP, item state and supported effect timers change inside the tree. Recoil/crash damage, survival/contact triggers, Protect/Substitute, supported setup/recovery/status moves, conditional attacks, charge/recharge and locked attacks are searched. Unknown live state and unsupported callbacks remain unresolved.',
    'Held-item damage/speed modifiers, Choice locks, Focus Sash, Oran/Sitrus, pinch and status berries, White Herb, Leftovers/Black Sludge, Life Orb recoil, Rocky Helmet and status orbs are modeled. Sash, berries and Helmet resolve between hits. Item timing is not live-verified for this ROM; Resistance berries, Weakness Policy, selected reactive abilities, item removal and theft are retained in future states; miscellaneous unsupported triggers remain incomplete.',
    'Burn and poison residual damage are modeled. Weather damage, Leech Seed, binding damage and supported timer expiry are modeled. Missing toxic counters or active-effect durations remain unresolved. Switching, full teams and unsupported move/ability callbacks remain outside the active-matchup model.',
    'Run & Bun move accuracy edits and common accuracy effects (Compound Eyes, Victory Star, Hustle, No Guard, Sand Veil, Snow Cloak, Tangled Feet, Keen Eye, Wonder Skin, Wide Lens, Bright Powder, Lax Incense, Gravity and weather) are applied. Zoom Lens, Micle Berry and one-hit KO accuracy/level restrictions are modeled. Unknown accuracy data remains unresolved. Newly inflicted sleep uses a uniform 1–3 skipped-action duration; this has not been live-verified for this ROM.'
  ];
  const shortcut=searchOptions.completeMoves?snapshotEndgameResult(snapshot,searchOptions):null;
  const forecast=shortcut||(searchOptions.completeMoves&&(searchOptions.forceNativeForecast||requiresCompleteMoves(snapshot))?simulateCompleteMoves(snapshot,searchOptions):simulateOutlook(snapshot,rows[0],rows[1],mons[0],mons[1],{...searchOptions,describe,
    damageKey:(state,i,j)=>{
      const independent=['Tackle','Leafage','Scratch','Pound'].includes(sides[i].build.moves[j])&&
        sides.every(s=>!s.build.item&&['','Run Away','Cotton Down','Rough Skin','Sand Veil'].includes(s.build.ability||''));
      return JSON.stringify([i,j,state.map(s=>[independent?null:s.hp,s.status,s.boosts,s.item,s.types,s.confusion,s.terrain,s.focusEnergy,s.weather,s.reflect,s.lightScreen,s.tailwind,s.trickRoom,s.acted,s.flashFire,s.unburden,s.micle,s.rollingHits,s.defenseCurl])]);
    },
    confusionDamage:(state,i)=>{
      const mon=makeMon(sides[i],state[i]),stage=n=>n>=0?(2+n)/2:2/(2-n);
      const atk=Math.floor(mon.rawStats.atk*stage(state[i].boosts.atk||0)),def=Math.floor(mon.rawStats.def*stage(state[i].boosts.def||0));
      const base=Math.floor(Math.floor((Math.floor(2*mon.level/5)+2)*40*atk/Math.max(1,def))/50)+2;
      return Array.from({length:16},(_,roll)=>Math.max(1,Math.floor(base*(85+roll)/100)));
    }}));
  if(searchOptions.opponentModel==='npc-ai'){
    warnings[0]='This searches the active matchup against the Run & Bun community NPC move-scoring predictor. Random score bonuses and move ties are probability weighted; the player root chooses the best expected outcome.';
    warnings[1]='NPC AI predictions are a community model, not ROM-verified. Switching, full teams, trainer-specific AI flags and doubles are not modeled. Missing required team counts leave the estimate unresolved.';
  }
  warnings.push('Critical hits use Run & Bun rates (1/16 base; 1/8, 1/2 and 1 at higher stages) and the Generation 8 1.5× damage formula. Multi-hit attacks branch independent critical and damage rolls for each hit, with Generation 8 hit counts and Skill Link. Triple Kick/Axel check each hit unless Skill Link applies.');
  warnings.push('Move secondary effects use bundled Generation 8 metadata with all eight Run & Bun chance changes. Status, stat changes, flinch, confusion and relevant secondary callbacks are branched; Sheer Force, Serene Grace, Shield Dust and status/stat immunities affect them. Pinch-berry confusion uses nature and a random duration.');
  warnings.push('Confusion self-hit damage branches across the 16 Generation 8 damage rolls. ROM-specific effect timing remains to be verified in live battles.');
  if(forecast.omitted_moves.length)warnings.push(`Unsupported status moves retained as unresolved decisions: ${forecast.omitted_moves.join(', ')}.`);
  warnings.push(...forecast.unresolved_reasons);
  const display=rs=>rs.map(({damage_rolls,damage_distribution,hit_distributions,...r})=>r);
  return {victory:forecast.score,outlook:forecast,prediction:predictionReport(forecast),outgoing_moves:display(rows[0]),incoming_moves:display(rows[1]),
    stats:{player:mons[0].rawStats,opponent:mons[1].rawStats},warnings,
    model:forecast.approximate?'Run & Bun · sampled battle simulation':'Run & Bun · bounded stochastic game search',
    explanations:forecast.approximate?[`Evaluated ${forecast.samples} native battle continuations, with at least ${forecast.samples_per_pair} samples per starting move pair.`,`Continuation choices and endings beyond ${forecast.rollout_turn_limit} turns use a heuristic; this estimate is not a certified search bound.`]:[`Searched ${forecast.nodes} decision states through a depth of ${forecast.depth}; reused ${forecast.cache_hits} cached results.`,
      `Modeled win bounds: ${forecast.lower_bound.toFixed(2)}–${forecast.upper_bound.toFixed(2)}%.`]
  };
}
