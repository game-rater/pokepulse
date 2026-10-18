import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,requiresCompleteMoves,nativeInteractionReasons} from '../analysis/complete-moves.mjs';
import {continuationValue} from '../analysis/continuation-policy.mjs';
import {contactBranches} from '../analysis/turn-mechanics.mjs';
import {frontierOutlookValue,expectedMoveDamage} from '../analysis/outlook.mjs';
import {searchBattle} from '../analysis/search.mjs';
import calculator from '../vendor/run-bun/index.js';
const mon=(moves=['Tackle'],build={},extra={})=>({species:'Mew',current_hp:100,actual_stats:{hp:100,atk:40,def:40,spa:40,spd:40,spe:50},build:{level:25,nature:'Serious',ability:'',item:'',boosts:{},moves,...build},effects:{first_turn:false},...extra});
const snapshot=(p,q)=>({player:p,opponent:q,field:{}});

for(const ability of ['Speed Boost','Moody','Shed Skin','Hydration','Harvest','Rain Dish','Dry Skin','Ice Body','Solar Power','Cute Charm','Synchronize','Cotton Down','Anger Point','Berserk','Steam Engine','Ripen','Cheek Pouch','Stench'])test(`Ordinary attacks cannot bypass native ${ability} callbacks`,()=>{
 const s=snapshot(mon(['Tackle'],{ability}),mon());
 assert.ok(nativeInteractionReasons(s).some(r=>r.includes(ability)));assert.equal(requiresCompleteMoves(s),true);
});
for(const item of ['Shell Bell',"King's Rock",'Razor Fang','Metronome','Leppa Berry','Salac Berry','Liechi Berry','Petaya Berry','Kee Berry','Maranga Berry','Sticky Barb','Blunder Policy','Throat Spray'])test(`Ordinary attacks cannot bypass native ${item} callbacks`,()=>{
 const s=snapshot(mon(['Tackle'],{item}),mon());
 assert.ok(nativeInteractionReasons(s).some(r=>r.includes(item)));assert.equal(requiresCompleteMoves(s),true);
});
function turn(s,a=1,b=1){
 const initial=createCompleteBattle(s),game=restoreCompleteBattle(initial);
 installChanceTape(game,[],initial.unknownNature,initial,()=>0);
 assert.ok(game.choose('p1',`move ${a}`));assert.ok(game.choose('p2',`move ${b}`));return game;
}
test('Native Speed Boost changes the following turn speed stage',()=>{
 const game=turn(snapshot(mon(['Splash'],{ability:'Speed Boost'}),mon(['Splash'])));
 assert.equal(game.p1.active[0].boosts.spe,1);
});
test('Native Shell Bell heals after an ordinary attack',()=>{
 const game=turn(snapshot(mon(['Tackle'],{item:'Shell Bell'},{current_hp:50}),mon(['Splash'])));
 assert.ok(game.p1.active[0].hp>50);
});
test('Native Cute Charm retains attraction from contact',()=>{
 const p=mon(['Tackle'],{gender:'M'}),q=mon(['Splash'],{ability:'Cute Charm',gender:'F'});p.species='Eevee';q.species='Eevee';
 const game=turn(snapshot(p,q));
 assert.ok(game.p1.active[0].volatiles.attract);
});
test('Native Leppa Berry restores the PP that the last attack consumes',()=>{
 const game=turn(snapshot(mon(['Tackle'],{item:'Leppa Berry'},{pp:{Tackle:1}}),mon(['Splash'])));
 assert.equal(game.p1.active[0].item,'');assert.ok(game.p1.active[0].moveSlots[0].pp>0);
});
test('Unknown genders cannot silently turn Cute Charm into immunity',()=>{
 const p=mon(['Tackle']),q=mon(['Splash'],{ability:'Cute Charm'});p.species='Eevee';q.species='Eevee';
 assert.throws(()=>turn(snapshot(p,q)),/live Pokémon genders/);
});
test('A known genderless attacker stays immune to attraction',()=>{
 const q=mon(['Splash'],{ability:'Cute Charm'});q.species='Eevee';
 const game=turn(snapshot(mon(['Tackle']),q));
 assert.equal(game.p1.active[0].volatiles.attract,undefined);
});
test('A completed outcome bypasses heuristic evaluation',()=>{
 const adapter={key:s=>s,terminal:()=>1,actions:()=>{throw Error('Terminal actions should not run');},transitions:()=>[]};
 const result=searchBattle(adapter,'won',{progressive:true,evaluate:()=>{throw Error('Terminal heuristic should not run');}});
 assert.equal(result.lower,1);assert.equal(result.upper,1);
});
test('Guaranteed critical attacks keep ignoring defensive boosts in cutoff evaluation',()=>{
 const plain=snapshot(mon(['Frost Breath']),mon(['Tackle']));
 const boosted=structuredClone(plain);boosted.opponent.build.boosts.spd=6;
 const value=s=>continuationValue(restoreCompleteBattle(createCompleteBattle(s)));
 assert.equal(value(boosted),value(plain));
});
const contactMon=(ability,terrain='',types=['Normal'])=>({hp:100,status:'',ability,item:'',types,terrain,weather:'',pp:[10],disabled:[],boosts:{}});
for(const [ability,terrain] of [['Static','Misty'],['Flame Body','Misty'],['Poison Point','Misty'],['Effect Spore','Misty']])test(`${terrain} Terrain blocks contact status from ${ability}`,()=>{
 const states=[contactMon('',terrain),contactMon(ability,terrain)];
 const branches=contactBranches(states,0,{name:'Tackle',contact:true,move_index:0});
 assert.ok(branches.every(b=>!b.state[0].status));assert.ok(Math.abs(branches.reduce((s,b)=>s+b.probability,0)-1)<1e-10);
});
test('Misty Terrain blocks Poison Touch on the grounded recipient',()=>{
 const branches=contactBranches([contactMon('Poison Touch','Misty'),contactMon('','Misty')],0,{name:'Tackle',contact:true,move_index:0});
 assert.ok(branches.every(b=>!b.state[1].status));
});
test('Misty Terrain does not protect an airborne contact attacker',()=>{
 const branches=contactBranches([contactMon('','Misty',['Flying']),contactMon('Static','Misty')],0,{name:'Tackle',contact:true,move_index:0});
 assert.ok(branches.some(b=>b.state[0].status==='par'));
});
test('Shield Dust prevents Poison Touch in both native and fast execution',()=>{
 const game=turn(snapshot(mon(['Tackle'],{ability:'Poison Touch'}),mon(['Splash'],{ability:'Shield Dust'})));
 assert.equal(game.p2.active[0].status,'');
 const branches=contactBranches([contactMon('Poison Touch'),contactMon('Shield Dust')],0,{name:'Tackle',contact:true,move_index:0});
 assert.ok(branches.every(b=>!b.state[1].status));
});
test('Rare high rolls are weighted by probability, not the min/max midpoint',()=>{
 assert.equal(expectedMoveDamage({min:10,max:100,damage_distribution:[{damage:10,probability:0.99},{damage:100,probability:0.01}]}),10.9);
});
test('The fast frontier reevaluates changed stats, accuracy, HP and legal attacks',()=>{
 const base=[{hp:100,status:'',atk:1,def:1,accuracy:1,disabled:false},{hp:100,status:'',atk:1,def:1,accuracy:1,disabled:false}];
 const legal=(state,i)=>state[i].disabled?[1]:[0,1];
 const describe=(state,i,j)=>({status_move:false,damage_rolls:[(j?5:20)*state[i].atk/state[1-i].def],hit_chance:state[i].accuracy});
 const evaluate=state=>frontierOutlookValue(state,legal,describe),initial=evaluate(base);
 for(const change of [s=>s[0].atk=2,s=>s[0].def=2,s=>s[1].accuracy=0.5,s=>s[1].disabled=true]){const s=structuredClone(base);change(s);assert.ok(evaluate(s)>initial);}
 for(const change of [s=>s[0].accuracy=0.5,s=>s[0].hp=50,s=>s[0].disabled=true]){const s=structuredClone(base);change(s);assert.ok(evaluate(s)<initial);}
});
for(const [species,item,defender,defenderItem,move] of [
 ['Latios','Soul Dew','Mew','','Psychic'],['Latias','Soul Dew','Mew','','Surf'],
 ['Mew','Soul Dew','Mew','','Psychic'],['Mew','','Latios','Soul Dew','Surf'],
])test(`Soul Dew engines agree: ${species}/${item||'none'} into ${defender}/${defenderItem||'none'} with ${move}`,()=>{
 const gen=calculator.Generations.get(8),build=(item,moves)=>({level:50,nature:'Serious',ability:'',item,moves,evs:{},ivs:{},boosts:{}});
 const sides=[[species,item,[move]],[defender,defenderItem,['Splash']]].map(([name,held,moves])=>{
  const config=build(held,moves),p=new calculator.Pokemon(gen,name,config);p.skipEntryEffects=true;
  return {p,input:{species:name,current_hp:p.maxHP(),actual_stats:{...p.rawStats,hp:p.maxHP()},build:config,effects:{first_turn:false}}};
 });
 const expected=calculator.calculate(gen,sides[0].p,sides[1].p,new calculator.Move(gen,move),new calculator.Field()).range();
 const game=restoreCompleteBattle(createCompleteBattle(snapshot(sides[0].input,sides[1].input))),rolls=[];
 for(let roll=0;roll<16;roll++){
  game.prng.random=()=>roll;
  const attack=game.dex.getActiveMove(move);attack.willCrit=false;
  rolls.push(game.actions.getDamage(game.p1.active[0],game.p2.active[0],attack,true));
 }
 assert.deepEqual([Math.min(...rolls),Math.max(...rolls)],expected);
});
