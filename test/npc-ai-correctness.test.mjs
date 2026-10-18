// Scenario categories adapted from the pinned MIT community calculator tests.
// Exact assertions below use controlled native HP, moves and counters.
import test from 'node:test';
import assert from 'node:assert/strict';
import {npcMoveDistribution} from '../run-bun/npc-ai.mjs';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/complete-moves.mjs';
import {mon} from '../scripts/search-benchmark-fixtures.mjs';
function setup(playerMoves,opponentMoves,{player={},opponent={},field={}}={}){
 const build=(moves,extra)=>{const p=mon(moves,{spe:50,...extra});p.build={...p.build,...extra.build};return {...p,...extra,build:p.build};};
 return restoreCompleteBattle(createCompleteBattle({player:build(playerMoves,player),opponent:build(opponentMoves,opponent),field}));
}
const probability=(game,move)=>npcMoveDistribution(game).find(p=>p.move===move)?.probability||0;

test('Already-statused targets do not invite redundant status moves',()=>{
 for(const move of ['Spore','Sleep Powder','Lovely Kiss','Hypnosis','Grass Whistle','Sing','Yawn','Toxic','Poison Powder','Poison Gas','Thunder Wave','Stun Spore','Glare','Will-O-Wisp']){
  const b=setup(['Tackle'],[move,'Tackle'],{player:{build:{status:'brn'}}});
  assert.equal(probability(b,move),0,move);
 }
});
test('Corrosion is read from the NPC ability when scoring Toxic into Steel',()=>{
 const make=ability=>setup(['Splash'],['Toxic','Tackle'],{player:{species:'Lucario'},opponent:{build:{ability}}});
 assert.equal(probability(make(''),'Toxic'),0);
 assert.ok(probability(make('Corrosion'),'Toxic')>0);
});
test('Early Bird changes Rest scoring through the NPC recovery incentive',()=>{
 const make=ability=>setup(['Splash'],['Rest','Tackle'],{opponent:{current_hp:30,build:{ability}}});
 assert.ok(probability(make('Early Bird'),'Rest')>probability(make(''),'Rest'));
});
test('Sun recovery uses two thirds, not a full HP refill',()=>{
 const b=setup(['Night Shade'],['Synthesis','Tackle'],{player:{build:{level:80}},opponent:{current_hp:30,spe:100},field:{weather:'Sun'}});
 assert.equal(probability(b,'Synthesis'),0);
});
test('Recovery scoring distinguishes sun, neutral weather and rain',()=>{
 const make=weather=>setup(['Night Shade'],['Synthesis','Tackle'],{player:{build:{level:60}},opponent:{current_hp:30,spe:100},field:{weather}});
 assert.ok(probability(make('Sun'),'Synthesis')>0);
 assert.equal(probability(make(''),'Synthesis'),0);
 assert.equal(probability(make('Rain'),'Synthesis'),0);
});
test('Shore Up uses the sand healing fraction',()=>{
 const make=weather=>setup(['Night Shade'],['Shore Up','Tackle'],{player:{build:{level:60}},opponent:{current_hp:30,spe:100},field:{weather}});
 assert.ok(probability(make('Sand'),'Shore Up')>0);
 assert.equal(probability(make(''),'Shore Up'),0);
});
test('Protect veto uses the next live toxic stage',()=>{
 const make=stage=>setup(['Splash'],['Protect','Tackle'],{player:{species:'Gengar'},opponent:{current_hp:20,build:{status:'tox'},effects:{first_turn:false,move_history_known:true,toxic_counter:stage}}});
 assert.ok(probability(make(0),'Protect')>0);
 assert.equal(probability(make(4),'Protect'),0);
});
test('Poison Heal and Magic Guard prevent toxic damage from vetoing Protect',()=>{
 for(const ability of ['Poison Heal','Magic Guard']){
  const b=setup(['Splash'],['Protect','Tackle'],{player:{species:'Gengar'},opponent:{current_hp:20,build:{status:'tox',ability},effects:{first_turn:false,move_history_known:true,toxic_counter:4}}});
  assert.ok(probability(b,'Protect')>0,ability);
 }
});
test('Protect toxic veto rounds the base tick before multiplying the stage',()=>{
 const b=setup(['Splash'],['Protect','Tackle'],{player:{species:'Gengar'},opponent:{current_hp:25,build:{status:'tox'},effects:{first_turn:false,move_history_known:true,toxic_counter:3}}});
 // floor(100/16) * 4 = 24: the NPC survives. floor(100*4/16)
 // would incorrectly predict a KO and suppress Protect.
 assert.ok(probability(b,'Protect')>0);
});
test('Skill Link does not turn Surging Strikes into five hits in NPC scoring',()=>{
 const make=ability=>setup(['Splash'],['Surging Strikes','Hydro Pump'],{opponent:{actual_stats:{hp:100,atk:30,def:30,spa:50,spd:30,spe:50},build:{ability}}});
 assert.deepEqual(npcMoveDistribution(make('Skill Link')),npcMoveDistribution(make('')));
});
test('Priority is preferred when the slower NPC faces a knockout',()=>{
 const b=setup(['Night Shade'],['Quick Attack','Tackle','Swords Dance'],{player:{build:{level:80}},opponent:{current_hp:10,spe:10}});
 assert.equal(probability(b,'Quick Attack'),1);
});
test('Immune Snarl cannot earn an attack-drop scoring bonus',()=>{
 const b=setup(['Psychic'],['Snarl','Tackle'],{player:{species:'Whismur',build:{ability:'Soundproof'}}});
 assert.equal(probability(b,'Snarl'),0);
});
test('Psychic Terrain blocks priority scoring against grounded targets only',()=>{
 const make=species=>setup(['Night Shade'],['Quick Attack','Tackle'],{player:{species,build:{level:80}},opponent:{current_hp:10,spe:10},field:{terrain:'Psychic'}});
 assert.equal(probability(make('Mew'),'Quick Attack'),0);
 assert.equal(probability(make('Pidgey'),'Quick Attack'),1);
});
test('First-turn attacks and powder immunity are checked before selecting NPC moves',()=>{
 const b=setup(['Splash'],['First Impression','Tackle'],{opponent:{effects:{first_turn:false,move_history_known:true}}});
 assert.equal(probability(b,'First Impression'),0);
 const grass=setup(['Splash'],['Spore','Tackle'],{player:{species:'Bulbasaur'}});
 assert.equal(probability(grass,'Spore'),0);
});
