import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCompleteBattle,restoreCompleteBattle,completeMoveAdapter,completeMoveDex,requiresCompleteMoves} from '../analysis/complete-moves.mjs';
const romMoves=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url))).move.filter(Boolean);
const mon=(moves,extra={})=>({species:'Mew',current_hp:200,actual_stats:{hp:200,atk:40,def:40,spa:40,spd:40,spe:60},
  build:{level:30,nature:'Serious',ability:'',item:'',boosts:{},moves,...extra},effects:{},pp:Object.fromEntries(moves.map(m=>[m,10]))});
function battle(a,b=mon(['Splash'])){
  b=structuredClone(b);b.actual_stats.spe=20;
  const result=restoreCompleteBattle(createCompleteBattle({player:a,opponent:b,field:{}}));
  result.prng.random=(from,to)=>to===undefined?0:from;
  result.prng.randomChance=(n,d)=>n>=d;
  return result;
}
const turn=(b,a=1,c=1)=>{assert.equal(b.choose('p1',`move ${a}`),true);assert.equal(b.choose('p2',`move ${c}`),true);};

test('Every ROM move has an executable definition and executes a full turn',()=>{
  const failures=[];
  for(const name of romMoves){
    assert.equal(completeMoveDex.moves.get(name).exists,true,name);
    try{const b=battle(mon([name]));const before=b.turn;turn(b);assert.ok(b.ended||b.turn>before,'accepted inputs must resolve a turn');}catch(error){failures.push({name,error:error.message});}
  }
  assert.deepEqual(failures,[]);
});
test('Helping Hand fails with no ally, consumes PP and does not create an unknown branch',()=>{
  const b=battle(mon(['Helping Hand']));turn(b);
  assert.equal(b.p1.active[0].moveSlots[0].pp,9);
  assert.equal(b.p2.active[0].hp,200);assert.ok(b.log.some(line=>line.startsWith('|-fail|')));
});
test('Foresight removes Ghost immunity and evasion for later Normal attacks',()=>{
  const a=mon(['Foresight','Tackle']),g=mon(['Splash']);g.species='Gengar';g.build.boosts={evasion:6};
  const b=battle(a,g);turn(b,1);assert.ok(b.p2.active[0].volatiles.foresight);turn(b,2);assert.ok(b.p2.active[0].hp<200);
});
test('Run & Bun Defend Order protects instead of boosting defenses',()=>{
  const b=battle(mon(['Defend Order']),mon(['Tackle']));turn(b);
  assert.equal(b.p1.active[0].hp,200);assert.equal(b.p1.active[0].boosts.def,0);assert.equal(b.p1.active[0].boosts.spd,0);
});
test('Run & Bun Thief and Covet leave the opponent item in place',()=>{
  for(const move of ['Thief','Covet']){const b=battle(mon([move]),mon(['Splash'],{item:'Leftovers'}));turn(b);assert.equal(b.p1.active[0].item,'');assert.equal(b.p2.active[0].item,'leftovers');}
});
test('Run & Bun Destiny Bond can be used on consecutive turns',()=>{
  const b=battle(mon(['Destiny Bond']));turn(b);turn(b);assert.ok(b.p1.active[0].volatiles.destinybond);
});
test('Wish heals on its delayed turn',()=>{
  const a=mon(['Wish','Splash']);a.current_hp=50;const b=battle(a);turn(b);assert.equal(b.p1.active[0].hp,50);turn(b,2);assert.equal(b.p1.active[0].hp,150);
});
test('Transform copies the target moves, stats and types while keeping the user HP',()=>{
  const foe=mon(['Ember','Recover']);foe.species='Charmander';foe.actual_stats.atk=70;
  const b=battle(mon(['Transform']),foe);turn(b,1,2);assert.equal(b.p1.active[0].hp,200);assert.equal(b.p1.active[0].storedStats.atk,70);assert.deepEqual(b.p1.active[0].types,['Fire']);assert.deepEqual(b.p1.active[0].moveSlots.map(m=>m.id),['ember','recover']);
});
test('Bide stores damage over two turns and returns twice that amount',()=>{
  const b=battle(mon(['Bide']),mon(['Tackle']));turn(b);turn(b);const stored=200-b.p1.active[0].hp;turn(b);assert.equal(200-b.p2.active[0].hp,2*stored);
});
test('Complex callbacks route to the full engine; common attacks retain the faster adapter',()=>{
  assert.equal(requiresCompleteMoves({player:mon(['Tackle']),opponent:mon(['Ember'])}),false);
  for(const move of ['Foresight','Bide','Metronome','Transform','Wish','Defend Order'])assert.equal(requiresCompleteMoves({player:mon([move]),opponent:mon(['Tackle'])}),true,move);
});
test('Exact chance nodes preserve total mass and the Run & Bun base critical rate',()=>{
  const a=mon(['Tackle']),other=mon(['Splash']);other.actual_stats.spe=20;
  const root=createCompleteBattle({player:a,opponent:other,field:{}}),adapter=completeMoveAdapter();
  const pending=[{state:adapter.transitions(root,1,1)[0].state,probability:1}];let mass=0,criticalMass=0,nodes=0;
  while(pending.length){const entry=pending.pop();for(const branch of adapter.transitions(entry.state,0,0)){
    const p=entry.probability*branch.probability;
    if(branch.state.kind==='chance'){pending.push({state:branch.state,probability:p});}
    else{mass+=p;const damage=200-branch.state.saved.sides[1].pokemon[0].hp;if(damage>13)criticalMass+=p;}
  }assert.ok(++nodes<10000);}
  assert.ok(Math.abs(mass-1)<1e-12);assert.equal(criticalMass,1/16);
});
