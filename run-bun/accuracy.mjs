import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {completeMoveDex} from '../analysis/native-battle.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const moveData=JSON.parse(readFileSync(resolve(root,'data/battle-data.json'),'utf8')).moves;
const mechanics=JSON.parse(readFileSync(resolve(root,'run-bun/move-effects.json'),'utf8')).moves;
const alwaysHits=new Set(['Aerial Ace','Aura Sphere','Magical Leaf','Magnet Bomb','Shadow Punch','Shock Wave','Smart Strike','Swift','Vital Throw']);
// Accuracy edits from the Run & Bun 1.07 move-change table. Unlisted moves
// retain their Generation 8 accuracy, as specified by the hack's mechanics.
const runBunAccuracy={
  Aeroblast:100,'Air Cutter':100,'Air Slash':100,'Aqua Tail':95,Barrage:100,Belch:100,Bind:100,'Blaze Kick':100,
  Blizzard:80,'Blue Flare':90,'Bolt Strike':90,'Bone Club':100,Bonemerang:100,Bounce:95,'Charge Beam':100,
  'Circle Throw':95,Clamp:100,'Comet Punch':90,Crabhammer:100,'Cross Chop':90,Cut:100,'Dark Void':80,
  'Diamond Storm':100,'Double Hit':100,'Double Slap':100,'Draco Meteor':100,'Dragon Rush':85,'Dragon Tail':95,
  'Drill Run':100,'Dual Chop':100,'Dual Wingbeat':100,Electroweb:100,'Fire Fang':100,'Fire Spin':100,Flash:70,
  'Fleur Cannon':100,Fly:100,'Flying Press':100,'Focus Blast':80,'Freeze Shock':100,'Frenzy Plant':100,
  'Frost Breath':100,'Fury Attack':100,'Fury Swipes':90,'Gear Grind':100,'Giga Impact':100,Glaciate:100,
  'Grass Whistle':70,'Gunk Shot':85,'Hammer Arm':100,'Head Smash':85,'Heat Wave':100,'High Horsepower':100,
  Hurricane:80,'Hydro Cannon':100,'Hydro Pump':85,'Hyper Beam':100,'Hyper Fang':100,Hypnosis:70,'Ice Burn':100,
  'Ice Fang':100,'Ice Hammer':100,'Icicle Crash':100,'Icy Wind':100,'Iron Tail':85,Kinesis:100,'Leaf Storm':100,
  'Leaf Tornado':100,'Leech Seed':100,'Light of Ruin':100,'Lovely Kiss':80,'Magma Storm':90,'Mega Kick':85,
  'Mega Punch':100,Megahorn:90,'Metal Claw':100,'Metal Sound':100,'Meteor Beam':100,'Meteor Mash':100,
  'Mirror Shot':100,'Mud Bomb':100,'Muddy Water':95,"Nature's Madness":100,'Night Daze':100,Octazooka:100,
  'Origin Pulse':100,Overheat:100,'Pin Missile':100,'Play Rough':100,'Poison Powder':90,'Power Whip':90,
  'Precipice Blades':100,'Precicipe Blades':100,'Psycho Boost':100,'Razor Leaf':100,'Razor Shell':100,
  'Roar of Time':100,'Rock Blast':100,'Rock Climb':95,'Rock Slide':100,'Rock Throw':100,'Rock Wrecker':100,
  'Rolling Kick':100,'Sacred Fire':100,'Sand Tomb':100,'Scale Shot':100,Screech:100,'Seed Flare':90,Sing:70,
  'Skitter Smack':100,'Sky Attack':100,'Sky Uppercut':100,Slam:90,'Sleep Powder':80,Smog:90,Snarl:100,
  'Sonic Boom':100,'Spacial Rend':100,'Steam Eruption':100,'Steel Beam':100,'Steel Wing':100,'Stone Edge':85,
  'Strange Steam':100,'Stun Spore':90,Submission:100,'Super Fang':100,Supersonic:70,Swagger:90,'Sweet Kiss':80,
  'Tail Slap':100,'Take Down':100,Thunder:80,'Thunder Cage':100,'Thunder Fang':100,Whirlpool:100,Wrap:100,
  'Zen Headbutt':100,'10,000,000 Volt Thunderbolt':100
};
const stageFactor=stage=>stage>=0?(3+stage)/3:3/(3-stage);

