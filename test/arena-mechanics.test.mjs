import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateOutlook} from '../analysis/outlook.mjs';
function scenario({endure=true,damp=false,hit=1,explosionDamage=100}={}){
  const side={build:{status:'',boosts:{},item:''},effects:{}};
  const snapshot={player:{...side},opponent:{...side},field:{}};
  const mon=ability=>({curHP:()=>50,maxHP:()=>50,status:'',ability,types:['Water']});
  const row=(name,damage,speed,priority=0)=>({name,available:true,status_move:damage===0,damage_rolls:[damage],min:damage,max:damage,speed,priority,hit_chance:1});
  const ours=[row('Tackle',10,10)];if(endure)ours.push(row('Endure',0,10,4));
  const theirs=[{...row('Explosion',explosionDamage,50),hit_chance:hit}];
  return [snapshot,ours,theirs,mon(damp?'Damp':'Water Absorb'),mon('Drizzle')];
}
test('Endure acts before Explosion, leaves one HP and solves the winning path',()=>{
 const r=simulateOutlook(...scenario(),{timeMs:2000,maxDepth:3});
 assert.equal(r.lower_bound,100);assert.equal(r.upper_bound,100);assert.deepEqual(r.omitted_moves,[]);
});
test('Explosion still faints its user when the attack misses',()=>{
 const r=simulateOutlook(...scenario({endure:false,hit:0}),{timeMs:2000,maxDepth:1});
 assert.equal(r.score,100);
});
test('Without Endure a mutual knockout does not count as a player win',()=>{
 const r=simulateOutlook(...scenario({endure:false}),{timeMs:2000,maxDepth:1});
 assert.equal(r.score,0);assert.equal(r.upper_bound,0);
});
test('Damp prevents an explosive move from self-fainting',()=>{
 const r=simulateOutlook(...scenario({damp:true}),{timeMs:2000,maxDepth:1});
 assert.equal(r.lower_bound,0);assert.equal(r.upper_bound,100);
});
test('Endure does not become permanent invulnerability on later turns',()=>{
 const args=scenario();args[2][0]={...args[2][0],name:'Tackle'};
 args[0].player.pp={Endure:1,Tackle:20};
 const r=simulateOutlook(...args,{timeMs:2000,maxDepth:5});
 assert.equal(r.lower_bound,0);assert.equal(r.upper_bound,0);
});
test('A live protection streak reduces the next Endure success probability',()=>{
 const args=scenario();args[0].player.effects={protect_streak:1};
 const r=simulateOutlook(...args,{timeMs:2000,maxDepth:1});
 assert.ok(Math.abs(r.lower_bound-100/3)<1e-9);assert.ok(Math.abs(r.upper_bound-100/3)<1e-9);
});
