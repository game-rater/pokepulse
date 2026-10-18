import calculator from '../vendor/run-bun/index.js';
const gen=calculator.Generations.get(8);
const requireCondition=(ok,message)=>{if(!ok)throw Error('Strategy oracle precondition: '+message);};
// Deliberately separate from native mechanics, production policies, heuristics,
// and proof providers. Scope is narrow and checked, not a second general engine.
export function strategyOracle(fixture){
 const {player:p,opponent:q,field}=fixture.snapshot;
 requireCondition(!Object.keys(field).length,'empty field');
 const make=(s,boost=0)=>new calculator.Pokemon(gen,s.species,{...s.build,ability:s.build.ability||'No Ability',boosts:{...s.build.boosts,atk:boost},curHP:s.current_hp});
 for(const s of [p,q]){
  requireCondition(['','Steadfast'].includes(s.build.ability)&&!s.build.item,'only inert ability, no item');
  requireCondition(Object.values(s.build.boosts).every(x=>x===0),'neutral initial boosts');
  requireCondition(Object.entries(make(s).rawStats).every(([k,v])=>s.actual_stats[k]===v),'calculator stats');
  requireCondition(Number.isInteger(s.current_hp)&&s.current_hp>0&&s.current_hp<=s.actual_stats.hp,'valid HP');
  requireCondition(!make(s).types.includes('Ghost'),'no immunity to fixed Fighting damage');
  requireCondition(s.build.moves.every(m=>Number.isInteger(s.pp[m])&&s.pp[m]>0),'positive integer PP');
  requireCondition(Object.keys(s.effects).every(k=>['live_data','first_turn','move_history_known','protect_streak','toxic_counter'].includes(k)),'no other effects');
 }
 requireCondition(!p.build.status&&['','tox'].includes(q.build.status),'only enemy toxic');
 requireCondition(!make(q).types.some(t=>['Poison','Steel'].includes(t)),'toxic-vulnerable target');
 requireCondition(Number.isInteger(q.effects.toxic_counter??0)&&(q.effects.toxic_counter??0)>=0&&(q.effects.toxic_counter??0)<=15,'valid toxic stage');
 requireCondition(p.actual_stats.spe>q.actual_stats.spe,'player strictly faster');
 requireCondition(q.build.moves.length===1&&['Strength','Seismic Toss'].includes(q.build.moves[0]),'one accurate unmodified retaliation');
 requireCondition(p.build.moves.every(m=>['Recover','Seismic Toss','Swords Dance','Tackle'].includes(m)),'supported actions');
 // Supported attacks have no secondary effect, recoil, or accuracy draw.
 const distributions=new Map();
 function damage(a,b,name,boost=0){
  const key=(a===p?'p':'q')+name+boost;if(distributions.has(key))return distributions.get(key);
  if(name==='Seismic Toss')return [{damage:a.build.level,probability:1}];
  const merged=new Map();
  for(const [isCrit,weight] of [[false,15/16],[true,1/16]]){
   const rolls=calculator.calculate(gen,make(a,boost),make(b),new calculator.Move(gen,name,{isCrit})).damage;
   requireCondition(Array.isArray(rolls)&&rolls.length===16&&rolls.every(Number.isInteger),'16 damage rolls');
   for(const d of rolls)merged.set(d,(merged.get(d)||0)+weight/16);
  }
  const result=[...merged].map(([damage,probability])=>({damage,probability}));distributions.set(key,result);return result;
 }
 const enemy=damage(q,p,q.build.moves[0]),cache=new Map();let branches=0;
 const initialPP=p.build.moves.map(m=>p.pp[m]),enemyPP=q.pp[q.build.moves[0]];
 const visit=(hp,target,boost,t,pp)=>{
  if(target<=0)return 1;if(hp<=0)return 0;
  requireCondition(t<enemyPP&&pp.some(n=>n>0),'no Struggle reached');
  requireCondition(t<12&&cache.size<200000,'bounded independent enumeration');
  const key=[hp,target,boost,t,...pp].join(',');if(cache.has(key))return cache.get(key).value;
  const values=p.build.moves.map((name,i)=>{
   if(!pp[i])return -1;const nextPP=pp.slice();nextPP[i]--;
   const healed=name==='Recover'?Math.min(p.actual_stats.hp,hp+Math.round(p.actual_stats.hp/2)):hp;
   const nextBoost=name==='Swords Dance'?Math.min(6,boost+2):boost;
   const outcomes=['Recover','Swords Dance'].includes(name)?[{damage:0,probability:1}]:damage(p,q,name,boost);
   let value=0;
   for(const a of outcomes){
    if(a.damage>=target){value+=a.probability;continue;}
    for(const b of enemy){branches++;const left=healed-b.damage;
     if(left<=0)continue;
     const toxic=q.build.status==='tox'?Math.max(1,Math.floor(q.actual_stats.hp/16))*Math.min(15,(q.effects.toxic_counter||0)+t+1):0;
     value+=a.probability*b.probability*visit(left,target-a.damage-toxic,nextBoost,t+1,nextPP);
    }
   }
   return value;
  });
  const value=Math.max(...values);cache.set(key,{value,values});return value;
 };
 const value=visit(p.current_hp,q.current_hp,0,0,initialPP),root=cache.get([p.current_hp,q.current_hp,0,0,...initialPP].join(','));
 return {expected_percent:value*100,fraction:'finite-enumeration',root_action_values:root.values.map(v=>v*100),states:cache.size,branches,
  proof:'Independent HP/PP/stage dynamic program; 1/16 critical chance and all 16 uniform damage rolls, faster player action, enemy retaliation, then toxic. Root values follow listed move order. No production search or native simulator used.'};
}
