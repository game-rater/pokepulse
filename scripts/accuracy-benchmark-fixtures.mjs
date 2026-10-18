import calculator from '../vendor/run-bun/index.js';
import {completeMoveDex} from '../analysis/complete-moves.mjs';
const gen=calculator.Generations.get(8),stats=['hp','atk','def','spa','spd','spe'];
const source='https://github.com/smogon/damage-calc/blob/master/calc/src/test/calc.test.ts';
const mechanics='https://github.com/smogon/pokemon-showdown/blob/master/data/moves.ts';
export function referenceMon(species,moves,{level=100,hp,status='',ability='',item='',effects={}}={}){
 const build={level,nature:'Serious',ability,item,status,moves,gender:species==='Mew'?'N':species==='Blissey'?'F':'M',
  ivs:Object.fromEntries(stats.map(s=>[s,31])),evs:Object.fromEntries(stats.map(s=>[s,0])),
  boosts:{atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0}};
 const p=new calculator.Pokemon(gen,species,build);
 return {species,build,actual_stats:{...p.rawStats},current_hp:hp??p.maxHP(),
  pp:Object.fromEntries(moves.map(m=>[m,completeMoveDex.moves.get(m).pp])),
  effects:{live_data:true,first_turn:false,move_history_known:true,protect_streak:0,...effects}};
}
function fixture(id,player,opponent,oracle,description){return {id,group:'accuracy',...(oracle.startsWith('complex-')?{family:'proved-complex'}:{}),description,
 oracle,provenance:{kind:'analytic-control',sources:[source,mechanics,'https://github.com/smogon/pokemon-showdown/blob/master/data/items.ts','https://github.com/smogon/pokemon-showdown/blob/master/data/conditions.ts'],notes:'Mechanics-test-inspired Run & Bun controls, not reproductions of recorded battles.'},
 snapshot:{player,opponent,field:{}}};}
const tie=()=>referenceMon('Mew',['Seismic Toss'],{level:50,hp:50});
export const accuracyFixtures=[
 fixture('oracle-fixed-win',referenceMon('Mew',['Seismic Toss'],{level:50}),referenceMon('Vulpix',['Splash']),
  'fixed-win','Fixed-damage benchmark adapted from the upstream Mew/Vulpix test'),
 fixture('oracle-fixed-loss',referenceMon('Vulpix',['Splash']),referenceMon('Mew',['Seismic Toss'],{level:50}),
  'fixed-loss','Reverse of the fixed-damage benchmark'),
 fixture('oracle-speed-tie',tie(),tie(),'speed-tie','Equal-speed one-hit Seismic Toss race'),
 fixture('oracle-focus-blast',referenceMon('Alakazam',['Focus Blast'],{hp:1}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'focus-blast','One attack opportunity: Run & Bun Focus Blast accuracy'),
 fixture('oracle-paralysis',referenceMon('Pikachu',['Quick Attack'],{hp:1,status:'par'}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'paralysis','Priority attack wins if full paralysis does not prevent action'),
 fixture('oracle-triple-axel',referenceMon('Weavile',['Triple Axel'],{hp:1,ability:'Pressure'}),referenceMon('Blissey',['Seismic Toss'],{hp:600}),
  'triple-axel','Exactly three successful hits are needed, regardless of critical rolls'),
 fixture('oracle-skill-link-axel',referenceMon('Cinccino',['Triple Axel'],{hp:1,ability:'Skill Link'}),referenceMon('Blissey',['Seismic Toss'],{hp:330}),
  'skill-link-axel','Skill Link removes the second and third accuracy checks'),
 fixture('oracle-focus-three',referenceMon('Alakazam',['Focus Blast'],{hp:201}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'complex-focus-three','Three attempts before fixed-damage retaliation KOs'),
 fixture('oracle-paralysis-three',referenceMon('Pikachu',['Quick Attack'],{hp:201,status:'par'}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'complex-paralysis-three','Three priority opportunities with independent full paralysis'),
 fixture('oracle-sash-paralysis',referenceMon('Pikachu',['Quick Attack'],{level:1,status:'par',item:'Focus Sash'}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'complex-sash-paralysis','Focus Sash buys a second priority opportunity after full paralysis'),
 fixture('oracle-poison-window',referenceMon('Alakazam',['Focus Blast'],{hp:101,status:'psn'}),referenceMon('Blissey',['Seismic Toss'],{hp:1}),
  'complex-poison-window','Poison removes the second attack opportunity after a miss'),
 fixture('oracle-choice-guaranteed',referenceMon('Alakazam',['Focus Blast','Seismic Toss'],{hp:101}),referenceMon('Blissey',['Seismic Toss'],{hp:150}),
  'complex-choice-guaranteed','Two guaranteed fixed hits beat repeated inaccurate knockout attempts'),
 fixture('oracle-choice-adaptive',referenceMon('Alakazam',['Focus Blast','Seismic Toss'],{hp:101}),referenceMon('Blissey',['Seismic Toss'],{hp:250}),
  'complex-choice-adaptive','After Focus Blast, finish with Seismic Toss on a hit; retry for a critical on a miss'),
];
