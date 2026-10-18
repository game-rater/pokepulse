import {searchBattle} from './search.mjs';
import {activateBerry,applyHeldDamage,endTurnItems,resolveBerries} from './held-items.mjs';
import {applySecondaries,applyBoosts,statusImmune} from './secondary-effects.mjs';
import {extendState,dynamicField,protectMoves,chargeMoves,rechargeMoves,rampageMoves,blockedByProtect,hitTarget,contactBranches,removeItem,finishTimers,residualEffects,indirect,grounded,activateTerrainSeeds,absorbAttack} from './turn-mechanics.mjs';
const thawingMoves=new Set(['Burn Up','Flame Wheel','Flare Blitz','Fusion Flare','Pyro Ball','Sacred Fire','Scald','Scorching Sands','Steam Eruption']);
export const statusEffects={
  'Endure':{endure:true},
  'Focus Energy':{focusEnergy:true},
  'Swords Dance':{boosts:{atk:2}},'Nasty Plot':{boosts:{spa:2}},'Calm Mind':{boosts:{spa:1,spd:1}},
  'Dragon Dance':{boosts:{atk:1,spe:1}},'Agility':{boosts:{spe:2}},'Iron Defense':{boosts:{def:2}},
  'Growl':{target:true,boosts:{atk:-1}},'Leer':{target:true,boosts:{def:-1}},'Tail Whip':{target:true,boosts:{def:-1}},
  'Sand Attack':{target:true,boosts:{accuracy:-1}},'Smokescreen':{target:true,boosts:{accuracy:-1}},
  'Recover':{heal:0.5},'Slack Off':{heal:0.5},'Soft-Boiled':{heal:0.5},'Milk Drink':{heal:0.5},
  'Sing':{status:'slp'},'Hypnosis':{status:'slp'},'Sleep Powder':{status:'slp',powder:true},'Spore':{status:'slp',powder:true},
  'Thunder Wave':{status:'par'},'Will-O-Wisp':{status:'brn'},'Poison Powder':{status:'psn',powder:true}
};
for(const name of protectMoves)statusEffects[name]={protect:true};
Object.assign(statusEffects,{'Substitute':{substitute:true},'Leech Seed':{seed:true},'Toxic':{status:'tox'},'Rest':{rest:true},'Roost':{heal:0.5,roost:true},'Synthesis':{weatherHeal:true},'Morning Sun':{weatherHeal:true},'Moonlight':{weatherHeal:true},'Shore Up':{sandHeal:true},'Taunt':{taunt:true},'Disable':{disable:true},'Encore':{encore:true},'Reflect':{screen:'reflect'},'Light Screen':{screen:'lightScreen'},'Tailwind':{screen:'tailwind'},'Trick Room':{room:true},'Sunny Day':{weather:'Sun'},'Rain Dance':{weather:'Rain'},'Sandstorm':{weather:'Sand'},'Hail':{weather:'Hail'},'Electric Terrain':{terrain:'Electric'},'Grassy Terrain':{terrain:'Grassy'},'Misty Terrain':{terrain:'Misty'},'Psychic Terrain':{terrain:'Psychic'},'Geomancy':{boosts:{spa:2,spd:2,spe:2}}});
Object.assign(statusEffects,{'Confuse Ray':{confuse:true},'Supersonic':{confuse:true},'Sweet Kiss':{confuse:true},'Teeter Dance':{confuse:true},'Swagger':{confuse:true,target:true,boosts:{atk:2}},'Flatter':{confuse:true,target:true,boosts:{spa:1}},'Haze':{haze:true},'Clear Smog':{haze:true},'Belly Drum':{drum:true},'Pain Split':{split:true},'Refresh':{cure:true},'Aromatherapy':{cure:true},'Heal Bell':{cure:true}});
statusEffects['Defense Curl']={boosts:{def:1},defenseCurl:true};
// There is no adjacent ally in the active singles model. These moves execute
// normally (including consuming PP), but have no successful target/effect.
for(const name of ['Helping Hand','Splash'])statusEffects[name]={singlesNoEffect:true};
const copy=s=>s.map(p=>({...p,boosts:{...p.boosts},pp:[...p.pp]}));
export function expectedMoveDamage(move){
 if(move.damage_distribution?.length)return move.damage_distribution.reduce((sum,roll)=>sum+roll.damage*roll.probability,0);
 if(move.damage_rolls?.length)return move.damage_rolls.reduce((sum,damage)=>sum+damage,0)/move.damage_rolls.length;
 return ((move.min??0)+(move.max??0))/2;
}
export function frontierOutlookValue(state,legal,describe){
 if(!state)return 0.5;
 const attacks=[0,1].map(i=>legal(state,i).map(j=>describe(state,i,j)).filter(m=>m&&!m.status_move));
 const power=i=>Math.max(0.1,...attacks[i].map(m=>expectedMoveDamage(m)*(m.hit_chance??1)*(state[i].status==='par'?0.75:state[i].status==='frz'?0.2:1)));
 const turns=[state[1].hp/power(0)+(state[0].status==='slp'?Math.max(0,(state[0].sleep??2)-1):0),
  state[0].hp/power(1)+(state[1].status==='slp'?Math.max(0,(state[1].sleep??2)-1):0)];
 return 1/(1+Math.exp(Math.max(-30,Math.min(30,1.5*(turns[0]-turns[1])))));
}
export function simulateOutlook(snapshot,outgoing,incoming,player,opponent,options={}) {
  if(typeof options==='number')options={maxDepth:options};
  const rows=[outgoing,incoming],mons=[player,opponent],sides=[snapshot.player,snapshot.opponent];
  const trackLastMove=rows.some(rs=>rs.some(m=>['Eerie Spell','Disable','Encore'].includes(m.name)));
  const reasons=new Set(),omitted=new Set();
  const initial=sides.map((side,i)=>({hp:mons[i].curHP(),status:mons[i].status||'',sleep:side.effects.sleep_counter??null,
    confusion:side.effects.confusion_turns||0,toxic:side.effects.toxic_counter||1,endure:false,protectStreak:side.effects.protect_streak||0,item:side.build.item||'',choice:side.effects.locked_move?side.build.moves.indexOf(side.effects.locked_move):null,boosts:{...side.build.boosts},pp:rows[i].map(m=>side.pp?.[m.name]??null),
    nature:side.build.nature||'Hardy',ability:typeof mons[i].ability==='string'?mons[i].ability:mons[i].ability?.name||'',types:mons[i].types||[],
    berryBlocked:['Unnerve','As One (Glastrier)','As One (Spectrier)'].includes(typeof mons[1-i].ability==='string'?mons[1-i].ability:mons[1-i].ability?.name),
    lastMove:null,throatChop:0,boostedThisTurn:false,pendingConfusion:false,focusEnergy:!!side.effects.focus_energy,terrain:snapshot.field.terrain||'',terrainTurns:null}));
  const maxHP=mons.map(m=>m.maxHP()),abilities=mons.map(m=>typeof m.ability==='string'?m.ability:m.ability?.name||'');
  initial.forEach((mon,i)=>extendState(mon,sides[i].effects,snapshot.field,i?snapshot.field.defenderSide:snapshot.field.attackerSide));
  initial.forEach(mon=>mon.originalTypes=[...mon.types]);
  initial.forEach((mon,i)=>{if(sides[i].effects.last_move)mon.lastMove=rows[i].findIndex(m=>m.name===sides[i].effects.last_move);if(sides[i].effects.protect_streak===null)mon.protectStreak=null;});
  for(const [inputKey,stateKey] of [['weather_turns','weatherTurns'],['terrain_turns','terrainTurns'],['trick_room_turns','trickRoomTurns']]){
    const source=sides.find(side=>side.effects[inputKey]!==undefined);
    if(source)initial.forEach(mon=>mon[stateKey]=source.effects[inputKey]);
  }
  // The current ability does not prove how existing weather was created.
  // Permanent weather requires an explicit -1; missing duration stays unknown.
  const primary=m=>statusEffects[m.name]||(!m.primary_effect?.volatile&&m.primary_effect?.boosts?{boosts:m.primary_effect.boosts,target:!m.target_self}:m.primary_effect?.heal?{heal:m.primary_effect.heal[0]/m.primary_effect.heal[1]}:m.primary_effect?.status?{status:m.primary_effect.status}:null);
  const stats=['atk','def','spa','spd','spe','accuracy','evasion'];
  initial.forEach((mon,i)=>activateBerry(mon,maxHP[i]));
  activateTerrainSeeds(initial);
  initial.forEach((mon,i)=>{if(mon.ability==='Unburden'&&sides[i].build.item&&!mon.item)mon.unburden=true;});
  // Most branches share the same property layout. Cache its canonical field
  // order once, then serialize values directly instead of allocating/sorting
  // an entries array and a copied object for every Pokémon in every branch.
  const stateShapes=new Map();
  const key=state=>JSON.stringify(state.map(p=>{
    const shape=Object.keys(p).join('\0');
    let fields=stateShapes.get(shape);
    if(!fields){fields=[...new Set([...Object.keys(p),'flinched'])].sort();stateShapes.set(shape,fields);}
    return fields.flatMap(field=>{
      if(field==='flinched')return [[field,!!p.flinched]];
      const value=p[field];return value===undefined?[]:[[field,value]];
    });
  }));
  const currentField=s=>dynamicField(s,snapshot.field);
  const merge=branches=>{const merged=new Map();for(const b of branches){if(!b.probability)continue;const k=(b.state===null?'unknown':key(b.state))+'|'+(b.damage||0)+'|'+(b.stopped?1:0);const old=merged.get(k);if(old)old.probability+=b.probability;else merged.set(k,b);}return [...merged.values()];};
  const damageCache=new Map();
  const describe=(state,i,j)=>{
    const k=options.damageKey?.(state,i,j)??JSON.stringify([state.map(s=>[s.hp,s.status,s.boosts,s.item,s.confusion,s.terrain,s.focusEnergy]),i,j]);
    if(damageCache.has(k))return damageCache.get(k);
    const row=options.describe?options.describe(state,i,j):j===-1?null:rows[i][j];
    damageCache.set(k,row);return row;
  };
  const legal=(state,i)=>{
    const usable=rows[i].map((m,j)=>({m,j})).filter(({m,j})=>{
    if(state[i].pp[j]===0&&!state[i].charge&&!state[i].rampage&&!state[i].rolling||!m.available&&!['No PP','Disabled','Blocked by Taunt','Blocked by Encore'].includes(m.reason))return false;
    if(state[i].disabled.includes(m.name)||state[i].taunt!==0&&m.status_move||state[i].encore&&state[i].encore!==m.name)return false;
    if(state[i].charge&&state[i].charge!==m.name||state[i].rampage&&state[i].rampage!==m.name)return false;
    if(state[i].rolling&&state[i].rolling!==m.name)return false;
    if(state[i].item.startsWith('Choice ')&&state[i].choice!==null&&state[i].choice!==j)return false;
    return true;
    });
    if(!usable.length){
      if(describe(state,i,-1))return [-1];
      reasons.add('Struggle damage is unavailable from this simulation adapter.');return [];
    }
    return usable.filter(({m})=>{
    if(m.status_move&&!primary(m)){omitted.add(m.name);return true;}
    return true;
    }).map(({j})=>j);
  };
  function act(state,i,j,otherMove){
    if(state.some(p=>p.hp<=0))return [{state,probability:1}];
    let s=copy(state),user=s[i],target=s[1-i],move=describe(s,i,j),name=j===-1?'Struggle':rows[i][j].name;
    const itemsBefore=s.map(mon=>mon.item);
    const abort=blocked=>{
      const mon=blocked[i];mon.charge=null;mon.semi='';mon.rolling=null;mon.rollingHits=0;
      if(mon.rampage){
        if(mon.rampageTurns===null){reasons.add('Interrupted locked attack has no known remaining duration.');return null;}
        if(mon.rampageTurns===1&&mon.status!=='slp'&&mon.ability!=='Own Tempo'&&!mon.confusion)mon.rageConfusionPending=true;
        mon.rampage=null;mon.rampageTurns=null;
      }return blocked;
    };
    user.acted=true;
    if(user.recharge){user.recharge=false;user.acted=true;return [{state:s,probability:1}];}
    if(user.encore&&name!==user.encore){const forced=rows[i].findIndex(m=>m.name===user.encore);if(forced>=0&&j!==-1)return act(state,i,user.pp[forced]===0?-1:forced,otherMove);}
    if(user.taunt!==0&&move.status_move||user.disabled.includes(name))return [{state:abort(s),probability:1}];
    if(user.flinched){user.flinched=false;if(user.ability==='Steadfast')applyBoosts(s,i,{spe:1});return [{state:abort(s),probability:1}];}
    if(user.throatChop&&move.sound)return [{state:abort(s),probability:1}];
    if(user.status==='slp'&&user.sleep===null){reasons.add('A sleeping Pokémon has no known wake-up counter.');return [{state:null,probability:1}];}
    if(user.status==='slp'){
      user.sleep=Math.max(0,user.sleep-(abilities[i]==='Early Bird'?2:1));
      if(!user.sleep){user.status='';user.sleep=null;}
      else if(name!=='Snore')return [{state:abort(s),probability:1}];
    }
    if(name==='Snore'&&user.status!=='slp'&&abilities[i]!=='Comatose')return [{state:s,probability:1}];
    let gates=[{state:s,probability:1,can:true}];
    if(user.status==='frz'){
      const selfThaw=thawingMoves.has(name)&&(name!=='Burn Up'||mons[i].types.includes('Fire'));
      const thaw=copy(s);thaw[i].status='';
      gates=selfThaw?[{state:thaw,probability:1,can:true}]:[{state:s,probability:0.8,can:false},{state:thaw,probability:0.2,can:true}];
    }
    const outputs=[];
    for(const gate of gates){
      if(!gate.can){outputs.push({...gate,state:abort(gate.state)});continue;}
      let active=gate.probability;
      if(gate.state[i].status==='par'){outputs.push({state:abort(copy(gate.state)),probability:active*0.25});active*=0.75;}
      if(gate.state[i].confusion>0){
        gate.state[i].confusion--;
        // Confusion expiry precedes the self-hit check.
        if(gate.state[i].confusion>0){
          const selfDamage=options.confusionDamage?.(gate.state,i)??0,rolls=Array.isArray(selfDamage)?selfDamage:[selfDamage];
          for(const damage of rolls){const confused=copy(gate.state);confused[i].hp=Math.max(0,confused[i].hp-damage);outputs.push({state:abort(confused),probability:active/3/rolls.length});}active*=2/3;
        }
      }
      const ready=copy(gate.state);
      if(j!==-1&&ready[i].pp[j]!==null&&!ready[i].charge&&!ready[i].rampage&&!ready[i].rolling)ready[i].pp[j]=Math.max(0,ready[i].pp[j]-(abilities[1-i]==='Pressure'&&!move.target_self?2:1));
      if(trackLastMove)ready[i].lastMove=j===-1?null:j;
      if(j!==-1&&ready[i].item.startsWith('Choice '))ready[i].choice=j;
      if(name!=='Endure'&&!protectMoves.has(name))ready[i].protectStreak=0;
      move=describe(ready,i,j); // Wake/thaw and previous action may change damage.
      if(move.accuracy_unknown){reasons.add(`${name}: move accuracy is unavailable.`);outputs.push({state:null,probability:active});continue;}
      ready[i].acted=true;
      ready[i].attempted=true;
      if(name==='Sky Drop'){reasons.add('Sky Drop: lifting and releasing the opponent is not implemented.');outputs.push({state:null,probability:active});continue;}
      if(move.status_move&&!primary(move)){reasons.add(`${name}: its primary status effect is not implemented.`);outputs.push({state:null,probability:active});continue;}
      if(name==='Sucker Punch'&&(otherMove.status_move||ready[1-i].acted)){outputs.push({state:ready,probability:active});continue;}
      if(chargeMoves.has(name)||move.charge){
        if(ready[i].charge===name){ready[i].charge=null;ready[i].semi='';}
        else if(!(['Solar Beam','Solar Blade'].includes(name)&&ready[i].weather==='Sun')){
          if(name==='Meteor Beam')applyBoosts(ready,i,{spa:1});
          if(name==='Skull Bash')applyBoosts(ready,i,{def:1});
          if(ready[i].item==='Power Herb')ready[i].item='';
          else{ready[i].charge=name;ready[i].semi=['Fly','Bounce'].includes(name)?'air':name==='Dig'?'underground':name==='Dive'?'underwater':['Phantom Force','Shadow Force'].includes(name)?'vanished':'';outputs.push({state:ready,probability:active});continue;}
        }
      }
      if(ready[1-i].semi&&!move.target_self&&!['No Guard'].includes(abilities[i])&&!['No Guard'].includes(abilities[1-i])){
        const hits=ready[1-i].semi==='air'?['Gust','Twister','Thunder','Hurricane','Sky Uppercut','Smack Down','Thousand Arrows']:ready[1-i].semi==='underground'?['Earthquake','Magnitude']:ready[1-i].semi==='underwater'?['Surf','Whirlpool']:[];
        if(!hits.includes(name)){if(move.crash)indirect(ready[i],maxHP[i]/2);outputs.push({state:ready,probability:active});continue;}
      }
      if(blockedByProtect(ready,i,move,maxHP)){if(move.crash)indirect(ready[i],maxHP[i]/2);ready[i].rolling=null;ready[i].rollingHits=0;outputs.push({state:ready,probability:active});continue;}
      if(['Counter','Mirror Coat','Metal Burst'].includes(name)){
        const valid=ready[i].damageTaken>0&&(name==='Metal Burst'||ready[i].damageCategory===(name==='Counter'?'Physical':'Special'));
        const immune=name==='Counter'&&ready[1-i].types.includes('Ghost')||name==='Mirror Coat'&&ready[1-i].types.includes('Dark');
        const damage=valid&&!immune?Math.floor(ready[i].damageTaken*(name==='Metal Burst'?1.5:2)):0;
        move={...move,hit_distributions:[[{damage,probability:1}]],hit_counts:[{count:1,probability:1}],damage_rolls:[damage]};
      }
      move=describe(ready,i,j).name===move.name&&!['Counter','Mirror Coat','Metal Burst'].includes(name)?describe(ready,i,j):move;
      const hit=Math.max(0,Math.min(1,move.hit_chance??1));
      if(move.accuracy_check){ready[i].micle=false;ready[i].micleTurns=0;}
      const explosive=['Explosion','Self-Destruct','Misty Explosion'].includes(name);
      if(explosive&&abilities.includes('Damp')){outputs.push({state:ready,probability:active});continue;}
      if(hit<1){const missed=copy(ready);if(explosive)missed[i].hp=0;if(move.crash)indirect(missed[i],maxHP[i]/2);missed[i].rolling=null;missed[i].rollingHits=0;outputs.push({state:missed,probability:active*(1-hit)});}
      const effect=primary(move);
      if(!move.status_move&&absorbAttack(ready,i,move,maxHP)){outputs.push({state:ready,probability:active*hit});continue;}
      if(move.status_move&&effect){
        const done=copy(ready),reflected=move.reflectable&&abilities[1-i]==='Magic Bounce'&&!['Mold Breaker','Teravolt','Turboblaze'].includes(abilities[i]),targetIndex=reflected?i:1-i,sourceIndex=reflected?1-i:i,recipient=effect.target?done[targetIndex]:done[i];
        if(effect.endure||effect.protect){
          if(ready[i].protectStreak===null){reasons.add('Protection success counter is unavailable.');outputs.push({state:null,probability:active*hit});continue;}
          if(ready[1-i].acted){outputs.push({state:done,probability:active*hit});continue;}
          const chance=Math.pow(1/3,Math.min(6,ready[i].protectStreak));
          done[i].protectStreak=Math.min(6,ready[i].protectStreak+1);
          if(chance<1){const failed=copy(done);failed[i].protectStreak=0;outputs.push({state:failed,probability:active*hit*(1-chance)});}
          if(effect.endure)done[i].endure=true;else done[i].protect=name;outputs.push({state:done,probability:active*hit*chance});continue;
        }
        if(done[1-i].substitute&&!move.target_self&&!move.bypass_substitute&&!move.sound&&abilities[i]!=='Infiltrator'){outputs.push({state:done,probability:active*hit});continue;}
        if(effect.substitute){const cost=Math.floor(maxHP[i]/4);if(cost>0&&!done[i].substitute&&done[i].hp>cost){done[i].hp-=cost;done[i].substitute=cost;done[i].trapTurns=0;}}
        if(effect.seed&&!done[targetIndex].types.includes('Grass'))done[targetIndex].seeded=true;
        if(effect.taunt)done[targetIndex].taunt=done[targetIndex].acted?4:3;
        if(effect.disable||effect.encore){
          const last=done[targetIndex].lastMove;
          if(last===null){reasons.add(`${name}: last used move is unavailable.`);outputs.push({state:null,probability:active*hit});continue;}
          if(done[targetIndex].pp[last]===0){outputs.push({state:done,probability:active*hit});continue;}
          if(effect.disable){done[targetIndex].disabled=[rows[targetIndex][last].name];done[targetIndex].disableTurns=done[targetIndex].acted?5:4;}else{done[targetIndex].encore=rows[targetIndex][last].name;done[targetIndex].encoreTurns=done[targetIndex].acted?4:3;}
        }
        if(effect.screen){done[i][effect.screen]=true;done[i][effect.screen+'Turns']=effect.screen==='tailwind'?4:done[i].item==='Light Clay'?8:5;}
        if(effect.room)done.forEach(mon=>{mon.trickRoom=!mon.trickRoom;mon.trickRoomTurns=mon.trickRoom?5:0;});
        if(effect.weather)done.forEach(mon=>{mon.weather=effect.weather;mon.weatherTurns=({'Sun':'Heat Rock','Rain':'Damp Rock','Sand':'Smooth Rock','Hail':'Icy Rock'}[effect.weather])===done[i].item?8:5;});
        if(effect.terrain)done.forEach(mon=>{mon.terrain=effect.terrain;mon.terrainTurns=done[i].item==='Terrain Extender'?8:5;});
        if(effect.weatherHeal||effect.sandHeal){
          let weather=done.some(mon=>['Air Lock','Cloud Nine'].includes(mon.ability))?'':done[i].weather;
          if(done[i].item==='Utility Umbrella'&&['Rain','Sun'].includes(weather))weather='';
          done[i].hp=Math.min(maxHP[i],done[i].hp+Math.floor(maxHP[i]*(effect.sandHeal?(weather==='Sand'?2/3:0.5):weather==='Sun'?2/3:weather?0.25:0.5)));
        }
        if(effect.rest&&!statusImmune('slp',done[i],currentField(done))&&done[i].hp<maxHP[i]){done[i].hp=maxHP[i];done[i].status='slp';done[i].sleep=3;}
        if(effect.roost&&done[i].types.includes('Flying')){done[i].roost=true;done[i].types=done[i].types.filter(t=>t!=='Flying');if(!done[i].types.length)done[i].types=['Normal'];}
        if(effect.boosts)applyBoosts(done,effect.target?targetIndex:i,effect.boosts,{source:sourceIndex});
        if(effect.haze)done.forEach(mon=>{for(const stat of Object.keys(mon.boosts))mon.boosts[stat]=0;});
        if(effect.drum&&done[i].hp>Math.floor(maxHP[i]/2)&&done[i].boosts.atk!==(done[i].ability==='Contrary'?-6:6)){done[i].hp-=Math.floor(maxHP[i]/2);done[i].boosts.atk=done[i].ability==='Contrary'?-6:6;if(done[i].ability!=='Contrary')done[i].boostedThisTurn=true;}
        if(effect.split){const average=Math.floor((done[i].hp+done[targetIndex].hp)/2);done[i].hp=Math.min(maxHP[i],average);done[targetIndex].hp=Math.min(maxHP[targetIndex],average);}
        if(effect.cure&&(name!=='Refresh'||['par','brn','psn','tox'].includes(done[i].status))){done[i].status='';done[i].sleep=null;done[i].toxic=1;}
        if(effect.focusEnergy)done[i].focusEnergy=true;
        if(effect.defenseCurl)done[i].defenseCurl=true;
        if(effect.heal)recipient.hp=Math.min(maxHP[i],recipient.hp+Math.floor(maxHP[i]*effect.heal));
        const def=done[targetIndex],types=def.types||[],ability=abilities[targetIndex];
        const immune=statusImmune(effect.status,def,currentField(done),done[sourceIndex])||effect.powder&&(types.includes('Grass')||ability==='Overcoat'||def.item==='Safety Goggles')||
          effect.status==='slp'&&['Insomnia','Vital Spirit','Sweet Veil','Comatose'].includes(ability)||
          effect.status==='par'&&(types.includes('Electric')||ability==='Limber'||name==='Thunder Wave'&&types.includes('Ground'))||
          effect.status==='brn'&&(types.includes('Fire')||ability==='Water Veil')||
          effect.status==='psn'&&(types.some(t=>['Poison','Steel'].includes(t))||ability==='Immunity');
        if(effect.status&&!def.status&&!immune){
          def.status=effect.status;
          if(effect.status==='tox')def.toxic=1;
          if(effect.status==='slp'){
            for(const duration of [2,3,4]){const branch=copy(done);branch[targetIndex].sleep=duration;activateBerry(branch[targetIndex],maxHP[targetIndex]);outputs.push({state:branch,probability:active*hit/3});}
            continue;
          }
        }
        if(effect.confuse&&!def.confusion&&ability!=='Own Tempo'&&!(def.terrain==='Misty'&&grounded(def))){for(const duration of [2,3,4,5]){const branch=copy(done);branch[targetIndex].confusion=duration;outputs.push({state:branch,probability:active*hit/4});}continue;}
        done.forEach((mon,k)=>activateBerry(mon,maxHP[k]));outputs.push({state:done,probability:active*hit});
      }else{
        for(const count of move.hit_counts||[{count:1,probability:1}]){
          let branches=[{state:copy(ready),probability:count.probability,damage:0}];
          for(let k=0;k<count.count;k++){
            const next=[];
            for(const b of branches){
              if(!b.state||b.stopped||b.state.some(mon=>mon.hp<=0)){next.push(b);continue;}
              const current=['Counter','Mirror Coat','Metal Burst'].includes(name)?move:describe(b.state,i,j),accuracy=k>0&&move.multiaccuracy?current.hit_chance??1:1;
              if(accuracy<1)next.push({...b,stopped:true,probability:b.probability*(1-accuracy)});
              const rolls=current.damage_rolls||[0];
              const distribution=current.hit_distributions?.[k]||current.hit_distributions?.[0]||current.damage_distribution||rolls.map(damage=>({damage,probability:1/rolls.length}));
              const histogram=new Map();
              for(const r of distribution){const value=Math.min(b.state[1-i].substitute&&!move.sound&&!move.bypass_substitute&&abilities[i]!=='Infiltrator'?b.state[1-i].substitute:b.state[1-i].hp-(b.state[1-i].endure?1:0),r.damage);histogram.set(value,(histogram.get(value)||0)+r.probability);}
              for(const [damage,p] of histogram){
                const done=copy(b.state),impact=hitTarget(done,i,damage,current,maxHP,r=>reasons.add(r));
                if(!impact){next.push({state:null,probability:b.probability*accuracy*p});continue;}
                const inflicted=impact.damage;
                if(inflicted>0&&move.drain){const heal=Math.max(1,Math.floor(inflicted*move.drain*(done[i].item==='Big Root'?1.3:1)));if(abilities[1-i]==='Liquid Ooze')indirect(done[i],heal);else done[i].hp=Math.min(maxHP[i],done[i].hp+heal);}
                if(!impact.substitute&&inflicted>0&&done[1-i].item==='Rocky Helmet'&&move.contact&&abilities[i]!=='Magic Guard'&&abilities[i]!=='Long Reach'&&done[i].item!=='Protective Pads')done[i].hp=Math.max(0,done[i].hp-Math.max(1,Math.floor(maxHP[i]/6)));
                if(inflicted>0&&done[1-i].status==='frz'&&(move.move_type==='Fire'||move.defrost))done[1-i].status='';
                if(!impact.substitute&&inflicted>0)removeItem(done,i,current);
                if(!impact.substitute&&inflicted>0&&name==='Clear Smog')for(const stat of Object.keys(done[1-i].boosts))done[1-i].boosts[stat]=0;
                if(inflicted>0&&name==='Rapid Spin'){done[i].seeded=false;done[i].trapTurns=0;}
                if(!impact.substitute&&inflicted>0&&['Bind','Wrap','Fire Spin','Whirlpool','Sand Tomb','Magma Storm','Infestation','Thunder Cage','Snap Trap'].includes(name)&&!done[1-i].trapTurns){done[1-i].pendingTrap=true;done[1-i].trapBand=done[i].item==='Binding Band';}
                const contacts=!impact.substitute&&inflicted>0?contactBranches(done,i,move):[{state:done,probability:1}];
                const secondaryMove=impact.substitute?{...move,secondary_effects:move.secondary_effects?.filter(e=>e.self)}:move;
                const secondaries=contacts.flatMap(c=>(inflicted>0?applySecondaries(c.state,i,secondaryMove,{field:currentField(c.state),unknown:r=>reasons.add(r)}):[{state:c.state,probability:1}]).map(e=>({...e,probability:e.probability*c.probability})));
                for(const effect of secondaries){
                  const settled=effect.state?resolveBerries(effect.state,maxHP):[{state:null,probability:1}];
                  for(const berry of settled)next.push({state:berry.state,damage:b.damage+inflicted,probability:b.probability*accuracy*p*effect.probability*berry.probability});
                }
              }
            }branches=merge(next);
          }
          for(const b of branches){
            if(!b.state){outputs.push({state:null,probability:active*hit*b.probability});continue;}
            const done=b.state,damage=b.damage;
            if(damage>0&&move.self_effect?.boosts&&done[i].hp>0)applyBoosts(done,i,move.self_effect.boosts);
            if(explosive)done[i].hp=0;
            if(name!=='Struggle'&&damage>0&&move.recoil&&!['Magic Guard','Rock Head'].includes(abilities[i]))indirect(done[i],Math.round(damage*move.recoil[0]/move.recoil[1]));
            if(move.mind_blown)indirect(done[i],Math.round(maxHP[i]/2));
            if(move.crash&&damage===0)indirect(done[i],maxHP[i]/2);
            if(damage>0&&(move.recharge||rechargeMoves.has(name)))done[i].recharge=true;
            if(['Rollout','Ice Ball'].includes(name)){done[i].rollingHits=damage>0?(done[i].rollingHits+1)%5:0;done[i].rolling=done[i].rollingHits?name:null;}
            if(name==='Struggle')done[i].hp=Math.max(0,done[i].hp-Math.max(1,snapshot.generation<=3?Math.floor(damage/(snapshot.generation===1?2:4)):snapshot.generation>=7?Math.round(maxHP[i]/4):Math.floor(maxHP[i]/4)));
            if(name!=='Struggle'&&damage>0&&done[i].item==='Life Orb'&&abilities[i]!=='Magic Guard'&&!(abilities[i]==='Sheer Force'&&move.sheer_force))done[i].hp=Math.max(0,done[i].hp-Math.max(1,Math.floor(maxHP[i]/10)));
            activateBerry(done[i],maxHP[i]);outputs.push({state:done,probability:active*hit*b.probability});
          }
        }
      }
    }
    const trapped=outputs.flatMap(b=>{
      if(!b.state||!b.state[1-i].pendingTrap)return [b];
      const durations=b.state[i].item==='Grip Claw'?[7]:[4,5];
      return durations.map(turns=>{const done=copy(b.state);done[1-i].pendingTrap=false;done[1-i].trapTurns=turns;return {state:done,probability:b.probability/durations.length};});
    });
    const rampages=trapped.flatMap(b=>{
      if(!b.state||!rampageMoves.has(name)||!b.state[i].attempted)return [b];
      const mon=b.state[i];
      if(mon.rampage&&mon.rampageTurns===null){reasons.add(`${name}: locked-attack duration is unavailable.`);return [{state:null,probability:b.probability}];}
      const durations=mon.rampage?[mon.rampageTurns]:[2,3],result=[];
      for(const turns of durations){const done=copy(b.state);done[i].rampage=name;done[i].rampageTurns=turns-1;
        if(turns>1)result.push({state:done,probability:b.probability/durations.length});
        else{done[i].rampage=null;done[i].rampageTurns=null;if(done[i].confusion||done[i].ability==='Own Tempo')result.push({state:done,probability:b.probability/durations.length});
          else for(const confusion of [2,3,4,5]){const branch=copy(done);branch[i].confusion=confusion;result.push({state:branch,probability:b.probability/durations.length/4});}}
      }return result;
    });
    return merge(rampages.filter(b=>b.probability>0).flatMap(b=>{if(!b.state)return b;activateTerrainSeeds(b.state);b.state.forEach((mon,k)=>{if(mon.ability==='Unburden'&&itemsBefore[k]&&!mon.item)mon.unburden=true;});return resolveBerries(b.state,maxHP).map(r=>({state:r.state,probability:b.probability*r.probability}));}));
  }
  const adapter={key:s=>s===null?'unknown':key(s),terminal:s=>s===null?null:s[0].hp<=0?0:s[1].hp<=0?1:null,
    actions:s=>s===null?[[],[]]:[legal(s,0),legal(s,1)],
    transitions:(s,a,b)=>{
      if(s.some(mon=>mon.pendingConfusion||mon.unknownBerryConfusion))return resolveBerries(copy(s),maxHP).flatMap(r=>r.state?adapter.transitions(r.state,a,b).map(t=>({state:t.state,probability:r.probability*t.probability})):[{state:null,probability:r.probability}]);
      const am=describe(s,0,a),bm=describe(s,1,b);
      const speed=(am.speed-bm.speed)*(s[0].trickRoom?-1:1);
      const order=am.priority!==bm.priority?Math.sign(am.priority-bm.priority):Math.sign(speed);
      const orders=order===0?[[0,0.5],[1,0.5]]:[[order>0?0:1,1]],out=[];
      for(const [first,p] of orders)for(const x of act(s,first,first===0?a:b,first===0?bm:am)){
        if(x.state===null){out.push({state:null,probability:p*x.probability});continue;}
        for(const y of act(x.state,1-first,first===0?b:a,first===0?am:bm)){
          if(y.state&&!y.state.some(mon=>mon.hp<=0)){
            const order=am.speed>=bm.speed?[0,1]:[1,0];
            for(const phase of ['weather','items','seed','status','trap','orbs']){
              if(!residualEffects(y.state,maxHP,r=>reasons.add(r),phase,order)){y.state=null;break;}
              if(['items','status','orbs'].includes(phase))endTurnItems(y.state,maxHP,y.state.map(mon=>mon.types||[]),abilities,phase,order);
              y.state.forEach((mon,k)=>activateBerry(mon,maxHP[k]));
              if(y.state.some(mon=>mon.hp<=0))break;
            }
            if(y.state)y.state.forEach((mon,k)=>{if(mon.encore){const slot=rows[k].findIndex(m=>m.name===mon.encore);if(mon.pp[slot]===0){mon.encore=null;mon.encoreTurns=0;}}});
            if(y.state&&!y.state.some(mon=>mon.hp<=0)&&!finishTimers(y.state,r=>reasons.add(r)))y.state=null;
          }
          if(y.state)y.state.forEach(mon=>{mon.flinched=false;mon.endure=false;mon.boostedThisTurn=false;mon.throatChop=Math.max(0,mon.throatChop-1);if(mon.rageConfusionPending){mon.rageConfusionPending=false;mon.pendingConfusion=true;}});
          const settled=y.state?resolveBerries(y.state,maxHP):[{state:null,probability:1}];
          for(const r of settled)out.push({state:r.state,probability:p*x.probability*y.probability*r.probability});
        }
      }
      return merge(out);
    }};
  const format=r=>({score:r.upper-r.lower>=1-1e-10?null:100*r.lower,
    provisional_score:Number.isFinite(r.partial_estimate)?100*r.partial_estimate:null,
    lower_bound:100*r.lower,upper_bound:100*r.upper,unresolved:r.upper-r.lower,
    score_kind:'certified-lower-bound',algorithm:'bounded-stochastic-game-search',opponent_model:'simultaneous minimax (mixed strategies)',
    ...Object.fromEntries(Object.entries(r).filter(([k])=>!['lower','upper'].includes(k))),
    omitted_moves:[...omitted],unresolved_reasons:[...reasons,...(r.complete?[]:['Search depth, work budget, matrix bounds, or an unsupported continuation leaves uncertainty.'])]});
  // Exchange symmetry is an exact 1/2 value in this zero-sum game, provided
  // both sides have the same legal model. Never use it to hide missing moves.
  const symSide=i=>{
    const s=structuredClone(sides[i]);delete s.current_hp;
    s.build={...s.build};s.effects={...s.effects};
    if(s.build.status==='slp'&&s.effects.sleep_counter<=(abilities[i]==='Early Bird'?2:1)){
      s.build.status='';delete s.effects.sleep_counter;
    }
    return JSON.stringify([s,maxHP[i],rows[i].map(m=>[m.name,m.available,m.damage_distribution||m.damage_rolls,m.hit_chance,m.speed,m.priority])]);
  };
  const symmetricStatus=s=>['','par','slp','frz'].includes(s.status);
  const symmetric=JSON.stringify(snapshot.field.attackerSide||{})===JSON.stringify(snapshot.field.defenderSide||{})&&initial[0].hp===initial[1].hp&&symSide(0)===symSide(1)&&
    initial.every(s=>s.pp.every(n=>n===null)&&!s.item&&symmetricStatus(s)&&!s.confusion&&!s.weather&&!s.terrain&&!s.reflect&&!s.lightScreen&&!s.tailwind&&!s.trickRoom&&['','Run Away','Keen Eye'].includes(s.ability))&&
    rows.every(rs=>rs.every(m=>['Tackle','Leafage','Scratch','Pound'].includes(m.name))&&rs.some(m=>m.damage_rolls?.some(d=>d>0)))&&legal(initial,0).length>0&&
    !initial.some(s=>s.status==='slp'&&s.sleep===null||s.unknownEffects.length||s.status==='tox'&&s.toxic===null||s.disguise===null||s.weather&&s.weatherTurns===null||s.terrain&&s.terrainTurns===null||s.reflect&&s.reflectTurns===null||s.lightScreen&&s.lightScreenTurns===null||s.tailwind&&s.tailwindTurns===null||s.trickRoom&&s.trickRoomTurns===null);
  const result=symmetric?{lower:0.5,upper:0.5,nodes:0,cache_hits:0,merged_branches:0,pruned_actions:0,pruned_chance_branches:0,depth:0,elapsed_ms:0,complete:true,symmetry:true}:
    searchBattle(adapter,initial.some(s=>s.unknownEffects.length)?null:initial,{focusedStrategy:true,...options,workEstimate:state=>{
      if(!state)return 4;
      const power=i=>Math.max(1,...legal(state,i).map(j=>describe(state,i,j)).filter(m=>m&&!m.status_move).map(m=>expectedMoveDamage(m)*(m.hit_chance??1)));
      return Math.max(1,Math.min(4,Math.min(state[1].hp/power(0),state[0].hp/power(1))));
    },evaluate:state=>{
      // A finite frontier evaluation, like a chess leaf evaluation. Actual
      // expanded turns replace this approximation; it never narrows bounds.
      return frontierOutlookValue(state,legal,describe);
    },onProgress:r=>options.onProgress?.(format(r))});
  if(initial.some((s,i)=>!legal(initial,i).length))reasons.add('A side has no modeled damaging move or supported status move.');
  for(const s of initial)for(const effect of s.unknownEffects)reasons.add(`Live effect is unavailable: ${effect}.`);
  if(initial.some(s=>s.natureUnknown))reasons.add('Live nature is unavailable; a pinch berry that may cause confusion leaves an unresolved branch.');
  return format(result);
}
