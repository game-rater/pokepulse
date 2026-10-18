const copy=s=>s.map(p=>({...p,boosts:{...p.boosts},pp:[...p.pp]}));
const grounded=(mon,field)=>field.isGravity||(!mon.types.includes('Flying')&&mon.ability!=='Levitate'&&mon.item!=='Air Balloon');
const bypasses=(source,move)=>['Mold Breaker','Teravolt','Turboblaze'].includes(source.ability)||['Sunsteel Strike','Moongeist Beam','Photon Geyser','Light That Burns the Sky'].includes(move?.name);
export function statusImmune(status,mon,field={},source={}){
  const types=mon.types||[],ability=mon.ability||'';
  if(ability==='Comatose'||ability==='Leaf Guard'&&(field.weather||'').includes('Sun'))return true;
  if(field.terrain==='Misty'&&grounded(mon,field))return true;
  if(status==='slp')return ['Insomnia','Vital Spirit','Sweet Veil'].includes(ability)||field.terrain==='Electric'&&grounded(mon,field);
  if(status==='par')return types.includes('Electric')||ability==='Limber';
  if(status==='brn')return types.includes('Fire')||['Water Veil','Water Bubble'].includes(ability);
  if(status==='frz')return types.includes('Ice')||ability==='Magma Armor'||(field.weather||'').includes('Sun');
  if(['psn','tox'].includes(status))return ability==='Immunity'||types.some(t=>['Poison','Steel'].includes(t))&&source.ability!=='Corrosion';
  return false;
}
export function applyBoosts(state,target,boosts,{source=target,reflected=false,ignoreAbility=false}={}){
  const mon=state[target];if(mon.hp<=0)return;
  const ability=ignoreAbility&&mon.ability!=='Full Metal Body'?'':mon.ability;
  let hostileDrop=false;
  for(const [stat,amount] of Object.entries(boosts)){
    if(amount<0&&source!==target){
      if(['Clear Body','White Smoke','Full Metal Body'].includes(ability)||mon.item==='Clear Amulet'||
        stat==='atk'&&ability==='Hyper Cutter'||stat==='def'&&ability==='Big Pecks'||stat==='accuracy'&&ability==='Keen Eye')continue;
      if(ability==='Mirror Armor'&&!reflected){applyBoosts(state,source,{[stat]:amount},{source:target,reflected:true});continue;}
    }
    const delta=amount*(ability==='Contrary'?-1:ability==='Simple'?2:1),old=mon.boosts[stat]||0;
    mon.boosts[stat]=Math.max(-6,Math.min(6,old+delta));
    if(mon.boosts[stat]>old)mon.boostedThisTurn=true;
    if(mon.boosts[stat]<old&&source!==target)hostileDrop=true;
  }
  if(hostileDrop&&['Defiant','Competitive'].includes(mon.ability))applyBoosts(state,target,{[mon.ability==='Defiant'?'atk':'spa']:2});
  if(mon.item==='White Herb'&&Object.values(mon.boosts).some(n=>n<0)){for(const stat of Object.keys(mon.boosts))if(mon.boosts[stat]<0)mon.boosts[stat]=0;mon.item='';}
}
export function applySecondaries(state,user,move,{field={},unknown=()=>{}}={}){
  if(state[user].ability==='Sheer Force'&&move.secondary_effects?.length)return [{state,probability:1}];
  let branches=[{state,probability:1}];
  const effects=move.secondary_effects?.length?move.secondary_effects:move.flinch?[{chance:100*move.flinch,volatileStatus:'flinch'}]:[];
  for(let effect of effects){
    if(move.name==='Secret Power')effect={...effect,...(field.terrain==='Misty'?{status:undefined,boosts:{spa:-1}}:field.terrain==='Psychic'?{status:undefined,boosts:{spe:-1}}:field.terrain==='Grassy'?{status:'slp'}:{status:'par'})};
    const next=[];
    for(const branch of branches){
      if(!branch.state){next.push(branch);continue;}
      const s=branch.state,target=s[1-user],attacker=s[user];
      if(target.hp<=0&&!effect.self||attacker.hp<=0||effect.requiresBoost&&!target.boostedThisTurn){next.push(branch);continue;}
      const ignoreAbility=bypasses(attacker,move),targetAbility=ignoreAbility?'':target.ability;
      const targetBlocked=targetAbility==='Shield Dust'||target.item==='Covert Cloak';
      if(targetBlocked&&!effect.self){next.push(branch);continue;}
      const chance=Math.min(1,(effect.chance??100)/100*(attacker.ability==='Serene Grace'&&move.name!=='Secret Power'?2:1));
      if(chance<1)next.push({state:s,probability:branch.probability*(1-chance)});
      const statuses=effect.statuses||[effect.status];
      for(const status of statuses){
        const done=copy(s),recipient=done[1-user],source=done[user];
        let duration=null;
        if(effect.boosts)applyBoosts(done,1-user,effect.boosts,{source:user,ignoreAbility});
        if(effect.self?.boosts)applyBoosts(done,user,effect.self.boosts);
        if(effect.self?.terrain)done.forEach(mon=>{mon.terrain=effect.self.terrain;mon.terrainTurns=5;});
        if(status&&!recipient.status&&!statusImmune(status,{...recipient,ability:ignoreAbility&&!['Comatose','Shields Down'].includes(recipient.ability)?'':recipient.ability},field,source)){
          recipient.status=status;if(status==='tox')recipient.toxic=1;if(status==='slp')duration=[2,3,4];
        }
        if(effect.volatileStatus==='flinch'&&targetAbility!=='Inner Focus')recipient.flinched=true;
        if(effect.volatileStatus==='confusion'&&!recipient.confusion&&targetAbility!=='Own Tempo'&&!(field.terrain==='Misty'&&grounded(recipient,field)))duration=[2,3,4,5];
        if(effect.volatileStatus==='sparklingaria'&&recipient.status==='brn')recipient.status='';
        if(effect.volatileStatus==='trapped')recipient.trapped=true;
        if(effect.volatileStatus==='throatchop')recipient.throatChop=3;
        if(effect.ppDrain){
          if(recipient.lastMove===null||recipient.pp[recipient.lastMove]===null){unknown(`${move.name}: the target's last move or its PP is unavailable.`);next.push({state:null,probability:branch.probability*chance/statuses.length});continue;}
          recipient.pp[recipient.lastMove]=Math.max(0,recipient.pp[recipient.lastMove]-effect.ppDrain);
        }
        const known=effect.boosts||effect.self?.boosts||effect.self?.terrain||status||effect.volatileStatus||effect.ppDrain;
        if(!known){unknown(`${move.name}: secondary callback metadata is unavailable.`);next.push({state:null,probability:branch.probability*chance/statuses.length});continue;}
        if(duration)for(const turns of duration){const timed=copy(done);if(status==='slp')timed[1-user].sleep=turns;else timed[1-user].confusion=turns;next.push({state:timed,probability:branch.probability*chance/statuses.length/duration.length});}
        else next.push({state:done,probability:branch.probability*chance/statuses.length});
      }
    }branches=next;
  }
  return branches.filter(b=>b.probability>0);
}
