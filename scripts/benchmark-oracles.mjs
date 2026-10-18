import {stallOracle} from './stall-benchmark-oracles.mjs';
import {strategyOracle} from './strategy-benchmark-oracle.mjs';
import {solveDamageRace} from './reference-damage-race.mjs';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {completeMoveDex} from '../analysis/complete-moves.mjs';
import calculator from '../vendor/run-bun/index.js';
const gen=calculator.Generations.get(8);
const assert=(condition,message)=>{if(!condition)throw Error(`Oracle precondition failed: ${message}`);};
const mon=s=>new calculator.Pokemon(gen,s.species,{...s.build,curHP:s.current_hp});
const range=(a,b,name,crit=false,bp)=>{
 const damage=calculator.calculate(gen,mon(a),mon(b),new calculator.Move(gen,name,{isCrit:crit,
  ...(bp?{overrides:{name:'Independent per-hit damage',basePower:bp,multihit:null}}:{})})).damage;
 const values=Array.isArray(damage)?damage.flat():[damage];return [Math.min(...values),Math.max(...values)];
};
// These references use algebra and calculator damage ranges, not the live
// search, its rollout policy, its cache, or its heuristic value function.
export function analyticOracle(fixture){
 const {player:p,opponent:q}=fixture.snapshot,pm=mon(p),qm=mon(q),id=fixture.oracle;
 if(!id)return null;
 if(id==='strategy')return strategyOracle(fixture);
 for(const side of [p,q]){
  const calculated=mon(side);
  assert(Object.keys(calculated.rawStats).every(k=>calculated.rawStats[k]===side.actual_stats[k]),'actual stats match proof build');
  assert(side.build.moves.every(m=>side.pp[m]>0),'positive PP');
 }
 assert(completeMoveDex.moves.get('Focus Blast').accuracy===80,'Run & Bun Focus Blast accuracy is 80');
 assert(completeMoveDex.moves.get('Triple Axel').accuracy===90,'Triple Axel accuracy is 90');
 const neutral=()=>assert([p,q].every(s=>!s.build.item&&!s.build.status&&Object.values(s.build.boosts).every(n=>n===0)),'neutral status/items/stages');
 if(['fixed-win','fixed-loss'].includes(id)){
  neutral();const attacker=id==='fixed-win'?p:q,defender=id==='fixed-win'?q:p;
  assert(attacker.build.moves.join()==='Seismic Toss'&&defender.build.moves.join()==='Splash','fixed moves');
  const turns=Math.ceil(defender.current_hp/attacker.build.level);
  assert(turns<=attacker.pp['Seismic Toss']&&turns<defender.pp.Splash,'KO before PP exhaustion');
  return {expected_percent:id==='fixed-win'?100:0,fraction:id==='fixed-win'?'1/1':'0/1',proof:`${turns} level-damage hits; Splash cannot damage, switch or change the outcome.`};
 }
 if(id==='speed-tie'){
  neutral();assert(pm.stats.spe===qm.stats.spe,'equal speed');
  assert([p,q].every(s=>s.build.moves.join()==='Seismic Toss'),'only Seismic Toss');
  assert(p.build.level>=q.current_hp&&q.build.level>=p.current_hp,'either first hit KOs');
  return {expected_percent:50,fraction:'1/2',proof:'The first actor KOs; the fair Speed tie decides the battle.'};
 }
 if(id.startsWith('stall:'))return stallOracle(fixture);
 if(id.startsWith('complex-'))return complexOracle(fixture,pm,qm);
 assert(q.build.moves.join()==='Seismic Toss'&&q.build.level>=p.current_hp,'guaranteed retaliation KO');
 assert(!p.build.item&&!q.build.item,'no survival/healing items');
 if(id==='focus-blast'){
  neutral();assert(pm.stats.spe>qm.stats.spe&&q.current_hp===1,'faster attacker, one-HP target');
  assert(p.build.moves.join()==='Focus Blast'&&range(p,q,'Focus Blast')[0]>=q.current_hp,'every hit KOs');
  return {expected_percent:80,fraction:'4/5',proof:'The sole winning event is hitting Run & Bun Focus Blast (80%).'};
 }
 if(id==='paralysis'){
  assert(p.build.moves.join()==='Quick Attack'&&p.build.status==='par'&&!q.build.status,'one paralyzed priority attacker');
  assert(q.current_hp===1&&range(p,q,'Quick Attack')[0]>=1,'every successful action KOs');
  return {expected_percent:75,fraction:'3/4',proof:'Quick Attack precedes Seismic Toss; the only failure event is full paralysis (1/4).'};
 }
 if(['triple-axel','skill-link-axel'].includes(id)){
  neutral();assert(pm.stats.spe>qm.stats.spe&&p.build.moves.join()==='Triple Axel','faster Triple Axel attacker');
  const normal=[20,40,60].map(bp=>range(p,q,'Triple Axel',false,bp));
  const critical=[20,40,60].map(bp=>range(p,q,'Triple Axel',true,bp));
  const maxTwo=critical[0][1]+critical[1][1],minThree=normal.reduce((sum,r)=>sum+r[0],0);
  assert(maxTwo<q.current_hp&&minThree>=q.current_hp,'two critical hits cannot KO; three minimum noncritical hits KO');
  assert((p.build.ability==='Skill Link')===(id==='skill-link-axel'),'Skill Link condition');
  return {expected_percent:id==='triple-axel'?72.9:90,fraction:id==='triple-axel'?'729/1000':'9/10',
   proof:`Max two critical hits ${maxTwo} < HP ${q.current_hp} <= min three normal hits ${minThree}; accuracy ${id==='triple-axel'?'(9/10)^3':'9/10 with Skill Link'}.`};
 }
 throw Error(`Unknown analytic oracle ${id}`);
}


