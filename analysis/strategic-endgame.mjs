// Compile a small native-mechanics domain into an HP/stage dynamic program.
// No benchmark identifiers, reference targets, NPC choices or heuristics enter
// the proof. Unsupported interactions and exhausted budgets decline it.
import {restoreCompleteBattle,nativeMoveChoices,installChanceTape} from './native-battle.mjs';
const inert=new Set(['','steadfast','synchronize','innerfocus','naturalcure','runaway']);
const playerMoves=new Set(['recover','swordsdance','tackle','seismictoss']);
const empty=x=>!x||!Object.keys(x).length;
const timeout=Symbol('strategic proof budget');
export function solveStrategicEndgame(state,options={}){
 if(options.exactEndgames===false||state?.kind!=='decision'||state.saved?.midTurn||state.unknownNature?.some(Boolean)||options.shouldStop?.())return null;
 const start=performance.now(),deadline=Math.min(options.deadline??Infinity,start+(options.exactEndgameMs??50));
 const stop=()=>{if(options.shouldStop?.()||performance.now()>deadline)throw timeout;};
 const saved=state.saved.sides.map(s=>s.pokemon[0]);
 if(saved.some(p=>!Number.isInteger(p.hp)||!Number.isInteger(p.maxhp)||p.hp>p.maxhp||!Number.isInteger(p.set.level)||p.moveSlots.some(m=>!Number.isInteger(m.pp)||m.pp<0)))return null;
 if(saved.some(p=>p.item||!inert.has(p.ability)||!empty(p.volatiles)||Object.values(p.boosts).some(Boolean))||saved[0].status||!['','tox'].includes(saved[1].status))return null;
 if(saved[0].moveSlots.some(m=>!playerMoves.has(m.id))||saved[1].moveSlots.length!==1||!['strength','seismictoss'].includes(saved[1].moveSlots[0].id))return null;
 if(saved[1].status==='tox'&&(!Number.isInteger(saved[1].statusState.stage)||saved[1].statusState.stage<0||saved[1].statusState.stage>15))return null;
 const b=restoreCompleteBattle(state),[p,q]=b.sides.map(s=>s.active[0]);
 if(b.format.id!=='runbun'||p.hp<=0||q.hp<=0||p.maxhp<4||p.getActionSpeed()<=q.getActionSpeed()||b.field.weather||b.field.terrain||!empty(b.field.pseudoWeather))return null;
 if([p,q].some(m=>m.transformed||m.terastallized||m.set.critical)||b.sides.some(s=>s.pokemon.length!==1||!empty(s.sideConditions)||s.slotConditions.some(c=>!empty(c))))return null;
 const ours=nativeMoveChoices(p),theirs=nativeMoveChoices(q);
 if(!ours.length||theirs.length!==1||ours.length!==p.moveSlots.length||!p.runImmunity(theirs[0].id==='seismictoss'?'Fighting':'Normal')||!q.runImmunity('Normal')||ours.some(m=>m.id==='seismictoss')&&!q.runImmunity('Fighting'))return null;
 for(const choice of [...ours,...theirs]){
  const move=b.dex.moves.get(choice.id);
  if(Object.values(move).some(v=>typeof v==='function')||move.secondary||move.secondaries?.length||move.volatileStatus||move.self||move.recoil||move.drain||move.multihit)return null;
 }
 const damageCache=new Map();let probes=0;
 try{
  const damage=(side,id,stage=0)=>{
   const key=side+':'+id+':'+stage;if(damageCache.has(key))return damageCache.get(key);
   const a=side?q:p,target=side?p:q;
   if(id==='seismictoss')return [{damage:a.level,probability:1}];
   const definition=b.dex.moves.get(id);
   if(!['tackle','strength'].includes(id)||definition.accuracy!==100||definition.priority!==0||definition.critRatio!==1)return null;
   const groups=new Map();p.boosts.atk=stage;
   for(const critical of [false,true])for(let roll=0;roll<16;roll++){
    stop();b.prng.random=(from,to)=>{if(from===16&&to===undefined)return roll;throw Error('Unexpected strategic damage draw');};
    const move=b.dex.getActiveMove(id);move.willCrit=critical;const n=b.actions.getDamage(a,target,move,true);probes++;
    if(!Number.isInteger(n)||n<=0)return null;
    groups.set(n,(groups.get(n)||0)+(critical?1/16:15/16)/16);
   }
   const result=[...groups].map(([damage,probability])=>({damage,probability}));damageCache.set(key,result);return result;
  };
  const incoming=damage(1,theirs[0].id);if(!incoming)return null;
  const clock=[];
  if(q.status==='tox'){
   const probe=restoreCompleteBattle(state);installChanceTape(probe,[],state.unknownNature,state,()=>{throw Error('Unexpected strategic residual draw');});
   for(let n=0;n<6&&probe.p2.active[0].hp>0;n++){
    stop();const before=probe.p2.active[0].hp;probe.fieldEvent('Residual');probe.faintMessages();clock.push(before-probe.p2.active[0].hp);
   }
   if(probe.p2.active[0].hp>0)return null;
  }else{
   if(ours.some(m=>m.id==='recover'))return null;
   const turns=Math.ceil(p.hp/Math.min(...incoming.map(o=>o.damage)));if(turns>3)return null;
   clock.push(...Array(turns).fill(0));
  }
  if(theirs[0].pp<clock.length||ours.some(m=>m.pp<clock.length))return null;
  let heal=0;
  if(ours.some(m=>m.id==='recover')){
   const probe=restoreCompleteBattle(state),source=probe.p1.active[0];source.hp=1;
   installChanceTape(probe,[],state.unknownNature,state,()=>{throw Error('Unexpected recovery draw');});probe.actions.runMove('recover',source,source.getLocOf(source));heal=source.hp-1;
   if(heal<=0)return null;
  }
  if(ours.some(m=>m.id==='swordsdance')){const boosts=b.dex.moves.get('swordsdance').boosts;if(boosts?.atk!==2||Object.keys(boosts).length!==1)return null;}
  const cache=new Map();let branches=0,merged=0;
  const visit=(hp,target,stage,turn)=>{
   if(target<=0)return 1;if(hp<=0)return 0;stop();if(turn>=clock.length||cache.size>=10000)throw timeout;
   const key=[hp,target,stage,turn].join(',');if(cache.has(key))return cache.get(key).value;
   const values=ours.map(move=>{
    const outcomes=['recover','swordsdance'].includes(move.id)?[{damage:0,probability:1}]:damage(0,move.id,stage);if(!outcomes)throw timeout;
    const nextHP=move.id==='recover'?Math.min(p.maxhp,hp+heal):hp,nextStage=move.id==='swordsdance'?Math.min(6,stage+2):stage;
    const successors=new Map();let value=0;
    for(const hit of outcomes){
     if(hit.damage>=target){value+=hit.probability;continue;}
     for(const retaliation of incoming){
      const left=nextHP-retaliation.damage;if(left<=0)continue;
      const enemy=Math.max(0,target-hit.damage-clock[turn]),k=left+':'+enemy;
      if(successors.has(k))merged++;successors.set(k,{hp:left,target:enemy,probability:(successors.get(k)?.probability||0)+hit.probability*retaliation.probability});
     }
    }
    for(const next of successors.values()){branches++;value+=next.probability*visit(next.hp,next.target,nextStage,turn+1);}return value;
   });
   const value=Math.max(...values);cache.set(key,{value,values});return value;
  };
  const value=visit(p.hp,q.hp,0,0),root=cache.get([p.hp,q.hp,0,0].join(','));
  return {value,actions:ours.map(m=>m.slot),action_values:root.values,states:cache.size,branches,merged,damage_probes:probes,elapsed_ms:performance.now()-start};
 }catch(e){if(e===timeout)return null;throw e;}
}
export const strategicEndgameProof={id:'finite-strategic-v1',algorithm:'exact-native-strategic-endgame',opponentModel:'optimized player; opponent has one supported attack',enabled:o=>o.exactEndgames!==false,
 mayApply:s=>s.player.build.moves.some(m=>['Recover','Swords Dance'].includes(m))&&s.player.build.moves.every(m=>['Recover','Swords Dance','Tackle','Seismic Toss'].includes(m))&&s.opponent.build.moves.length===1&&['Strength','Seismic Toss'].includes(s.opponent.build.moves[0]),solve:solveStrategicEndgame};
