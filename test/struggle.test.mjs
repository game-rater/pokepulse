import test from 'node:test';
import assert from 'node:assert/strict';
import calculator from '@smogon/calc';
import {analyzeBattle} from '../analysis/threat.mjs';
import {simulateOutlook} from '../analysis/outlook.mjs';

function scenario({ourHP=10,enemyHP=20,pp=0,damage=20,ourSpeed=2,ability='',unsupported=false}={}){
 const side=()=>({build:{moves:['Tackle'],boosts:{},item:''},effects:{},pp:{Tackle:pp}});
 const snapshot={generation:8,player:side(),opponent:side(),field:{}};
 const mon=hp=>({curHP:()=>hp,maxHP:()=>20,status:'',ability,types:['Normal']});
 const row=i=>({name:unsupported?'Synthetic Unknown Effect':'Tackle',available:true,status_move:unsupported,damage_rolls:[1],speed:i?1:ourSpeed,priority:0,hit_chance:1});
 const rows=[row(0),row(1)],seen=[];
 const options={maxDepth:8,timeMs:3000,describe:(state,i,j)=>{
   seen.push(j);return j===-1?{...rows[i],name:'Struggle',status_move:false,damage_rolls:[damage]}:rows[i];
 }};
 return {args:[snapshot,[rows[0]],[rows[1]],mon(ourHP),mon(enemyHP)],options,seen};
}
test('Exhausted PP resolves through Struggle rather than unknown leaves',()=>{
 const s=scenario();const r=simulateOutlook(...s.args,s.options);
 assert.equal(r.lower_bound,100);assert.equal(r.unresolved,0);assert.ok(s.seen.includes(-1));
});
test('Struggle recoil can turn a KO into a mutual knockout, even with Magic Guard',()=>{
 const s=scenario({ourHP:5,ability:'Magic Guard'});
 const r=simulateOutlook(...s.args,s.options);assert.equal(r.upper_bound,0);
});
test('Spending the last PP transitions into Struggle on the next turn',()=>{
 const s=scenario({pp:1,damage:20});const r=simulateOutlook(...s.args,s.options);
 assert.equal(r.lower_bound,100);assert.ok(s.seen.includes(-1));
});
test('Unsupported usable moves do not incorrectly force Struggle',()=>{
 const s=scenario({pp:1,unsupported:true});s.args[0].player.pp={'Synthetic Unknown Effect':1};s.args[0].opponent.pp={'Synthetic Unknown Effect':1};
 const r=simulateOutlook(...s.args,s.options);assert.equal(r.unresolved,1);assert.ok(!s.seen.includes(-1));
});
test('Calculator-backed Struggle hits Ghosts and ignores accuracy drops',()=>{
 const side=species=>({species,current_hp:100,build:{level:50,moves:['Tackle'],boosts:{accuracy:-6},ability:'',item:''},effects:{},pp:{Tackle:0}});
 const snapshot={generation:8,player:side('Snorlax'),opponent:side('Gastly'),field:{}};
 const seen=[];
 const result=analyzeBattle(snapshot,calculator,()=>1,undefined,()=>({chance:0,accuracy:0}),{maxDepth:1,timeMs:3000,onProgress:r=>seen.push(r)});
 assert.ok(result.outlook.nodes>0);assert.equal(result.outlook.omitted_moves.length,0);
 // A stronger explicit KO demonstrates damage is neither immune nor accuracy-gated.
 snapshot.opponent.current_hp=1;
 const win=analyzeBattle(snapshot,calculator,(_,m)=>m.name==='Snorlax'?2:1,undefined,()=>({chance:0,accuracy:0}),{maxDepth:1,timeMs:3000});
 assert.ok(Math.abs(win.outlook.lower_bound-100)<1e-9);
});
