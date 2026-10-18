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
