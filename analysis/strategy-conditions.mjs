// Cheap, state-local requirements shared by every indexed strategy. These
// describe opportunities, not certified legality, damage or winning replies.
const choices=p=>p.moveSlots.filter(s=>s.pp>0).map(s=>p.battle.dex.moves.get(s.id));
const poisonAbilities=['immunity','pastelveil','comatose','purifyingsalt'];
const healingBerries=['sitrusberry','oranberry','figyberry','wikiberry','magoberry','aguavberry','iapapaberry'];
export function selfBoostChanges(m){
 const changes=[];
 const add=x=>{if(x?.boosts)changes.push(x.boosts);};
 if(m.target==='self')add(m);add(m.self);add(m.selfBoost);
 for(const e of [m.secondary,...m.secondaries||[]])if(e){add(e.self);if(m.target==='self')add(e);}
 if(m.id==='bellydrum')changes.push({atk:12});
 if(m.id==='curse')changes.push({atk:1,def:1,spe:-1});
 if(m.id==='stockpile')changes.push({def:1,spd:1});
 return changes;
}
export function inflictedStatuses(m){return [...new Set([m.target!=='self'&&m.status,...[m.secondary,...m.secondaries||[]].map(e=>e?.status)].filter(Boolean))];}
export function createStrategyRequirements(p,facts){
 const q=p.side.foe.active[0],b=p.battle,d=b.dex,memo=new Map();
 const has=(a,kind,names)=>names.split(',').some(n=>kind==='ability'?a.hasAbility(n):kind==='item'?a.hasItem(n):kind==='type'?a.hasType(n):kind==='volatile'?!!a.volatiles[n]:kind==='side'?!!a.side.sideConditions[n]:kind==='boost'?a.boosts[n]>0:false);
 const last=q.lastMove,slot=last&&q.moveSlots.find(s=>s.id===last.id),enc=q.volatiles.encore;
 const slower=()=>p.getStat('spe')<q.getStat('spe'),faster=()=>p.getStat('spe')>q.getStat('spe');
 function evaluate(req){
  if(req.startsWith('!'))return !check(req.slice(1));
  if(facts.has(req))return true;
  const [who,kind,value]=req.split(':');
  if(value&&['self','foe'].includes(who)&&['ability','item','type','volatile','side','boost'].includes(kind))return has(who==='self'?p:q,kind,value);
  if(who==='field'&&kind==='pseudo')return !!b.field.pseudoWeather[value];
  if(who==='field'&&kind==='terrain')return b.field.terrain===value;
  switch(req){
   case 'self:status-free':return !p.status&&!p.hasAbility('comatose');
   case 'foe:status-free':return !q.status&&!q.hasAbility('comatose');
   case 'self:poison':return ['psn','tox'].includes(p.status);
   case 'self:facade-status':return ['brn','par','psn','tox'].includes(p.status);
   case 'self:transferable-status':return !!p.status&&!q.status;
   case 'self:full':return p.hp===p.maxhp;
   case 'self:low-third':return p.hp<=p.maxhp/3;
   case 'self:curse-hp':return p.hp>p.maxhp/2;
   case 'self:itemless':return !p.item;
   case 'self:grounded':return !!p.isGrounded();
   case 'foe:grounded':return !!q.isGrounded();
   case 'foe:ground-immune':return !q.isGrounded();
   case 'self:slower':return slower();
   case 'self:faster':return p.getActionSpeed()>q.getActionSpeed();
   case 'self:not-faster':return !faster();
   case 'self:defensive-boost':return p.boosts.def>0||p.boosts.spd>0;
   case 'self:offensive-boost':return p.boosts.atk>0||p.boosts.spa>0;
   case 'self:no-defense-drops':return p.boosts.def>=0&&p.boosts.spd>=0;
   case 'self:transformed':return !!p.transformed;
   case 'self:after-heal':return !!p.lastMove&&(!!p.lastMove.heal||['rest','synthesis','morningsun','moonlight','shoreup'].includes(p.lastMove.id));
   case 'foe:sleep-susceptible':return !q.status&&!q.hasAbility(['insomnia','vitalspirit','sweetveil','comatose','purifyingsalt'])&&!q.side.sideConditions.safeguard&&!(q.isGrounded()&&['electricterrain','mistyterrain'].includes(b.field.terrain));
   case 'foe:atk-up':return q.boosts.atk>0;
   case 'foe:offense-down':return q.boosts.atk<0&&check('foe:physical-moves')||q.boosts.spa<0&&check('foe:special-moves');
   case 'foe:stronger-offense':return q.storedStats.atk>p.storedStats.atk||q.storedStats.spa>p.storedStats.spa;
   case 'foe:matching-offense':return check('foe:damaging-moves');
   case 'foe:physical-moves':return choices(q).some(m=>m.category==='Physical');
   case 'foe:special-moves':return choices(q).some(m=>m.category==='Special');
   case 'foe:damaging-moves':return choices(q).some(m=>m.category!=='Status');
   case 'foe:status-moves':return choices(q).some(m=>m.category==='Status');
   case 'foe:screenable-moves':return check('foe:damaging-moves')&&!q.hasAbility('infiltrator');
   case 'foe:pp':return q.moveSlots.some(s=>s.pp>0);
   case 'foe:last-status':return last?.category==='Status';
   case 'foe:last-damaging':return !!last&&last.category!=='Status';
   case 'foe:disableable':return !!last&&!!slot?.pp&&!last.isZOrMaxPowered&&!last.isMax&&last.id!=='struggle'&&!q.volatiles.disable;
   case 'foe:encoreable':return !!last&&!!slot?.pp&&!last.isZ&&!last.isMax&&!last.flags?.failencore&&!q.volatiles.encore&&!q.volatiles.dynamax;
   case 'foe:encore-matches-last':return !!last&&enc?.move===last.id;
   case 'foe:encored-status':return !!enc?.move&&d.moves.get(enc.move).category==='Status';
   case 'foe:encored-damaging':return !!enc?.move&&d.moves.get(enc.move).category!=='Status';
   case 'foe:choice-locked':return !!q.volatiles.choicelock&&q.hasItem(['choiceband','choicescarf','choicespecs']);
   case 'foe:item-transferable':return !q.hasAbility('stickyhold')&&!q.getItem().isPrimalOrb&&!q.getItem().megaStone&&!q.getItem().onTakeItem;
   case 'foe:poison-type-immune':return q.hasType(['Poison','Steel']);
   case 'foe:poison-ability-immune':return q.hasAbility(poisonAbilities)||q.hasAbility('leafguard')&&facts.has('weather:sun');
   case 'foe:suppressible-poison-ability':return q.hasAbility([...poisonAbilities,'poisonheal','magicguard'])&&!q.getAbility().flags?.cantsuppress;
   case 'foe:poison-damage':return !q.hasAbility(['poisonheal','magicguard']);
   case 'self:berry-usable':return !q.hasAbility('unnerve')&&!p.ignoringItem();
   case 'self:healing-berry':return p.hasItem(healingBerries);
   case 'self:recyclable-berry':return !p.item&&!!p.lastItem&&!!d.items.get(p.lastItem).isBerry;
   case 'self:harvest-berry':return !!p.getItem().isBerry||!p.item&&!!p.lastItem&&!!d.items.get(p.lastItem).isBerry;
   case 'self:orb-susceptible':return !p.ignoringItem()&&(p.hasItem('flameorb')&&!p.hasType('Fire')&&!p.hasAbility(['waterveil','waterbubble','comatose','purifyingsalt'])||p.hasItem('toxicorb')&&!p.hasType(['Poison','Steel'])&&!p.hasAbility(poisonAbilities));
   case 'self:flingable-item':return !!p.getItem().fling&&!p.ignoringItem()&&!p.volatiles.embargo&&!b.field.pseudoWeather.magicroom;
   case 'self:critical-kit':return p.hasItem(['scopelens','razorclaw'])||p.hasAbility(['sniper','superluck']);
   case 'self:drum-berry-threshold':return p.hp>p.maxhp/2&&(p.hp-Math.floor(p.maxhp/2)<=p.maxhp/(p.hasAbility('gluttony')||p.hasItem(['sitrusberry','oranberry'])?2:4));
   case 'self:wish-pending':return !!p.side.slotConditions[p.position]?.wish;
   case 'self:screen-active':return ['reflect','lightscreen','auroraveil'].some(id=>p.side.sideConditions[id]);
   case 'self:last-resort-ready':return p.moveSlots.length>1&&p.moveSlots.filter(s=>s.id!=='lastresort').every(s=>s.used);
   case 'self:survival':return p.hp>1&&(p.hasItem('focussash')&&p.hp===p.maxhp||p.hasAbility('sturdy')&&p.hp===p.maxhp||p.hp>=p.maxhp/2);
   case 'foe:higher-maxhp':return q.maxhp>p.maxhp;
   case 'foe:endeavor-range':return q.hp<=p.hp;
   case 'foe:super-effective-move':return choices(q).some(m=>m.category!=='Status'&&d.getEffectiveness(m.type,p)>0&&d.getImmunity(m.type,p));
   case 'self:matching-seed':return ['electric','psychic','grassy','misty'].some(t=>p.hasItem(t+'seed')&&p.moveSlots.some(s=>s.pp>0&&d.moves.get(s.id).terrain===t+'terrain'));
   case 'self:weather-speed-setter':return [['swiftswim','raindance'],['sandrush','sandstorm'],['slushrush','hail']].some(([a,w])=>p.hasAbility(a)&&p.moveSlots.some(s=>s.pp>0&&String(d.moves.get(s.id).weather).toLowerCase()===w));
   case 'self:weather-speed-active':return p.hasAbility('swiftswim')&&facts.has('weather:rain')||p.hasAbility('sandrush')&&facts.has('weather:sand')||p.hasAbility('slushrush')&&facts.has('weather:hail');
   case 'weather:rain-survives':return !b.field.weatherState.duration||b.field.weatherState.duration>1;
   default:return false;
  }
 }
 function check(req){if(!memo.has(req))memo.set(req,!!evaluate(req));return memo.get(req);}
 return check;
}