function complexOracle(fixture,pm,qm){
 const {player:p,opponent:q}=fixture.snapshot,id=fixture.oracle;
 assert(q.species==='Blissey'&&q.build.level===100&&q.build.moves.join()==='Seismic Toss','fixed 100 damage opponent');
 assert(!q.build.item&&!q.build.status&&!q.build.ability&&!p.build.ability,'no abilities or opponent status/items');
 assert(Object.values(p.build.boosts).every(n=>n===0)&&Object.values(q.build.boosts).every(n=>n===0),'neutral boosts');
 assert(Object.keys(fixture.snapshot.field).length===0,'no field effects');
 const result=(expected_percent,fraction,proof)=>({expected_percent,fraction,proof});
 if(['complex-paralysis-three','complex-sash-paralysis'].includes(id)){
  assert(p.build.moves.join()==='Quick Attack'&&p.build.status==='par'&&q.current_hp===1,'paralyzed priority knockout');
  assert(range(p,q,'Quick Attack')[0]>=1&&completeMoveDex.moves.get('Quick Attack').accuracy===100,'certain hit knockout if able to act');
  if(id==='complex-paralysis-three'){
   assert(p.current_hp===201&&!p.build.item&&p.pp['Quick Attack']>=3,'three attempts before third retaliation');
   return result(98.4375,'63/64','Quick Attack has priority on all three turns. Only three full-paralysis events lose: 1 - (1/4)^3.');
  }
  assert(p.build.item==='Focus Sash'&&p.current_hp===pm.maxHP()&&p.current_hp<=100&&p.current_hp>1,'full-health Focus Sash survives first retaliation only');
  assert(p.pp['Quick Attack']>=2,'two attempts');
  return result(93.75,'15/16','Priority avoids the paralysis Speed penalty. First failure consumes Focus Sash; only full paralysis on both attempts loses: 1 - (1/4)^2.');
 }
 assert(pm.stats.spe>qm.stats.spe,'player acts before retaliation');
 assert(!p.build.item&&(!p.build.status||id==='complex-poison-window'&&p.build.status==='psn'),'no player items or unmodeled status');
 const normal=range(p,q,'Focus Blast'),crit=range(p,q,'Focus Blast',true);
 assert(completeMoveDex.moves.get('Focus Blast').accuracy===80,'80 percent Focus Blast');
 if(['complex-focus-three','complex-poison-window'].includes(id)){
  assert(p.build.moves.join()==='Focus Blast'&&q.current_hp===1&&normal[0]>=1,'Focus Blast always KOs if it hits');
  if(id==='complex-focus-three'){
   assert(p.current_hp===201&&p.pp['Focus Blast']>=3,'exactly three attempts');
   return result(99.2,'124/125','Each miss costs 100 HP; a faster attacker at 201 HP gets three attempts: 1 - (1/5)^3.');
  }
  assert(p.current_hp===101&&Math.floor(pm.maxHP()/8)>=1,'miss leaves one HP before poison');
  return result(80,'4/5','On a miss, Seismic Toss leaves one HP and end-of-turn poison KOs. Only the first attack can win.');
 }
 assert(p.build.moves.join()==='Focus Blast,Seismic Toss'&&p.build.level===100&&p.current_hp===101,'two actions and two move choices');
 assert(p.pp['Focus Blast']>=2&&p.pp['Seismic Toss']>=2,'both choices available twice');
 const outcomes=[];
 for(const [isCrit,probability] of [[false,15/16],[true,1/16]]){
  const damage=calculator.calculate(gen,mon(p),mon(q),new calculator.Move(gen,'Focus Blast',{isCrit})).damage;
  assert(Array.isArray(damage)&&damage.length===16,'sixteen uniform damage rolls');
  for(const d of damage)outcomes.push({damage:d,probability:0.8*probability/16});
 }
 outcomes.push({damage:0,probability:0.2});
 const independent=solveDamageRace({playerHP:p.current_hp,opponentHP:q.current_hp,retaliation:100,moves:[
  {outcomes},{outcomes:[{damage:100,probability:1}]}]});
 assert(Math.abs(independent.expected_percent-(id==='complex-choice-guaranteed'?100:81))<1e-9,'finite-horizon weighted enumeration agrees with algebra');
 if(id==='complex-choice-guaranteed'){
  assert(q.current_hp===150&&normal[0]>=150,'one accurate Focus Blast hit or two fixed hits win');
  return result(100,'1/1','Use Seismic Toss twice for a guaranteed win; repeated Focus Blast would win with probability 24/25.');
 }
 assert(id==='complex-choice-adaptive'&&q.current_hp===250,'adaptive target HP');
 assert(normal[1]<250&&normal[0]>=150&&crit[0]>=250,'a normal hit enables fixed finish; a critical KOs');
 return result(81,'81/100',`Focus Blast first: a hit (4/5) wins immediately or enables a guaranteed Seismic Toss finish. After a miss (1/5), only a hitting critical Focus Blast wins (4/5 * 1/16). Total 4/5 + 1/5 * 4/5 * 1/16 = 81/100. Seismic Toss first gives only 4/5. Normal damage ${normal.join('-')}; critical ${crit.join('-')}.`);
}

