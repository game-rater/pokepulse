import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyPatterns,compileStrategyMoveset,strategyOrdering} from '../analysis/strategy-registry.mjs';
import {createCompleteBattle,restoreCompleteBattle,nativeMoveChoices} from '../analysis/native-battle.mjs';
import {nativeContinuationPolicy,continuationPolicyValue} from '../analysis/continuation-policy.mjs';
import {referenceMon} from '../scripts/accuracy-benchmark-fixtures.mjs';
const examples=[
 ['sleep-wake-up',['Spore','Wake-Up Slap']],['sleep-dream-eater',['Hypnosis','Dream Eater']],
 ['status-hex',['Will-O-Wisp','Hex']],['poison-venoshock',['Toxic','Venoshock']],['paralysis-smelling-salts',['Thunder Wave','Smelling Salts']],
 ['rest-sleep-talk',['Rest','Sleep Talk']],['rest-snore',['Rest','Snore']],
 ['attack-physical',['Swords Dance','Tackle']],['special-attack-special',['Nasty Plot','Psychic']],
 ['defense-body-press',['Iron Defense','Body Press']],['speed-electro-ball',['Agility','Electro Ball']],
 ['lower-defense-attack',['Screech','Psyshock']],['lower-special-defense-attack',['Fake Tears','Psychic']],
 ['boost-stored-power',['Calm Mind','Stored Power']],['boost-power-trip',['Bulk Up','Power Trip']],
 ['poison-protect',['Toxic','Protect']],['poison-recovery',['Toxic','Recover']],['poison-protect-recovery',['Toxic','Protect','Recover']],
 ['seed-protect',['Leech Seed','Protect']],['seed-recovery',['Leech Seed','Recover']],['seed-substitute-protect',['Leech Seed','Substitute','Protect']],
 ['substitute-focus-punch',['Substitute','Focus Punch']],['defense-curl-rollout',['Defense Curl','Rollout']],['defense-curl-ice-ball',['Defense Curl','Ice Ball']],
 ['charge-electric',['Charge','Thunderbolt']],['focus-energy-attack',['Focus Energy','Tackle']],
 ['rain-water',['Rain Dance','Surf']],['rain-thunder',['Rain Dance','Thunder']],['rain-hurricane',['Rain Dance','Hurricane']],
 ['sun-fire',['Sunny Day','Flamethrower']],['sun-solar-beam',['Sunny Day','Solar Beam']],['sun-solar-blade',['Sunny Day','Solar Blade']],
 ['sun-growth-attack',['Sunny Day','Growth','Psychic']],['weather-weather-ball',['Rain Dance','Weather Ball']],['hail-blizzard',['Hail','Blizzard']],
 ['sand-shore-up',['Sandstorm','Shore Up']],['lock-on-inaccurate',['Lock-On','Zap Cannon']],['endure-low-hp-attack',['Endure','Reversal']],
 ['stockpile-spit-up',['Stockpile','Spit Up']],['stockpile-swallow',['Stockpile','Swallow']],
];
function battle(moves,options={}){
 const player=referenceMon('Mew',moves,{level:30,hp:80,...options.player}),opponent=referenceMon(options.foeSpecies||'Mew',['Tackle'],{level:30,...options.opponent});
 return restoreCompleteBattle(createCompleteBattle({player,opponent,field:{}}));
}
const hints=b=>strategyOrdering(b.p1.active[0],nativeMoveChoices(b.p1.active[0]));
const match=(b,id)=>hints(b).matches.find(m=>m.id===id);
for(const [id,moves] of examples)test(`Ordered strategy index recognizes ${id} from native move metadata`,()=>{
 const b=battle(moves),m=match(b,id);assert.ok(m,id);assert.equal(m.phase,0);assert.deepEqual(m.nextSlots,[1]);
 assert.deepEqual(m.sequence,moves.map(name=>[b.dex.moves.get(name).id]));
});
test('Every registered family has a unique ID and a native-metadata control',()=>{
 assert.equal(new Set(strategyPatterns.map(p=>p.id)).size,strategyPatterns.length);
 assert.deepEqual(new Set(strategyPatterns.map(p=>p.id)),new Set(examples.map(([id])=>id)));
});
test('Moveset hash is order-independent, deduplicated, collision-safe and immutable',()=>{
 const dex=battle(['Spore','Wake-Up Slap']).dex;
 const a=compileStrategyMoveset(dex,['spore','wakeupslap']);
 assert.equal(compileStrategyMoveset(dex,['Wake-Up Slap','Spore','Spore']),a);
 assert.notEqual(compileStrategyMoveset(dex,['Spore','Dream Eater']),a);
 assert.throws(()=>a[0].moves[0].push('tackle'),TypeError);
});
test('Setup advances to its finisher and resets when sleep is cured; no stale state cache',()=>{
 const b=battle(['Spore','Wake-Up Slap']),p=b.p2.active[0];
 assert.equal(match(b,'sleep-wake-up').phase,0);
 p.setStatus('slp');assert.equal(match(b,'sleep-wake-up').phase,1);assert.deepEqual(match(b,'sleep-wake-up').nextSlots,[2]);
 p.cureStatus();assert.equal(match(b,'sleep-wake-up').phase,0);
});
test('Existing external setup needs no setup move, and inactive suffixes are not invented',()=>{
 const asleep=battle(['Wake-Up Slap'],{opponent:{status:'slp',effects:{sleep_counter:2}}});
 assert.equal(match(asleep,'sleep-wake-up').phase,1);
 assert.equal(match(battle(['Wake-Up Slap']),'sleep-wake-up'),undefined);
 assert.equal(match(battle(['Spore']),'sleep-wake-up'),undefined);
});
test('Disabled choices, exhausted PP and move-slot permutations are respected',()=>{
 const b=battle(['Wake-Up Slap','Spore']);assert.deepEqual(match(b,'sleep-wake-up').nextSlots,[2]);
 b.p1.active[0].moveSlots[0].pp=0;b.makeRequest('move');assert.equal(match(b,'sleep-wake-up'),undefined);
 const p=battle(['Spore','Wake-Up Slap']);p.p2.active[0].setStatus('slp');
 const onlySetup=nativeMoveChoices(p.p1.active[0]).filter(c=>c.id==='spore');
 assert.equal(strategyOrdering(p.p1.active[0],onlySetup).matches.find(m=>m.id==='sleep-wake-up'),undefined);
});
test('Poison stall is not promoted against Poison Heal or Magic Guard; Venoshock remains eligible',()=>{
 for(const ability of ['Poison Heal','Magic Guard']){
  const b=battle(['Toxic','Protect','Venoshock'],{opponent:{ability}});
  assert.equal(match(b,'poison-protect'),undefined);assert.ok(match(b,'poison-venoshock'));
 }
});
test('Obvious failed setups receive no combination hint without deleting legal moves',()=>{
 for(const options of [{foeSpecies:'Bulbasaur'},{opponent:{ability:'Insomnia'}},{opponent:{item:'Safety Goggles'}}]){
  const b=battle(['Spore','Wake-Up Slap'],options),before=nativeMoveChoices(b.p1.active[0]);
  assert.equal(match(b,'sleep-wake-up'),undefined);assert.deepEqual(nativeMoveChoices(b.p1.active[0]),before);
 }
 assert.equal(match(battle(['Toxic','Venoshock'],{foeSpecies:'Magnemite'}),'poison-venoshock'),undefined);
 assert.equal(match(battle(['Swords Dance','Tackle'],{player:{ability:'Contrary'}}),'attack-physical'),undefined);
 assert.equal(match(battle(['Swords Dance','Body Press']),'attack-physical'),undefined);
 assert.equal(match(battle(['Swords Dance','Foul Play']),'attack-physical'),undefined);
});
test('Three-step poison plan preserves Protect-before-recovery order',()=>{
 const b=battle(['Toxic','Protect','Recover']),p=b.p1.active[0];
 b.p2.active[0].setStatus('tox');assert.equal(match(b,'poison-protect-recovery').phase,1);
 p.lastMove=b.dex.getActiveMove('protect');assert.equal(match(b,'poison-protect-recovery').phase,2);
 p.hp=p.maxhp;assert.equal(match(b,'poison-protect-recovery'),undefined);
});
test('Weather, boosts, Substitute and Rest are rechecked against the current state',()=>{
 const weather=battle(['Rain Dance','Thunder']);weather.field.setWeather('raindance',weather.p1.active[0]);assert.equal(match(weather,'rain-thunder').phase,1);
 weather.field.clearWeather();assert.equal(match(weather,'rain-thunder').phase,0);
 const boosted=battle(['Calm Mind','Stored Power']);boosted.p1.active[0].boosts.spd=1;assert.equal(match(boosted,'boost-stored-power').phase,1);
 const sub=battle(['Substitute','Focus Punch']);sub.p1.active[0].addVolatile('substitute');assert.equal(match(sub,'substitute-focus-punch').phase,1);
 const rest=battle(['Rest','Sleep Talk'],{player:{status:'slp',effects:{sleep_counter:2}}});assert.equal(match(rest,'rest-sleep-talk').phase,1);
});
test('Indexed state matching does not mutate native battle state',()=>{
 const b=battle(['Toxic','Protect','Recover','Hex']),before=JSON.stringify(b.toJSON());hints(b);hints(b);assert.equal(JSON.stringify(b.toJSON()),before);
});
test('Callback-based setup moves respect resource and boost limits',()=>{
 const drum=battle(['Belly Drum','Tackle']),p=drum.p1.active[0];
 p.hp=p.maxhp;assert.equal(match(drum,'attack-physical').phase,0);
 p.hp=Math.floor(p.maxhp/2);assert.equal(match(drum,'attack-physical'),undefined);
 const pressure=battle(['Acupressure','Stored Power']);
 assert.equal(match(pressure,'boost-stored-power').phase,0);
 for(const stat of Object.keys(pressure.p1.active[0].boosts))pressure.p1.active[0].boosts[stat]=6;
 assert.equal(match(pressure,'boost-stored-power').phase,1);
 const stock=battle(['Stockpile','Spit Up']);stock.p1.active[0].addVolatile('stockpile');
 stock.p1.active[0].volatiles.stockpile.layers=1;assert.equal(match(stock,'stockpile-spit-up').phase,1);
 stock.p1.active[0].removeVolatile('stockpile');assert.equal(match(stock,'stockpile-spit-up').phase,0);
});
test('Defense-drop hints use the attack actual defensive stat',()=>{
 assert.ok(match(battle(['Screech','Psyshock']),'lower-defense-attack'));
 assert.equal(match(battle(['Fake Tears','Psyshock']),'lower-special-defense-attack'),undefined);
 assert.equal(match(battle(['Screech','Tackle'],{opponent:{ability:'Clear Body'}}),'lower-defense-attack'),undefined);
});
test('A late-slot sleeping-target KO is probed first in either orientation',()=>{
 const target=referenceMon('Farfetch’d-Galar',['Focus Energy','Pluck','Rock Smash','Brutal Swing'],{level:21,hp:50,status:'slp',effects:{sleep_counter:1}});
 const attacker=referenceMon('Breloom',['Spore','Mach Punch','Bullet Seed','Wake-Up Slap'],{level:19});
 for(const reverse of [false,true]){
  const state=createCompleteBattle({player:reverse?attacker:target,opponent:reverse?target:attacker,field:{}}),cache=new Map();
  const policy=nativeContinuationPolicy(state,cache);assert.equal(continuationPolicyValue(policy),reverse?1:0);
  assert.equal([...cache.values()][0].scan,8,'finish one decisive row/column before unrelated pairs');
 }
});
test('Hint ordering retains every move pair and preserves fixed NPC probabilities',()=>{
 const b=battle(['Spore','Wake-Up Slap','Tackle']);
 const state=createCompleteBattle({player:referenceMon('Mew',['Spore','Wake-Up Slap','Tackle'],{level:30}),opponent:referenceMon('Mew',['Tackle','Splash'],{level:30}),field:{}}),cache=new Map();
 nativeContinuationPolicy(state,cache,{deadline:0});
 const entry=[...cache.values()][0];
 assert.deepEqual([...entry.scanOrder].sort((a,b)=>a-b),[0,1,2,3,4,5]);
 assert.deepEqual([...entry.evalOrder].sort((a,b)=>a-b),[0,1,2,3,4,5]);
 assert.equal(entry.actions[0].length,3);assert.equal(entry.actions[1].length,2);
 const policy=nativeContinuationPolicy(state,new Map(),{npcWeights:[{slot:1,probability:0.3},{slot:2,probability:0.7}]});
 assert.deepEqual(policy.probabilities[1],[0.3,0.7]);
 assert.equal(nativeMoveChoices(b.p1.active[0]).length,3);
});
