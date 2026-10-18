// Independent stall references: arithmetic HP/resource bounds and exact Protect
// probabilities. This module never calls production search or its heuristic.
import calculator from '../vendor/run-bun/index.js';
const gen=calculator.Generations.get(8),check=(ok,message)=>{if(!ok)throw Error('Stall proof precondition: '+message);};
const pokemon=s=>new calculator.Pokemon(gen,s.species,{...s.build,curHP:s.current_hp});
function side(s,{species,level,moves,item='',status='',ability=''}){
 check(s.species===species&&s.build.level===level&&s.build.moves.join()===moves.join(),'species/level/moves');
 check(s.build.item===item&&s.build.status===status&&s.build.ability===ability,'item/status/ability');
 check(s.build.nature==='Serious'&&Object.values(s.build.ivs).every(n=>n===31)&&Object.values(s.build.evs).every(n=>n===0)&&Object.values(s.build.boosts).every(n=>n===0),'neutral exact build');
 const p=pokemon(s);check(Object.keys(p.rawStats).every(k=>p.rawStats[k]===s.actual_stats[k]),'exact stats');
 check(s.build.moves.every(m=>s.pp[m]>0),'positive starting PP');
 const allowed=new Set(['live_data','first_turn','move_history_known','protect_streak','last_move','toxic_counter']);
 check(Object.keys(s.effects).every(k=>allowed.has(k)),'known effect scope');
}
export function poisonTimeline(max,hp,{leftovers=false,toxicStage=null,recoverTurns=[]}={}){
 const result=[];let stage=toxicStage;
 for(let turn=1;turn<=200&&hp>0;turn++){
  if(recoverTurns.includes(turn))hp=Math.min(max,hp+Math.round(max/2));
  if(leftovers)hp=Math.min(max,hp+Math.floor(max/16));
  if(stage!==null)stage=Math.min(15,stage+1);
  hp=Math.max(0,hp-(stage===null?Math.floor(max/8):Math.max(1,Math.floor(max/16))*stage));
  result.push(hp);
 }
 check(result.at(-1)===0,'finite poison clock');return result;
}
function maxStruggle(a,b){
 const damage=calculator.calculate(gen,pokemon(a),pokemon(b),new calculator.Move(gen,'Struggle',{isCrit:true})).damage;
 return Math.max(...damage);
}
export function stallOracle(f){
 const {player:p,opponent:q,field}=f.snapshot,id=f.oracle?.replace('stall:','');if(!f.oracle?.startsWith('stall:'))return null;
 check(Object.keys(field).length===0,'empty field');
 const result=(value,fraction,proof,details={})=>({expected_percent:value,fraction,proof,...details});
 const passive=['poison-clock','poison-leftovers','recovery-delay'].includes(id);
 if(passive){
  side(p,{species:'Mew',level:100,moves:['Splash'],item:'Leftovers'});
  side(q,{species:'Blissey',level:20,moves:id==='recovery-delay'?['Seismic Toss','Recover']:['Seismic Toss'],status:'psn',item:id==='poison-clock'?'':'Leftovers'});
  check(p.current_hp===p.actual_stats.hp&&q.current_hp===q.actual_stats.hp,'full HP');check(q.pp['Seismic Toss']===20,'enemy attack PP');
  const healing=Math.floor(p.actual_stats.hp/16);
  check(q.build.level<=healing&&maxStruggle(q,p)<=healing,'all enemy attacks, including maximum critical Struggle, are healed');
  if(id==='recovery-delay'){
   check(q.pp.Recover===5,'five enemy Recover PP');
   const maxTurns=20+5+4;check(p.pp.Splash>=maxTurns,'enough harmless player PP');
   check(Math.floor(q.actual_stats.hp/4)+Math.floor(q.actual_stats.hp/8)-Math.floor(q.actual_stats.hp/16)>=Math.ceil(q.actual_stats.hp/4),'four Struggle turns bound');
   const schedule=[8,12,16,20,24],trace=poisonTimeline(q.actual_stats.hp,q.current_hp,{leftovers:true,recoverTurns:schedule});
   check(trace[24]>0,'legal recovery policy survives the 24-turn horizon');
   const witness=trace.slice(0,25);let hp=witness.at(-1);
   while(hp>0){hp=Math.max(0,hp-Math.round(q.actual_stats.hp/4));if(hp)hp=Math.max(0,Math.min(q.actual_stats.hp,hp+Math.floor(q.actual_stats.hp/16))-Math.floor(q.actual_stats.hp/8));witness.push(hp);}
   return result(100,'1/1','Leftovers heals every possible enemy attack. After at most 25 normal actions, four recoil/poison turns finish the enemy; Splash PP lasts through all 29. An explicit five-Recover schedule survives past turn 24.',{max_turns:maxTurns,witness_turns:witness.length,witness_survives_turns:25,witness_recover_turns:schedule,opponent_hp_trace:witness});
  }
  const trace=poisonTimeline(q.actual_stats.hp,q.current_hp,{leftovers:id==='poison-leftovers'});
  check(p.pp.Splash>=trace.length&&q.pp['Seismic Toss']>=trace.length,'PP outlasts poison');
  return result(100,'1/1','Incoming fixed damage is fully healed each turn; ordinary poison eventually KOs the foe. Leftovers precedes poison, with integer rounding.',{turns:trace.length,opponent_hp_trace:trace});
 }
 const cycle=['recover-protect','recover-protect-mid','recover-protect-late','pp-exhaustion'].includes(id);
 if(cycle){
  side(p,{species:'Mew',level:100,moves:['Recover','Protect'],item:'Leftovers'});side(q,{species:'Blissey',level:100,moves:['Seismic Toss'],item:'Leftovers',status:'psn'});
  check(p.actual_stats.spe>q.actual_stats.spe,'recovery acts first');
  if(id==='pp-exhaustion'){
   check(p.current_hp===1&&q.current_hp===q.actual_stats.hp&&p.pp.Recover===1&&p.pp.Protect===1&&q.pp['Seismic Toss']>=3,'two available setup actions only');
   const health=1+Math.round(p.actual_stats.hp/2)-100+2*Math.floor(p.actual_stats.hp/16),foeHP=poisonTimeline(q.actual_stats.hp,q.current_hp,{leftovers:true})[1];
   check(health>0&&health-Math.round(p.actual_stats.hp/4)<=100&&foeHP>maxStruggle(p,q),'third-turn recoil plus retaliation KOs player before the foe');
   return result(0,'0/1','Either legal ordering uses the one Recover and one Protect. At turn three the player must Struggle; even its maximum critical cannot KO, and recoil plus Seismic Toss KOs the player.',{turns:3});
  }
  const elapsed=id.endsWith('-mid')?8:id.endsWith('-late')?12:0;
  check(p.current_hp===(elapsed?283:1)&&q.current_hp===(elapsed?570-41*(elapsed-1):651),'observed HP phase');
  check(p.pp.Recover===10-elapsed/2&&p.pp.Protect===10-elapsed/2&&q.pp['Seismic Toss']===20-elapsed,'remaining PP phase');
  check(p.effects.protect_streak===(elapsed?1:0),'known Protect streak');
  const trace=poisonTimeline(q.actual_stats.hp,q.current_hp,{leftovers:true});let hp=p.current_hp,r=p.pp.Recover,k=p.pp.Protect,min=hp;
  for(let t=0;t<trace.length;t++){
   if(t%2===0){check(r-->0,'Recover PP');hp=Math.min(p.actual_stats.hp,hp+Math.round(p.actual_stats.hp/2))-100;check(hp>0,'survive before residual healing');}
   else check(k-->0,'Protect PP');
   hp=Math.min(p.actual_stats.hp,hp+Math.floor(p.actual_stats.hp/16));min=Math.min(min,hp);
  }
  return result(100,'1/1','Alternate faster Recover with Protect. No Protect is consecutive; all incoming hits are fixed damage, every recovery survives, and PP lasts until ordinary poison KOs the foe.',{turns:trace.length,minimum_player_hp:min,opponent_hp_trace:trace});
 }
 const cure=id==='lum-cure',immune=id==='poison-heal',healing=id==='heal-instead';
 side(p,{species:'Mew',level:100,moves:healing?['Recover','Protect']:['Protect']});
 side(q,{species:'Blissey',level:100,moves:['Seismic Toss'],status:'tox',item:cure?'Lum Berry':'',ability:immune?'Poison Heal':''});
 check(p.current_hp===1&&q.pp['Seismic Toss']>=p.pp.Protect,'retaliation always KOs if not protected');
 if(cure||immune){
  check(q.current_hp===300&&q.effects.toxic_counter===2,'cure/immunity counterfactual phase');
  check(q.current_hp>maxStruggle(p,q)&&Math.round(p.actual_stats.hp/4)>=p.current_hp,'forced Struggle cannot KO and its recoil kills player');
  return result(0,'0/1',cure?'Lum Berry cures Toxic before any poison tick. Protect only delays; when its PP ends, Struggle cannot KO the foe and recoil KOs the player.':'Poison Heal prevents Toxic damage and heals instead. Protect cannot win; forced Struggle cannot KO the foe and its recoil KOs the player.');
 }
 check(q.current_hp===(id==='protect-three'?300:50)&&q.effects.toxic_counter===(id==='protect-three'?2:0),'Toxic HP/counter phase');
 const trace=poisonTimeline(q.actual_stats.hp,q.current_hp,{toxicStage:q.effects.toxic_counter});
 if(healing){check(p.pp.Recover>=trace.length&&p.actual_stats.spe>q.actual_stats.spe&&Math.round(p.actual_stats.hp/2)>100,'Recover can sustain every required turn');return result(100,'1/1','Use faster Recover every turn; healing exceeds incoming fixed damage until Toxic KOs.',{turns:trace.length});}
 const streak=id==='protect-used'?1:0;check(p.effects.protect_streak===streak&&p.pp.Protect>=trace.length,'known streak and enough Protect PP');
 const exponent=trace.length*streak+trace.length*(trace.length-1)/2,denominator=3**exponent;
 return result(100/denominator,'1/'+denominator,'Every failed Protect loses before the next Toxic tick. Multiply successive native Protect success chances 1/(3^streak).',{turns:trace.length,protect_success_denominator:denominator});
}