export function expandedMoveEligible(p,m,tag,check){
 const q=p.side.foe.active[0],b=p.battle;
 if(['fakeout','firstimpression','matblock'].includes(m.id)&&p.activeMoveActions>0)return false;
 if(tag==='history:unused'&&(m.id==='lastresort'||p.moveSlots.find(s=>s.id===m.id)?.used))return false;
 if(m.id==='lastresort'&&!check('self:last-resort-ready'))return false;
 if(['encore','disable'].includes(m.id)&&!check('foe:'+m.id+'able'))return false;
 if(m.id==='psychoshift'&&!check('self:transferable-status'))return false;
 if(m.id==='fling'&&!check('self:flingable-item'))return false;
 if(m.id==='recycle'&&(!p.lastItem||p.item))return false;
 if(m.id==='painsplit'&&p.hp>=q.hp)return false;
 if(m.id==='nightmare'&&(!check('foe:slp')||q.volatiles.nightmare))return false;
 if(m.id==='yawn'&&(q.status||q.volatiles.yawn||q.hasAbility(['insomnia','vitalspirit','sweetveil','comatose'])))return false;
 if(m.id==='darkvoid'&&p.species.id!=='darkrai')return false;
 if(m.id==='auroraveil'&&!check('weather:hail'))return false;
 if(m.id==='transform'&&(p.transformed||q.transformed||q.volatiles.substitute||q.volatiles.illusion))return false;
 if(m.id==='curse'&&p.hasType('Ghost')&&(q.volatiles.curse||p.hp<=p.maxhp/2))return false;
 if(['counter','mirrorcoat'].includes(m.id)){
  const category=m.id==='counter'?'Physical':'Special';
  const locked=q.volatiles.encore?.move;
  if(locked&&b.dex.moves.get(locked).category!==category)return false;
  if(!choices(q).some(a=>a.category===category)||!b.dex.getImmunity(m.type,q))return false;
 }
 if(tag.startsWith('drop:')){
  const stat=tag.slice(5);if(stat==='atk'&&!check('foe:physical-moves')||stat==='spa'&&!check('foe:special-moves'))return false;
 }
 if(tag==='attack:flinch'&&(!check('self:faster')||q.hasAbility(['innerfocus','shielddust'])))return false;
 if(tag==='side:screen'&&!(m.sideCondition==='reflect'&&check('foe:physical-moves')||m.sideCondition==='lightscreen'&&check('foe:special-moves')||m.sideCondition==='auroraveil'))return false;
 if(m.sideCondition&&p.side.sideConditions[m.sideCondition])return false;
 if(m.pseudoWeather&&b.field.pseudoWeather[m.pseudoWeather])return false;
 if(m.terrain&&b.field.terrain===m.terrain)return false;
 if(tag==='terrain:seed'&&!p.hasItem(m.terrain.replace('terrain','')+'seed'))return false;
 if(tag==='weather:speed'){
  const ability={raindance:'swiftswim',sandstorm:'sandrush',hail:'slushrush'}[m.weather.toLowerCase()];
  if(!ability||!p.hasAbility(ability))return false;
 }
 if(m.volatileStatus&&['taunt','torment','confusion','partiallytrapped'].includes(m.volatileStatus)&&q.volatiles[m.volatileStatus])return false;
 if(tag==='volatile:confusion'&&q.hasAbility('owntempo'))return false;
 return true;
}
