// Stateful item effects; these are modeled rules, not live-verified ROM timings.
const flavorStats={'Figy Berry':'atk','Wiki Berry':'spa','Mago Berry':'spe','Aguav Berry':'spd','Iapapa Berry':'def'};
const loweredStat=Object.fromEntries(Object.entries({atk:['Bold','Timid','Modest','Calm'],def:['Lonely','Hasty','Mild','Gentle'],spa:['Adamant','Impish','Jolly','Careful'],spd:['Naughty','Lax','Naive','Rash'],spe:['Brave','Relaxed','Quiet','Sassy']}).flatMap(([stat,natures])=>natures.map(n=>[n,stat])));
export function activateBerry(mon,maxHP){
  if(mon.hp<=0||mon.berryBlocked||mon.ability==='Klutz')return;
  const pinchBerries=['Figy Berry','Wiki Berry','Mago Berry','Aguav Berry','Iapapa Berry'];
  const cures={'Chesto Berry':'slp','Pecha Berry':'psn','Rawst Berry':'brn','Aspear Berry':'frz','Cheri Berry':'par'};
  let used=false;
  if(mon.item==='Lum Berry'&&(mon.status||mon.confusion)){mon.status='';mon.sleep=null;mon.confusion=0;used=true;}
  else if(cures[mon.item]&&(mon.status===cures[mon.item]||mon.item==='Pecha Berry'&&mon.status==='tox')){mon.status='';mon.sleep=null;used=true;}
  else if(mon.item==='Persim Berry'&&mon.confusion){mon.confusion=0;used=true;}
  else if(mon.hp<=maxHP/2&&['Oran Berry','Sitrus Berry'].includes(mon.item)){
    mon.hp=Math.min(maxHP,mon.hp+(mon.item==='Oran Berry'?10:Math.max(1,Math.floor(maxHP/4))));used=true;
  }else if(mon.hp<=maxHP/(mon.ability==='Gluttony'?2:4)&&pinchBerries.includes(mon.item)){
    if(mon.natureUnknown&&mon.ability!=='Own Tempo'&&!mon.confusion)mon.unknownBerryConfusion=true;
    mon.hp=Math.min(maxHP,mon.hp+Math.max(1,Math.floor(maxHP/2))*(mon.ability==='Ripen'?2:1));
    if(loweredStat[mon.nature]===flavorStats[mon.item]&&mon.ability!=='Own Tempo'&&!mon.confusion)mon.pendingConfusion=true;
    used=true;
  }
  if(used){mon.item='';if(mon.ability==='Unburden')mon.unburden=true;}
}
// Duration is random; enumerate it instead of assigning a fixed berry timer.
export function resolveBerries(state,maxHP){
  const copy=s=>s.map(p=>({...p,boosts:{...p.boosts},pp:[...(p.pp||[])]}));
  let branches=[{state,probability:1}];
  for(let i=0;i<state.length;i++){
    const next=[];
    for(const branch of branches){if(!branch.state){next.push(branch);continue;}activateBerry(branch.state[i],maxHP[i]);
      if(branch.state[i].unknownBerryConfusion){next.push({state:null,probability:branch.probability});continue;}
      if(branch.state[i].pendingConfusion){
        for(const duration of [2,3,4,5]){const s=copy(branch.state);s[i].pendingConfusion=false;s[i].confusion=duration;next.push({state:s,probability:branch.probability/4});}
      }else next.push(branch);
    }branches=next;
  }
  return branches;
}
export function applyHeldDamage(target,damage,maxHP,{multiHit=false}={}){
  const before=target.hp;
  if(damage>=target.hp&&target.hp===maxHP&&target.item==='Focus Sash'&&!multiHit){target.hp=1;target.item='';}
  else target.hp=Math.max(0,target.hp-damage);
  const inflicted=before-target.hp;activateBerry(target,maxHP);return inflicted;
}
export function endTurnItems(state,maxHP,types,abilities=['',''],phase='all',order=[0,1]){
  if(phase==='all'){for(const part of ['items','status','orbs'])endTurnItems(state,maxHP,types,abilities,part,order);return;}
  for(const i of order){
    if(state.some(mon=>mon.hp<=0))break;
    const mon=state[i];if(mon.hp<=0)continue;
    const ability=abilities[i];
    if(phase==='status'){
    if(['psn','tox'].includes(mon.status)&&ability==='Poison Heal')mon.hp=Math.min(maxHP[i],mon.hp+Math.max(1,Math.floor(maxHP[i]/8)));
    else if(ability!=='Magic Guard'){
      let damage=0;
      if(mon.status==='brn')damage=Math.max(1,Math.floor(maxHP[i]/16));
      if(mon.status==='psn')damage=Math.max(1,Math.floor(maxHP[i]/8));
      if(mon.status==='tox'){damage=Math.max(1,Math.floor(maxHP[i]/16))*(mon.toxic||1);mon.toxic=Math.min(15,(mon.toxic||1)+1);}
      mon.hp=Math.max(0,mon.hp-damage);
    }
    }
    if(mon.hp<=0)continue;
    if(phase==='items'){
    if(mon.item==='Leftovers'||mon.item==='Black Sludge'&&types[i].includes('Poison'))mon.hp=Math.min(maxHP[i],mon.hp+Math.max(1,Math.floor(maxHP[i]/16)));
    else if(mon.item==='Black Sludge'&&ability!=='Magic Guard')mon.hp=Math.max(0,mon.hp-Math.max(1,Math.floor(maxHP[i]/8)));
    }
    if(phase==='orbs'){
    if(!mon.status&&mon.item==='Flame Orb'&&!types[i].includes('Fire')&&!['Water Veil','Water Bubble','Comatose'].includes(ability))mon.status='brn';
    if(!mon.status&&mon.item==='Toxic Orb'&&!types[i].some(t=>['Poison','Steel'].includes(t))&&!['Immunity','Comatose'].includes(ability)){mon.status='tox';mon.toxic=1;}
    if(mon.item==='Micle Berry'&&mon.hp<=maxHP[i]/(mon.ability==='Gluttony'?2:4)&&!mon.berryBlocked&&mon.ability!=='Klutz'){mon.item='';mon.micle=true;mon.micleTurns=2;if(mon.ability==='Unburden')mon.unburden=true;}
    }
    activateBerry(mon,maxHP[i]);
  }
}
