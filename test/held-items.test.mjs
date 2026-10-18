import test from 'node:test';
import assert from 'node:assert/strict';
import {activateBerry,applyHeldDamage,endTurnItems} from '../analysis/held-items.mjs';
import {simulateOutlook} from '../analysis/outlook.mjs';
import {hitChance} from '../run-bun/accuracy.mjs';
const mon=(item,hp=20,status='')=>({item,hp,status,sleep:status==='slp'?3:null,confusion:0});
test('Healing and status berries consume once and cannot revive a fainted holder',()=>{
 let p=mon('Oran Berry',8);activateBerry(p,20);assert.equal(p.hp,18);assert.equal(p.item,'');p.hp=8;activateBerry(p,20);assert.equal(p.hp,8);
 p=mon('Sitrus Berry',10);activateBerry(p,20);assert.equal(p.hp,15);
 p=mon('Chesto Berry',20,'slp');activateBerry(p,20);assert.equal(p.status,'');assert.equal(p.sleep,null);assert.equal(p.item,'');
 p=mon('Lum Berry',20,'par');p.confusion=3;activateBerry(p,20);assert.equal(p.confusion,0);assert.equal(p.status,'');
 p=mon('Oran Berry',0);activateBerry(p,20);assert.equal(p.hp,0);assert.equal(p.item,'Oran Berry');
});
test('Focus Sash only protects a full-health single-hit holder and is consumed',()=>{
 let p=mon('Focus Sash');applyHeldDamage(p,40,20);assert.equal(p.hp,1);assert.equal(p.item,'');applyHeldDamage(p,1,20);assert.equal(p.hp,0);
 p=mon('Focus Sash',19);applyHeldDamage(p,40,20);assert.equal(p.hp,0);
 p=mon('Focus Sash');applyHeldDamage(p,40,20,{multiHit:true});assert.equal(p.hp,0);
});
test('End-of-turn items heal, harm, or inflict status without resurrecting holders',()=>{
 const s=[mon('Leftovers',20),mon('Black Sludge',20)];endTurnItems(s,[32,32],[[],[]]);assert.equal(s[0].hp,22);assert.equal(s[1].hp,16);
 s[1]=mon('Black Sludge',20);endTurnItems(s,[32,32],[[],['Poison']]);assert.equal(s[1].hp,22);
 const orbs=[mon('Flame Orb'),mon('Toxic Orb')];endTurnItems(orbs,[20,20],[[],[]]);assert.equal(orbs[0].status,'brn');assert.equal(orbs[1].status,'tox');
});
test('Held accuracy modifiers change the probability rather than damage',()=>{
 const move={name:'Sleep Powder'},a={boosts:{},item:''},b={boosts:{},item:''};assert.equal(hitChance({},a,b,move).chance,0.8);
 a.item='Wide Lens';assert.equal(hitChance({},a,b,move).chance,0.88);a.item='';b.item='Bright Powder';assert.equal(hitChance({},a,b,move).chance,0.72);
});
test('Consumed Focus Sash changes the searched duel outcome',()=>{
 const side=item=>({build:{item,boosts:{},moves:['Tackle']},effects:{},pp:{Tackle:5}});
 const snapshot={player:side(''),opponent:side(''),field:{}};
 const mons=[{curHP:()=>20,maxHP:()=>20,status:'',ability:'',types:[]},{curHP:()=>20,maxHP:()=>20,status:'',ability:'',types:[]}];
 const row=speed=>[{name:'Tackle',available:true,damage_rolls:[30],hit_chance:1,speed,priority:0}];
 assert.equal(simulateOutlook(snapshot,row(10),row(5),...mons,{timeMs:1000}).lower_bound,100);
 snapshot.opponent.build.item='Focus Sash';assert.equal(simulateOutlook(snapshot,row(10),row(5),...mons,{timeMs:1000}).upper_bound,0);
 snapshot.player.build.item='Focus Sash';assert.equal(simulateOutlook(snapshot,row(10),row(5),...mons,{timeMs:1000}).lower_bound,100);
});

test('Status orb damage begins on the next turn and escalating poison persists',()=>{
 const state=[mon('Toxic Orb',32),mon('Flame Orb',32)];
 endTurnItems(state,[32,32],[[],[]]);assert.deepEqual(state.map(p=>p.hp),[32,32]);
 endTurnItems(state,[32,32],[[],[]]);assert.deepEqual(state.map(p=>p.hp),[30,30]);
 endTurnItems(state,[32,32],[[],[]]);assert.deepEqual(state.map(p=>p.hp),[26,28]);
 const protectedState=[mon('Flame Orb',32),mon('Toxic Orb',32)];endTurnItems(protectedState,[32,32],[[],[]],['Water Veil','Immunity']);assert.deepEqual(protectedState.map(p=>p.status),['','']);
});

test('Choice lock prevents changing to recovery after attacking',()=>{
 const side=item=>({build:{item,boosts:{},moves:['Tackle','Recover']},effects:{},pp:{Tackle:2,Recover:2}});
 const snapshot={player:side('Choice Band'),opponent:{build:{item:'',boosts:{},moves:['Tackle']},effects:{},pp:{Tackle:2}},field:{}};
 const mons=[{curHP:()=>20,maxHP:()=>20,status:'',ability:'',types:[]},{curHP:()=>20,maxHP:()=>20,status:'',ability:'',types:[]}];
 const rows=[[{name:'Tackle',available:true,damage_rolls:[1],speed:10,priority:0},{name:'Recover',available:true,status_move:true,speed:10,priority:0}],[{name:'Tackle',available:true,damage_rolls:[1],speed:5,priority:0}]];
 const locks=[];
 simulateOutlook(snapshot,...rows,...mons,{maxDepth:3,timeMs:1000,describe:(s,i,j)=>{if(i===0&&s[0].choice!==null)locks.push([s[0].choice,j]);return rows[i][j];}});
 assert.ok(locks.length);assert.ok(locks.every(([locked,selected])=>locked===selected||selected===-1)); // Exhausting the locked move permits Struggle.
});
