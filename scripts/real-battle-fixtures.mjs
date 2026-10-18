import calculator from '../vendor/run-bun/index.js';
import {completeMoveDex} from '../analysis/complete-moves.mjs';
const gen=calculator.Generations.get(8),stats=['hp','atk','def','spa','spd','spe'];
const trainerSource='https://github.com/SynchEleven/rnb-calc-ultimate/blob/15a0ea580604595786e0f81d965e68afc66279e4/src/js/data/sets/gen8.js';
const reports={drednaw:'https://www.reddit.com/r/nuzlocke/comments/1nbdd25/',monferno:'https://www.reddit.com/r/nuzlocke/comments/1w05j4s/',norman:'https://www.reddit.com/r/nuzlocke/comments/1l8xjwf/'};
// Battle-inspired synthetic states, not extracted replay snapshots.
function mon(species,level,nature,ability,item,moves,{ivs=20,hp=1,boosts={},status='',effects={}}={}){
 const build={level,nature,ability,item,moves,gender:['Porygon2','Lunatone'].includes(species)?'N':'M',status,
  evs:Object.fromEntries(stats.map(s=>[s,0])),ivs:typeof ivs==='number'?Object.fromEntries(stats.map(s=>[s,ivs])):ivs,
  boosts:{atk:0,def:0,spa:0,spd:0,spe:0,accuracy:0,evasion:0,...boosts}};
 const pokemon=new calculator.Pokemon(gen,species,build);
 return {species,build,current_hp:Math.max(1,Math.floor(pokemon.maxHP()*hp)),actual_stats:{...pokemon.rawStats},
  pp:Object.fromEntries(moves.map(move=>[move,completeMoveDex.moves.get(move).pp])),
  effects:{live_data:true,first_turn:false,move_history_known:true,protect_streak:0,...effects}};
}
function fixture(family,variant,description,player,opponent,report,documented){
 return {id:`${family}-${variant}`,family,variant,group:'real-battle',description,
  provenance:{kind:'synthetic-reconstruction',report,trainer_source:trainerSource,documented,
   assumptions:['HP, PP, history and phase variants are constructed, not extracted from video.',
    'Player builds are illustrative unless explicitly documented; ROM learnset legality is not established.',
    'Unspecified player IVs 20; opponent IVs 31; zero EVs; male or genderless.',
    'Community opponent sets are not ROM verification. No switches are simulated.']},
  snapshot:{player,opponent,field:{}}};
}
const drednaw=options=>mon('Drednaw',25,'Careful','Strong Jaw','Chesto Berry',['Rock Tomb','Water Pulse','Bite','Ice Fang'],
 {ivs:{hp:20,atk:17,def:16,spa:9,spd:26,spe:17},hp:0.6,boosts:{spe:-1},...options});
const lunatone=options=>mon('Lunatone',25,'Timid','Levitate','Weakness Policy',['Stored Power','Ancient Power','Icy Wind','Hypnosis'],{ivs:31,boosts:{spe:-1},...options});
const monferno=options=>mon('Monferno',21,'Jolly','Blaze','',['Low Sweep','Leer','Low Kick','Mach Punch'],options);
const scraggy=options=>mon('Scraggy',21,'Impish','Shed Skin','Eviolite',['Feint Attack','Power-Up Punch','Rock Tomb','Rest'],{ivs:31,...options});
const hariyama=options=>mon('Hariyama',42,'Adamant','Guts','',['Fake Out','Force Palm','Knock Off','Vital Throw'],options);
// Equal Hariyama defenses give Download a Special Attack boost on entry.
const porygon=options=>mon('Porygon2',41,'Modest','Download','Eviolite',['Tri Attack','Ice Beam','Recover','Thunder Wave'],{ivs:31,boosts:{spa:1},...options});
const togedemaru=options=>mon('Togedemaru',42,'Careful','Iron Barbs','',['Fake Out','Zing Zap','Iron Head','Spiky Shield'],options);
const cinccino=options=>mon('Cinccino',42,'Jolly','Skill Link',"King's Rock",['Tail Slap','Bullet Seed','Rock Blast','Triple Axel'],{ivs:31,...options});
const rows=[];
for(const variant of ['initial','triggered','asleep']){
 const p=drednaw(variant==='asleep'?{status:'slp',effects:{sleep_counter:2}}:{}),q=lunatone();
 if(variant!=='initial'){p.build.item='';q.build.item='';q.build.boosts.atk=2;q.build.boosts.spa=2;q.current_hp=Math.floor(q.actual_stats.hp*0.6);}
 rows.push(fixture('drednaw-lunatone',variant,'Sleep, berry consumption, Weakness Policy and move order',p,q,reports.drednaw,
  ['Drednaw level, nature, IVs, ability, item and moves.','Both sides have one Speed drop; Lunatone initially full HP.']));
}
for(const variant of ['initial','boosted','resting']){
 const p=monferno(variant==='initial'?{}:{hp:0.65,boosts:{spe:-1}});
 const q=scraggy(variant==='initial'?{}:variant==='boosted'?{hp:0.55,boosts:{atk:1}}:{status:'slp',boosts:{atk:1},effects:{sleep_counter:2}});
 rows.push(fixture('monferno-scraggy',variant,'Attacking versus Leer, Rest, Shed Skin and setup',p,q,reports.monferno,
  ['Monferno/Scraggy discussion includes Low Sweep, Leer, Low Kick and Rest decisions.']));
}
for(const variant of ['initial','paralyzed','pressure']){
 const p=hariyama({hp:variant==='pressure'?0.45:1,status:variant==='initial'?'':'par',effects:{first_turn:variant==='initial'}});
 const q=porygon({hp:variant==='initial'?1:variant==='paralyzed'?0.75:0.55});
 rows.push(fixture('hariyama-porygon2',variant,'Guts activation versus paralysis and Recover',p,q,reports.norman,
  ['A player deliberately accepts Porygon2 Thunder Wave to activate Guts on Hariyama.']));
}
for(const variant of ['initial','chipped','protected']){
 const p=togedemaru({hp:variant==='initial'?1:variant==='chipped'?0.75:0.45,effects:{first_turn:variant==='initial',protect_streak:variant==='protected'?1:0}});
 const q=cinccino({hp:variant==='initial'?1:variant==='chipped'?0.75:0.45});
 if(variant==='protected'){p.effects.last_move='Spiky Shield';p.pp['Spiky Shield']--;}
 rows.push(fixture('togedemaru-cinccino',variant,'Multi-hit flinch, contact damage and protection',p,q,reports.norman,
  ['Community recommendation of Togedemaru against Skill Link/King\'s Rock Cinccino.']));
}
export const realBattleFixtures=rows;
