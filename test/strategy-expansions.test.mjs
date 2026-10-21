import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyOrdering,strategyPatterns,surveyStrategyCoverage} from '../analysis/strategy-registry.mjs';
import {expandedStrategyPatterns} from '../analysis/strategy-expansions.mjs';
import {createCompleteBattle,restoreCompleteBattle,nativeMoveChoices} from '../analysis/native-battle.mjs';
import {referenceMon} from '../scripts/accuracy-benchmark-fixtures.mjs';
const full=b=>{b.p1.active[0].hp=b.p1.active[0].maxhp;};
const last=(b,id)=>{b.p2.active[0].lastMove=b.dex.getActiveMove(id);};
const effect=(b,side,id,data={})=>{const p=b.sides[side].active[0];p.volatiles[id]=b.initEffectState({id,target:p,...data});};
function battle(moves,options={},setup){
 const p=referenceMon(options.species||'Mew',moves,{level:30,hp:80,...options.player});
 const q=referenceMon(options.foeSpecies||'Mew',options.foeMoves||['Tackle','Recover','Thunderbolt','Splash'],{level:30,...options.opponent});
 const b=restoreCompleteBattle(createCompleteBattle({player:p,opponent:q,field:{}}));setup?.(b);return b;
}
const matches=b=>strategyOrdering(b.p1.active[0],nativeMoveChoices(b.p1.active[0]));
const match=(b,id)=>matches(b).matches.find(m=>m.id===id);
const controls=[
 ['sleep-focus-punch',['Spore','Focus Punch']],
 ['sleep-nightmare',['Hypnosis','Nightmare']],
 ['bad-dreams-stall',['Dark Void','Protect'],{species:'Darkrai',player:{ability:'Bad Dreams'}}],
 ['yawn-protect-sleep',['Yawn','Protect','Tackle']],
 ['paralysis-flinch',['Thunder Wave','Iron Head']],
 ['paralysis-confusion',['Thunder Wave','Confuse Ray','Thunderbolt']],
 ['encore-setup',['Encore','Power-Up Punch'],{},b=>last(b,'recover')],
 ['encore-disable',['Encore','Disable'],{},b=>last(b,'tackle')],
 ['substitute-disable-attack',['Substitute','Disable','Shadow Ball']],
 ['torment-substitute-protect',['Torment','Substitute','Protect']],
 ['taunt-poison-recovery',['Taunt','Toxic','Recover']],
 ['choice-item-transfer',['Trick','Will-O-Wisp'],{player:{item:'Choice Scarf'}}],
 ['lagging-tail-transfer',['Trick','Recover'],{player:{item:'Lagging Tail'}}],
 ['binding-taunt-poison',['Magma Storm','Taunt','Toxic']],
 ['binding-poison-recovery',['Infestation','Toxic','Recover']],
 ['ghost-curse-sustain',['Curse','Substitute','Pain Split'],{species:'Gengar'}],
 ['burn-sustain',['Will-O-Wisp','Recover']],
 ['wish-protect',['Wish','Protect']],
 ['pressure-substitute-protect',['Substitute','Protect'],{player:{ability:'Pressure'}}],
 ['berry-recycle',['Recycle','Curse'],{},b=>{b.p1.active[0].lastItem='sitrusberry';}],
 ['harvest-sun-substitute',['Sunny Day','Substitute','Leech Seed'],{player:{ability:'Harvest',item:'Sitrus Berry'}}],
 ['berry-rest',['Rest'],{player:{item:'Chesto Berry'}}],
 ['hydration-rain-rest',['Rain Dance','Rest'],{player:{ability:'Hydration'}}],
 ['orb-guts-facade',['Protect','Facade'],{player:{ability:'Guts',item:'Flame Orb'}}],
 ['poison-heal-substitute-protect',['Protect','Substitute'],{player:{ability:'Poison Heal',item:'Toxic Orb'}}],
 ['defensive-boost-recover',['Cosmic Power','Recover','Stored Power']],
 ['power-split-rest',['Power Split','Rest'],{species:'Shuckle',player:{hp:40}}],
 ['offense-reduction-rest',['Charm','Rest']],
 ['fling-acrobatics',['Fling','Acrobatics'],{player:{item:'Toxic Orb'}}],
 ['terrain-seed-unburden',['Electric Terrain','Acrobatics','Swords Dance'],{player:{ability:'Unburden',item:'Electric Seed'}}],
 ['belly-berry-priority',['Belly Drum','Aqua Jet'],{player:{item:'Sitrus Berry'}}],
 ['substitute-petaya-water',['Substitute','Surf'],{player:{ability:'Torrent',item:'Petaya Berry'}}],
 ['salac-endure-reversal',['Endure','Reversal'],{player:{item:'Salac Berry'}}],
 ['white-herb-shell-smash',['Shell Smash','Icicle Spear'],{player:{item:'White Herb'}}],
 ['critical-setup-attack',['Focus Energy','Draco Meteor'],{player:{item:'Scope Lens'}}],
 ['power-herb-setup',['Geomancy','Moonblast'],{player:{item:'Power Herb'}}],
 ['multiscale-policy-agility',['Agility','Outrage'],{player:{ability:'Multiscale',item:'Weakness Policy'},foeMoves:['Bite']},full],
 ['speed-boost-protect',['Protect','Swords Dance','Acrobatics'],{player:{ability:'Speed Boost'},foeSpecies:'Deoxys-Speed'}],
 ['substitute-secondary-boost',['Substitute','Charge Beam','Thunderbolt']],
 ['soak-poison',['Soak','Toxic'],{foeSpecies:'Magnemite'}],
 ['gravity-accuracy',['Gravity','Hypnosis']],
 ['gravity-ground',['Gravity','Earthquake'],{foeSpecies:'Charizard'}],
 ['smack-down-ground',['Smack Down','Earthquake'],{foeSpecies:'Charizard'}],
 ['balloon-removal-ground',['Knock Off','Earthquake'],{opponent:{item:'Air Balloon'}}],
 ['trick-room-attack',['Trick Room','Psychic'],{foeSpecies:'Deoxys-Speed'}],
 ['psychic-terrain-expanding-force',['Psychic Terrain','Expanding Force']],
 ['sun-ability-offense',['Sunny Day','Flamethrower'],{player:{ability:'Solar Power'}}],
 ['weather-speed-offense',['Sandstorm','Iron Head'],{player:{ability:'Sand Rush'}}],
 ['endeavor-priority',['Endeavor','Quick Attack'],{species:'Rattata',player:{level:1,hp:12,item:'Focus Sash'}},full],
 ['sturdy-shell-bell-endeavor',['Endeavor','Sandstorm'],{species:'Aron',player:{level:1,hp:12,ability:'Sturdy',item:'Shell Bell'}},full],
 ['survival-retaliation',['Counter','Mirror Coat'],{},full],
 ['imprison-transform',['Imprison','Transform']],
 ['taunt-destiny-bond',['Taunt','Destiny Bond']],
 ['history-last-resort',['Fake Out','Last Resort'],{player:{effects:{first_turn:true}}}],
 ['encore-retaliation',['Encore','Counter'],{},b=>last(b,'tackle')],
 ['sleep-substitute-punch',['Spore','Substitute','Focus Punch']],
 ['orb-psycho-shift',['Protect','Psycho Shift','Recover'],{player:{ability:'Magic Guard',item:'Flame Orb'}}],
 ['tailwind-attack',['Tailwind','Brave Bird'],{foeSpecies:'Deoxys-Speed'}],
 ['screen-setup',['Reflect','Calm Mind','Psychic']],
 ['hail-veil-setup',['Hail','Aurora Veil','Nasty Plot','Blizzard']],
 ['grassy-terrain-sustain',['Grassy Terrain','Grassy Glide','Protect']],
 ['grassy-terrain-recovery',['Grassy Terrain','Protect']],
 ['shed-skin-rest',['Rest'],{player:{ability:'Shed Skin'}}],
 ['swagger-foul-play',['Swagger','Foul Play','Substitute']],
 ['suppress-status-immunity',['Gastro Acid','Toxic'],{opponent:{ability:'Immunity'}}],
 ['accuracy-boost-follow-up',['Coil','Hypnosis']],
 ['sound-throat-spray',['Boomburst','Overdrive'],{player:{item:'Throat Spray'}}],
 ['power-herb-meteor-beam',['Meteor Beam','Sludge Wave'],{player:{item:'Power Herb'}}],
];
for(const [id,moves,options,setup]of controls)test(`Expanded strategy binds an eligible native control: ${id}`,()=>{
 const b=battle(moves,options,setup),m=match(b,id);assert.ok(m,id);assert.equal(m.phase,0,id);
 assert.ok(m.nextSlots.length);assert.ok(m.sequence.every(ids=>ids.length));
});
test('Every survey entry and expanded family is linked to tested runtime patterns',()=>{
 assert.deepEqual(surveyStrategyCoverage.map(c=>c.survey),Array.from({length:72},(_,i)=>'R'+String(i+1).padStart(2,'0')));
 const ids=new Set(strategyPatterns.map(p=>p.id));for(const row of surveyStrategyCoverage)for(const id of row.patterns)assert.ok(ids.has(id),row.survey+': '+id);
 assert.deepEqual(new Set(controls.map(([id])=>id)),new Set(expandedStrategyPatterns.map(p=>p.id)));
});
test('Contrary and secondary producers are indexed by their actual current effect',()=>{
 for(const [moves,ability,id]of [[['Leaf Storm','Psychic'],'Contrary','special-attack-special'],[['Superpower','Tackle'],'Contrary','attack-physical'],[['Charge Beam','Psychic'],'Synchronize','special-attack-special']]){
  const b=battle(moves,{player:{ability}});assert.ok(match(b,id));
  b.p1.active[0].boosts[moves[0]==='Superpower'?'atk':'spa']=6;assert.equal(match(b,id).phase,1);
 }
 assert.equal(match(battle(['Leaf Storm','Psychic']),'special-attack-special'),undefined);
 assert.equal(match(battle(['Charge Beam','Psychic'],{player:{ability:'Sheer Force'}}),'special-attack-special'),undefined);
});
test('All expanded controls are pure lookups and respect the current legal request',()=>{
 for(const [id,moves,options,setup]of controls){
  const b=battle(moves,options,setup),before=JSON.stringify(b.toJSON()),h=matches(b),active=h.matches.find(m=>m.id===id);
  assert.equal(JSON.stringify(b.toJSON()),before,id);
  const legal=nativeMoveChoices(b.p1.active[0]).filter(c=>!active.nextSlots.includes(c.slot));
  assert.equal(strategyOrdering(b.p1.active[0],legal).matches.find(m=>m.id===id)?.phase===active.phase,false,id);
 }
});
const transitions=[
 ['yawn-protect-sleep',['Yawn','Protect','Tackle'],'yawn'],
 ['encore-disable',['Encore','Disable'],'encore',{},b=>last(b,'splash')],
 ['wish-protect',['Wish','Protect'],'wish'],
 ['orb-guts-facade',['Protect','Facade'],'protect',{player:{ability:'Guts',item:'Flame Orb'}}],
 ['poison-heal-substitute-protect',['Protect','Substitute'],'protect',{player:{ability:'Poison Heal',item:'Toxic Orb'}}],
 ['fling-acrobatics',['Fling','Acrobatics'],'fling',{player:{item:'Toxic Orb'}}],
 ['terrain-seed-unburden',['Electric Terrain','Acrobatics'],'electricterrain',{player:{ability:'Unburden',item:'Electric Seed'}}],
 ['power-herb-setup',['Geomancy','Moonblast'],'geomancy',{player:{item:'Power Herb'}}],
 ['soak-poison',['Soak','Toxic'],'soak',{foeSpecies:'Magnemite'}],
 ['gravity-accuracy',['Gravity','Hypnosis'],'gravity'],
 ['smack-down-ground',['Smack Down','Earthquake'],'smackdown',{foeSpecies:'Charizard'}],
 ['balloon-removal-ground',['Knock Off','Earthquake'],'knockoff',{opponent:{item:'Air Balloon'}}],
 ['imprison-transform',['Imprison','Transform'],'imprison'],
 ['history-last-resort',['Fake Out','Last Resort'],'fakeout',{player:{effects:{first_turn:true}}}],
 ['accuracy-boost-follow-up',['Coil','Hypnosis'],'coil'],
 ['sound-throat-spray',['Boomburst','Overdrive'],'boomburst',{player:{item:'Throat Spray'}}],
 ['power-herb-meteor-beam',['Meteor Beam','Sludge Wave'],'meteorbeam',{player:{item:'Power Herb'}}],
];
for(const [id,moves,first,options,setup]of transitions)test(`Native completed turn advances indexed strategy: ${id}`,()=>{
 const b=battle(moves,{...options,foeMoves:['Splash']},setup),p=b.p1.active[0];
 assert.equal(b.choose('p1','move '+(p.moveSlots.findIndex(s=>s.id===first)+1)),true);
 assert.equal(b.choose('p2','move 1'),true);
 const m=match(b,id);assert.ok(m,id);assert.equal(m.phase,1,id);
});
test('Observed restrictions expire and never stand in for future opponent choices',()=>{
 const b=battle(['Encore','Disable','Swords Dance']),p=b.p2.active[0];
 assert.equal(match(b,'encore-disable'),undefined,'no invented move history');
 last(b,'recover');assert.equal(match(b,'encore-setup').phase,0);
 effect(b,1,'encore',{move:'recover',duration:1});assert.equal(match(b,'encore-setup').phase,1);
 effect(b,1,'encore',{move:'tackle',duration:1});assert.equal(match(b,'encore-setup'),undefined,'damaging lock is not a free setup');
 assert.equal(match(b,'encore-disable'),undefined,'last move must match encore');
 last(b,'tackle');assert.equal(match(b,'encore-disable').phase,1);
 p.removeVolatile('encore');assert.equal(match(b,'encore-disable').phase,0);
 p.moveSlots.find(s=>s.id==='tackle').pp=0;assert.equal(match(b,'encore-disable'),undefined);
});
test('Consumed items, suppression and weather timers invalidate item/ability plans',()=>{
 const orb=battle(['Protect','Facade'],{player:{ability:'Guts',item:'Flame Orb'}}),p=orb.p1.active[0];
 assert.ok(match(orb,'orb-guts-facade'));p.item='';assert.equal(match(orb,'orb-guts-facade'),undefined);
 p.item='flameorb';effect(orb,0,'embargo');assert.equal(match(orb,'orb-guts-facade'),undefined);
 const rest=battle(['Rest'],{player:{item:'Chesto Berry'}});assert.ok(match(rest,'berry-rest'));
 rest.p2.active[0].setAbility('unnerve');assert.equal(match(rest,'berry-rest'),undefined);
 const rain=battle(['Rain Dance','Rest'],{player:{ability:'Hydration'}});rain.field.setWeather('raindance',rain.p1.active[0]);
 rain.field.weatherState.duration=2;assert.equal(match(rain,'hydration-rain-rest').phase,1);
 rain.field.weatherState.duration=1;assert.equal(match(rain,'hydration-rain-rest'),undefined);
 rain.field.clearWeather();assert.equal(match(rain,'hydration-rain-rest').phase,0);
 const seed=battle(['Electric Terrain','Acrobatics'],{player:{ability:'Unburden'}});
 assert.equal(match(seed,'terrain-seed-unburden'),undefined,'itemless does not imply Unburden activated');
 effect(seed,0,'unburden');assert.equal(match(seed,'terrain-seed-unburden').phase,1);
});
test('Resource thresholds, grounding, status immunities and Speed gate candidates',()=>{
 const drum=battle(['Belly Drum','Aqua Jet'],{player:{item:'Sitrus Berry'}});full(drum);
 drum.p1.active[0].maxhp=101;drum.p1.active[0].hp=101;assert.equal(match(drum,'belly-berry-priority'),undefined,'odd full HP misses immediate Sitrus threshold');
 drum.p1.active[0].hp=100;assert.ok(match(drum,'belly-berry-priority'));
 drum.p1.active[0].hp=50;assert.equal(match(drum,'belly-berry-priority'),undefined);
 const grounded=battle(['Gravity','Earthquake']);assert.equal(match(grounded,'gravity-ground'),undefined);
 const sleep=battle(['Yawn','Protect','Tackle'],{opponent:{ability:'Insomnia'}});assert.equal(match(sleep,'yawn-protect-sleep'),undefined);
 const soak=battle(['Soak','Toxic'],{foeSpecies:'Magnemite',opponent:{ability:'Immunity'}});assert.equal(match(soak,'soak-poison'),undefined);
 const para=battle(['Thunder Wave','Iron Head'],{species:'Shuckle',player:{hp:40},foeSpecies:'Deoxys-Speed',opponent:{status:'par'}});
 assert.equal(match(para,'paralysis-flinch'),undefined,'still slower after paralysis');
 const faster=battle(['Trick Room','Psychic'],{foeSpecies:'Shuckle'});assert.equal(match(faster,'trick-room-attack'),undefined);
});
test('Last Resort uses completed-move history, not PP spent or entry assumptions',()=>{
 const b=battle(['Fake Out','Tackle','Last Resort'],{player:{effects:{first_turn:true}}}),p=b.p1.active[0];
 p.moveSlots[0].used=true;assert.equal(match(b,'history-last-resort').phase,0);
 assert.deepEqual(match(b,'history-last-resort').nextSlots,[2]);
 p.moveSlots[1].used=true;assert.equal(match(b,'history-last-resort').phase,1);
 p.moveSlots[1].used=false;p.moveSlots[1].pp=0;
 assert.equal(match(b,'history-last-resort'),undefined,'an exhausted unused move cannot be completed');
});
test('Counter and Mirror Coat follow the actual restriction/category and retain the choice set',()=>{
 const b=battle(['Encore','Counter','Mirror Coat']),p=b.p1.active[0];last(b,'tackle');effect(b,1,'encore',{move:'tackle',duration:2});
 const legal=nativeMoveChoices(p),m=match(b,'encore-retaliation');assert.equal(m.phase,1);assert.deepEqual(m.nextSlots,[2]);
 assert.deepEqual(nativeMoveChoices(p),legal);
 effect(b,1,'encore',{move:'thunderbolt',duration:2});assert.deepEqual(match(b,'encore-retaliation').nextSlots,[3]);
 effect(b,1,'encore',{move:'recover',duration:2});assert.equal(match(b,'encore-retaliation'),undefined);
});
