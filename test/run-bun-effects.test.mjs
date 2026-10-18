import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import calculator from '../vendor/run-bun/index.js';
import util from '../vendor/run-bun/mechanics/util.js';
import {analyzeBattle} from '../analysis/threat.mjs';
import {simulateOutlook} from '../analysis/outlook.mjs';
import {applySecondaries} from '../analysis/secondary-effects.mjs';
import {activateBerry,resolveBerries} from '../analysis/held-items.mjs';
import {mixHit,convolveHits,hitCounts} from '../analysis/damage-distribution.mjs';
const data=JSON.parse(readFileSync(new URL('../run-bun/move-effects.json',import.meta.url))).moves;
const state=(extra={})=>({hp:10,item:'',ability:'',types:['Normal'],status:'',boosts:{},pp:[5],lastMove:0,confusion:0,...extra});
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
const mass=branches=>branches.reduce((p,b)=>p+b.probability,0);
function duel(attack,{enemyHP=7,playerHP=10,enemyItem='',maxDepth=2,describe}={}){
  const side=(item,name)=>({build:{item,boosts:{},moves:[name]},effects:{},pp:{[name]:5}});
  const snapshot={generation:8,player:side('',attack.name),opponent:side(enemyItem,'Tackle'),field:{}};
  const mon=hp=>({curHP:()=>hp,maxHP:()=>hp,status:'',ability:'',types:['Normal']});
  const rows=[[{name:'Double Hit',available:true,damage_rolls:[2],hit_chance:1,priority:0,speed:10,...attack}],
    [{name:'Tackle',available:true,damage_rolls:[playerHP],hit_chance:1,priority:0,speed:5}]];
  return simulateOutlook(snapshot,...rows,mon(playerHP),mon(enemyHP),{maxDepth,timeMs:3000,...(describe?{describe:(s,i,j)=>describe(s,i,j,rows)}:{})});
}
test('Run & Bun secondary chances are imported with all eight overrides',()=>{
  for(const [id,chance] of Object.entries({chargebeam:100,leaftornado:30,mirrorshot:20,mudbomb:20,nightdaze:30,octazooka:30,rocksmash:100,smog:100}))assert.equal(data[id].secondaries[0].chance,chance);
  for(const [name,move] of Object.entries(data))for(const effect of move.secondaries)assert.ok(effect.status||effect.statuses||effect.boosts||effect.self?.boosts||effect.self?.terrain||effect.volatileStatus||effect.ppDrain,`Missing callback for ${name}`);
});
test('Critical hits are independent per hit, including ordinary damage rolls',()=>{
  const hit=mixHit([1],[6],1/16),total=convolveHits([hit,hit]);
  close(mass(total),1);close(total.find(r=>r.damage===7).probability,30/256);close(total.find(r=>r.damage===12).probability,1/256);
  close(duel({name:'Double Hit',hit_counts:[{count:2,probability:1}],hit_distributions:[hit,hit]}).lower_bound,100*31/256);
  assert.deepEqual(hitCounts([2,5],'Skill Link'),[{count:5,probability:1}]);close(mass(hitCounts([2,5],'')),1);
});
test('A multi-hit move consumes Focus Sash on the first hit and can KO on the second',()=>{
  const result=duel({name:'Double Hit',hit_counts:[{count:2,probability:1}],hit_distributions:[[{damage:20,probability:1}],[{damage:1,probability:1}]]},{enemyItem:'Focus Sash'});
  assert.equal(result.lower_bound,100);
});
test('Multiaccuracy stops the sequence on a miss without losing probability',()=>{
  const r=duel({name:'Triple Kick',hit_chance:0.5,multiaccuracy:true,hit_counts:[{count:2,probability:1}],hit_distributions:Array.from({length:2},()=>[{damage:1,probability:1}])},{enemyHP:2});
  close(r.lower_bound,25);close(r.upper_bound,25);
});
test('Sitrus Berry heals between hits and changes the duel outcome',()=>{
  const attack={name:'Double Hit',hit_counts:[{count:2,probability:1}],hit_distributions:Array.from({length:2},()=>[{damage:8,probability:1}])};
  assert.equal(duel(attack,{enemyHP:16,playerHP:1}).lower_bound,100);
  assert.equal(duel(attack,{enemyHP:16,playerHP:1,enemyItem:'Sitrus Berry'}).upper_bound,0);
});
test('Secondary paralysis immediately branches the queued action and changes win chance',()=>{
  const r=duel({name:'Thunder Shock',damage_rolls:[1],secondary_effects:[{chance:100,status:'par'}]},{enemyHP:2,playerHP:1});
  close(r.lower_bound,25);close(r.upper_bound,25);
});
test('Charge Beam boost is used when recalculating the next attack',()=>{
  const result=duel({name:'Charge Beam',damage_rolls:[1],secondary_effects:data.chargebeam.secondaries},{enemyHP:3,playerHP:2,describe:(s,i,j,rows)=>({...rows[i][j],damage_rolls:[i===0?1+(s[0].boosts.spa||0):1]})});
  assert.equal(result.lower_bound,100);
});
test('Secondary abilities, status immunity, independent fang effects and Tri Attack preserve mass',()=>{
  const move={name:'Ice Fang',secondary_effects:data.icefang.secondaries};
  const b=applySecondaries([state(),state()],0,move);close(mass(b),1);
  close(mass(b.filter(b=>b.state[1].status==='frz'&&b.state[1].flinched)),0.01);
  const grace=applySecondaries([state({ability:'Serene Grace'}),state()],0,move);close(mass(grace.filter(b=>b.state[1].status==='frz')),0.2);
  const shield=applySecondaries([state(),state({ability:'Shield Dust'})],0,move);assert.equal(shield.length,1);assert.equal(shield[0].state[1].status,'');
  const beam=applySecondaries([state(),state({ability:'Shield Dust'})],0,{name:'Charge Beam',secondary_effects:data.chargebeam.secondaries});assert.equal(beam[0].state[0].boosts.spa,1);
  const force=applySecondaries([state({ability:'Sheer Force'}),state()],0,{name:'Charge Beam',secondary_effects:data.chargebeam.secondaries});assert.equal(force[0].state[0].boosts.spa,undefined);
  const poison=applySecondaries([state(),state({types:['Steel']})],0,{name:'Smog',secondary_effects:data.smog.secondaries});assert.equal(poison[0].state[1].status,'');
  const tri=applySecondaries([state(),state()],0,{name:'Tri Attack',secondary_effects:data.triattack.secondaries});close(mass(tri),1);for(const status of ['brn','par','frz'])close(mass(tri.filter(b=>b.state[1].status===status)),0.2/3);
});
test('Pinch berry flavor uses nature; confusion durations branch and Own Tempo prevents them',()=>{
  const holder=state({hp:5,item:'Figy Berry',nature:'Modest'});activateBerry(holder,20);assert.equal(holder.hp,15);assert.equal(holder.item,'');
  const branches=resolveBerries([holder,state()],[20,20]);assert.deepEqual(branches.map(b=>b.state[0].confusion),[2,3,4,5]);close(mass(branches),1);
  const protectedHolder=state({hp:5,item:'Figy Berry',nature:'Modest',ability:'Own Tempo'});activateBerry(protectedHolder,20);assert.equal(protectedHolder.pendingConfusion,undefined);
  const compatible=state({hp:5,item:'Wiki Berry',nature:'Modest'});activateBerry(compatible,20);assert.equal(compatible.pendingConfusion,undefined);
});
test('Berry confusion changes the searched outcome when the initial berry activates',()=>{
  const side=(item,nature)=>({build:{item,nature,boosts:{},moves:['Tackle']},effects:{},pp:{Tackle:1}});
  const mon=(hp,maxHP)=>({curHP:()=>hp,maxHP:()=>maxHP,status:'',ability:'',types:['Normal']});
  const attack=(damage,speed)=>[{name:'Tackle',available:true,damage_rolls:[damage],hit_chance:1,priority:0,speed}];
  const run=nature=>simulateOutlook({generation:8,player:side('Figy Berry',nature),opponent:side('','Hardy'),field:{}},attack(1,10),attack(20,5),mon(5,20),mon(1,1),{maxDepth:1,timeMs:1000,confusionDamage:()=>[1]});
  close(run('Modest').lower_bound,200/3);assert.equal(run('Adamant').lower_bound,100);
});
test('Soul Dew keeps the custom calculator stat modifier rather than adding another stage',()=>{
  const gen=calculator.Generations.get(8),build={level:100,nature:'Hardy',boosts:{spa:1},item:'Soul Dew',moves:['Psychic']};
  const defender={level:100,nature:'Hardy',boosts:{},moves:['Tackle']};
  const snapshot={generation:8,player:{species:'Latios',current_hp:301,build,effects:{}},opponent:{species:'Mew',current_hp:341,build:defender,effects:{}},field:{}};
  const result=analyzeBattle(snapshot,calculator,util.getFinalSpeed,undefined,undefined,{timeMs:0});
  const direct=calculator.calculate(gen,new calculator.Pokemon(gen,'Latios',build),new calculator.Pokemon(gen,'Mew',defender),new calculator.Move(gen,'Psychic'),new calculator.Field());
  assert.deepEqual([result.outgoing_moves[0].min,result.outgoing_moves[0].max],direct.range());
});
test('Gale Wings priority is blocked by Psychic terrain even below full health',()=>{
  const gen=calculator.Generations.get(8),attacker=new calculator.Pokemon(gen,'Talonflame',{curHP:50,ability:'Gale Wings'}),defender=new calculator.Pokemon(gen,'Mew');
  const r=calculator.calculate(gen,attacker,defender,new calculator.Move(gen,'Brave Bird'),new calculator.Field({terrain:'Psychic'}));
  assert.deepEqual(r.range(),[0,0]);
});
test('Actual calculator rows contain all Surging Strikes hits, increasing Triple Axel damage and armor protection',()=>{
  const side=(move,ability='')=>({species:'Mew',current_hp:341,build:{level:100,nature:'Hardy',boosts:{},moves:[move],ability},effects:{},pp:{[move]:5}});
  for(const move of ['Surging Strikes','Triple Axel']){
    const r=analyzeBattle({generation:8,player:side(move),opponent:side('Tackle'),field:{}},calculator,util.getFinalSpeed,undefined,undefined,{timeMs:0});
    assert.equal(r.outgoing_moves[0].hit_counts[0].count,3);
    if(move==='Surging Strikes'){assert.equal(r.outgoing_moves[0].critical_chance,1);assert.ok(r.outgoing_moves[0].min>50);}
    else assert.ok(r.outgoing_moves[0].max>100);
  }
  const normal=analyzeBattle({generation:8,player:side('Frost Breath'),opponent:side('Tackle','Magma Armor'),field:{}},calculator,util.getFinalSpeed,undefined,undefined,{timeMs:0});
  const critical=analyzeBattle({generation:8,player:side('Frost Breath'),opponent:side('Tackle'),field:{}},calculator,util.getFinalSpeed,undefined,undefined,{timeMs:0});
  assert.equal(normal.outgoing_moves[0].critical_chance,0);assert.ok(normal.outgoing_moves[0].max<critical.outgoing_moves[0].max);
});
