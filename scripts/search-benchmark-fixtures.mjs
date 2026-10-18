import {stallFixtures} from './stall-benchmark-fixtures.mjs';
import {strategyFixtures} from './strategy-benchmark-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,packed} from '../analysis/complete-moves.mjs';
import {accuracyFixtures} from './accuracy-benchmark-fixtures.mjs';
import {realBattleFixtures} from './real-battle-fixtures.mjs';
export function mon(moves,{hp=100,spe=50,level=20,pp=20,item='',ability=''}={}){
 return {species:'Mew',current_hp:hp,actual_stats:{hp:100,atk:30,def:30,spa:30,spd:30,spe},
  build:{level,nature:'Serious',ability,item,boosts:{},moves},effects:{first_turn:false,move_history_known:true},
  pp:Object.fromEntries(moves.map(m=>[m,pp]))};
}
export const searchFixtures=[
 {id:'cheap-ending',description:'Guaranteed fixed-damage finishing turn',expected:100,snapshot:{player:mon(['Seismic Toss']),opponent:mon(['Splash'],{hp:1,spe:10}),field:{}}},
 {id:'rare-critical',description:'Only a base-rate critical wins the immediate turn',expected:6.25,snapshot:{player:mon(['Tackle'],{hp:15}),opponent:mon(['Seismic Toss'],{hp:12,spe:10}),field:{}}},
 {id:'reusable-next-turn',description:'Attack and status choices with reconstructable live next turn',reroot:true,snapshot:{player:mon(['Tackle','Foresight']),opponent:mon(['Splash'],{spe:10}),field:{}}},
 {id:'four-by-four',description:'Sixteen strategic root pairs with secondary effects',snapshot:{player:mon(['Bite','Thunder Wave','Foresight','Protect']),opponent:mon(['Water Pulse','Recover','Air Cutter','Rain Dance'],{spe:60}),field:{}}},
 {id:'persistent-effects',description:'Confusion, poison and item healing counters',snapshot:{player:{...mon(['Bite','Protect','Foresight'],{item:'Leftovers'}),effects:{first_turn:false,move_history_known:true,confusion_turns:2}},opponent:{...mon(['Water Pulse','Recover'],{spe:60}),build:{...mon(['Water Pulse','Recover'],{spe:60}).build,status:'tox'},effects:{first_turn:false,move_history_known:true,toxic_counter:2}},field:{}}},
 {id:'herdier-wingull',description:'Previous public slow-matchup reproduction',snapshot:{
  player:{species:'Herdier',current_hp:38,actual_stats:{hp:50,atk:35,def:27,spa:17,spd:27,spe:27},build:{level:15,nature:'Serious',ability:'',item:'',moves:['Leer','Covet','Baby-Doll Eyes','Bite']},effects:{first_turn:false,move_history_known:true},pp:{Leer:10,Covet:25,'Baby-Doll Eyes':10,Bite:25}},
  opponent:{species:'Wingull',current_hp:37,actual_stats:{hp:37,atk:14,def:16,spa:23,spd:16,spe:34},build:{level:13,nature:'Serious',ability:'',item:'',moves:['Water Pulse','Air Cutter','Shock Wave','Rain Dance']},effects:{first_turn:false,move_history_known:true},pp:{'Water Pulse':32,'Air Cutter':24,'Shock Wave':20,'Rain Dance':5}},field:{}}},
 ...realBattleFixtures,
 ...accuracyFixtures,
 ...stallFixtures,
 ...strategyFixtures,
];
// Synthetic observation reconstruction, exercising the same native hydrator as
// live input. This helper intentionally targets the simple reusable fixture.
export function observeSimpleTurn(snapshot,a=1,b=1){
 const initial=createCompleteBattle(snapshot),game=restoreCompleteBattle(initial);
 installChanceTape(game,[],initial.unknownNature,initial,()=>0.5);
 game.choose('p1',`move ${a}`);game.choose('p2',`move ${b}`);
 const observed=structuredClone(snapshot);
 for(let i=0;i<2;i++){
  const side=i?observed.opponent:observed.player,p=game.sides[i].active[0];
  side.current_hp=p.hp;side.build.status=p.status;side.build.boosts={...p.boosts};side.build.item=p.item;
  side.pp=Object.fromEntries(p.moveSlots.map(m=>[m.move,m.pp]));
  side.effects={first_turn:false,move_history_known:true,last_move:p.lastMove?.id,
   battle_last_move:game.lastMove?.id,used_moves:p.moveSlots.filter(m=>m.used).map(m=>m.move)};
 }
 return {observed,state:packed(game,initial.unknownNature,{unknownFirst:[false,false],unknownHistory:[false,false],unknownGender:initial.unknownGender})};
}