export function immediateLossProof(fixture){
 const {player:p,opponent:q}=fixture.snapshot;
 if(!fixture.id.startsWith('drednaw-lunatone-')||fixture.id.endsWith('initial'))return null;
 const damage=range(q,p,'Stored Power'),speed=s=>{const n=s.build.boosts.spe;return Math.floor(mon(s).stats.spe*(n>=0?(2+n)/2:2/(2-n)));};
 assert(p.build.moves.every(m=>['Rock Tomb','Water Pulse','Bite','Ice Fang'].includes(m)),'no priority or protection');
 assert(!q.build.status&&!q.build.item&&!p.build.item&&speed(q)>speed(p)&&damage[0]>=p.current_hp,'faster guaranteed knockout');
 return {expected_percent:0,fraction:'0/1',proof:`Lunatone Speed ${speed(q)} > Drednaw ${speed(p)}; Stored Power minimum ${damage[0]} > current HP ${p.current_hp}. No player move acts first or protects.`,
  opponent_model:'minimax',scope:'calculated Run & Bun model; not the NPC policy'};
}

const registry=JSON.parse(readFileSync(new URL('./benchmark-references.json',import.meta.url),'utf8'));
export function benchmarkReference(fixture,model='minimax'){
 const entry=registry.references.find(r=>r.id===fixture.id);
 if(!entry)return {status:'unresolved',reason:'No registered independent reference.'};
 const fingerprint=createHash('sha256').update(JSON.stringify(fixture.snapshot)).digest('hex');
 assert(fingerprint===entry.input_sha256,`stale reference for ${fixture.id}; re-prove changed input`);
 const reference=entry.models[model];
 assert(reference,`unknown opponent model ${model}`);
 if(reference.status==='analytic'){
  const proof=analyticOracle(fixture)||(model==='minimax'?immediateLossProof(fixture):null);
  assert(proof&&proof.expected_percent===reference.expected_percent&&proof.fraction===reference.fraction,'registered reference matches proof');
 }
 return {...reference,input_sha256:fingerprint};
}