// The bundled community damage calculator omits accuracy. Use the bundled move
// table and Generation 8 Accuracy/Evasion stages to weight expected damage.
export function hitChance(_side,attacker,defender,move,field={}){
  const ability=p=>typeof p.ability==='string'?p.ability:p.ability?.name||'';
  const aAbility=ability(attacker),dAbility=['Mold Breaker','Teravolt','Turboblaze'].includes(aAbility)?'':ability(defender);
  if(['Fissure','Guillotine','Horn Drill','Sheer Cold'].includes(move.name)){
    if(defender.level>attacker.level||move.name==='Sheer Cold'&&defender.types.includes('Ice'))return {chance:0,accuracy:0,note:'One-hit KO immunity or level restriction.'};
    if(dAbility==='Sturdy'&&!['Mold Breaker','Teravolt','Turboblaze'].includes(aAbility))return {chance:0,accuracy:0,note:'Sturdy prevents a one-hit KO.'};
    if(aAbility==='No Guard'||dAbility==='No Guard')return {chance:1,accuracy:100,note:null};
    const accuracy=Math.min(100,(move.name==='Sheer Cold'&&!attacker.types.includes('Ice')?20:30)+attacker.level-defender.level);return {chance:accuracy/100,accuracy,note:null};
  }
  if(alwaysHits.has(move.name)||aAbility==='No Guard'||dAbility==='No Guard')return {chance:1,accuracy:100,note:null};
  if((move.name==='Thunder Wave'&&attacker.types?.includes('Electric'))||(move.name==='Toxic'&&attacker.types?.includes('Poison')))return {chance:1,accuracy:100,note:null};
  const id=move.name.toLowerCase().replace(/[^a-z0-9]/g,'');
  let base=runBunAccuracy[move.name]??mechanics[id]?.accuracy??moveData[id]?.accuracy??completeMoveDex.moves.get(id).accuracy;
  if(base===true)return {chance:1,accuracy:100,note:null};
  if(!Number.isFinite(base))return {chance:null,accuracy:null,note:`${move.name}: accuracy data unavailable; outcome remains unresolved.`};
  const weather=[ability(attacker),ability(defender)].some(a=>['Air Lock','Cloud Nine'].includes(a))?'':field.weather||'';
  if(move.name==='Blizzard'&&['Hail','Snow'].includes(weather))return {chance:1,accuracy:100,note:null};
  if(['Thunder','Hurricane'].includes(move.name)){
    if(weather.includes('Rain'))base=100;
    else if(weather.includes('Sun'))base=50;
  }
  if(aAbility==='No Guard'||dAbility==='No Guard')base=100;
  let modifier=1;
  if(field.isGravity)modifier*=5/3;
  if(aAbility==='Compound Eyes')modifier*=1.3;
  if(aAbility==='Victory Star')modifier*=1.1;
  if(aAbility==='Hustle'&&move.category==='Physical')modifier*=0.8;
  if(dAbility==='Sand Veil'&&weather==='Sand'||dAbility==='Snow Cloak'&&['Hail','Snow'].includes(weather))modifier*=0.8;
  if(dAbility==='Tangled Feet'&&defender.confusion)modifier*=0.5;
  if(dAbility==='Wonder Skin'&&move.category==='Status'&&base>50)base=50;
  if(attacker.item==='Wide Lens')modifier*=1.1;
  if(attacker.item==='Zoom Lens'&&defender.acted)modifier*=1.2;
  if(attacker.micle)modifier*=1.2;
  if(['Bright Powder','Lax Incense'].includes(defender.item))modifier*=0.9;
  if(field.isGravity)modifier*=5/3;
  const stage=Math.max(-6,Math.min(6,(attacker.boosts.accuracy||0)-(aAbility==='Keen Eye'?0:defender.boosts.evasion||0)));
  const accuracy=Math.max(1,Math.min(100,Math.floor(base*stageFactor(stage)*modifier)));
  return {chance:accuracy/100,accuracy,note:accuracy<100?`${move.name}: ${accuracy}% hit chance after Accuracy/Evasion stages.`:null};
}
