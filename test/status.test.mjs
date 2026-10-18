import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import calculator from '../vendor/run-bun/index.js';
import {pack,catalog,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';
import {actionOpportunity} from '../run-bun/actions.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {makeRules} from '../engine.mjs';
const gen=calculator.Generations.get(8),species=pack.species.find(s=>s.id==='garchomp');
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
const build=()=>({...defaultBuild(species),moves:['Tackle'],ability:'',level:5});
const score=(a,b,effects={player:{},opponent:{}},battle={player_hp:100,opponent_hp:100})=>{
 const session={};let result;
 for(let pass=0;pass<12;pass++){
  result=scoreBattle(species,species,rules,battle,{player:a,opponent:b},defaultField(),effects,{},
   {progressive:true,session,timeMs:3000});
  if(result.outlook.complete)return result;
 }
 throw Error(`Status forecast did not resolve: ${result.outlook.lower_bound}–${result.outlook.upper_bound}%.`);
};
const action=(b,name,effects={})=>actionOpportunity({effects},new calculator.Pokemon(gen,'Garchomp',b),new calculator.Move(gen,name));
const assertEven=result=>{
 assert.ok(result.outlook.lower_bound<=50&&result.outlook.upper_bound>=50);
 assert.ok(result.outlook.upper_bound-result.outlook.lower_bound<=1);
 assert.equal(Math.round(result.victory),50);
};
test('Sleep changes the probability-weighted outlook over the next turns',()=>{
 const a=build(),b=build(),normal=score(a,b);assertEven(normal);
 a.status='slp';const sleeping=score(a,b,{player:{sleep_counter:3},opponent:{}});assert.ok(sleeping.victory<normal.victory);assert.equal(sleeping.outgoing_moves[0].possible_ko_on_hit,false);assert.match(sleeping.outgoing_moves[0].note,/Asleep/);
 a.status='';b.status='slp';assert.ok(score(a,b,{player:{},opponent:{sleep_counter:3}}).victory>normal.victory);
 a.status='slp';const mirrored=score(a,b,{player:{sleep_counter:3},opponent:{sleep_counter:3}});
 assertEven(mirrored);
 a.status='';b.status='';assertEven(score(a,b));
});
test('Sleep counter and Early Bird allow wake-up before the next action',()=>{
 const a={...build(),status:'slp'},b=build();assert.ok(Math.abs(score(a,b,{player:{sleep_counter:1},opponent:{}}).victory-50)<1);
 a.ability='Early Bird';assert.equal(action(a,'Tackle',{sleep_counter:2}).chance,1);assert.equal(action(a,'Tackle',{sleep_counter:3}).chance,0);
 assert.equal(action(a,'Tackle').chance,0);
});
test('A successful hit remains visible after the opponent wakes',()=>{
 const a=build(),b={...build(),status:'slp'};
 const before=score(a,b,{player:{},opponent:{sleep_counter:1}}).victory;
 b.status='';const after=score(a,b,{player:{},opponent:{}},{player_hp:100,opponent_hp:80}).victory;
 assert.ok(after>before,`expected a successful hit and wake-up to improve outlook (${before} → ${after})`);
});
test('Freeze weights action opportunity symmetrically while preserving conditional damage',()=>{
 const a=build(),b=build(),normal=score(a,b);a.status='frz';const frozen=score(a,b);
 assert.ok(frozen.victory<normal.victory);assert.equal(frozen.outgoing_moves[0].action_chance,0.2);assert.equal(frozen.outgoing_moves[0].max,normal.outgoing_moves[0].max);
 a.status='';b.status='frz';assert.ok(score(a,b).victory>normal.victory);
 a.status='frz';const mirror=score(a,b);
 assert.ok(mirror.outlook.lower_bound<=50+1e-8&&mirror.outlook.upper_bound>=50-1e-8);
 assert.ok(mirror.outlook.upper_bound-mirror.outlook.lower_bound<=1+1e-8);
});
test('Snore requires sleep; self-thawing moves bypass freeze prevention',()=>{
 const a=build();assert.equal(action(a,'Snore').chance,0);a.status='slp';assert.equal(action(a,'Snore',{sleep_counter:3}).chance,1);assert.equal(action(a,'Snore',{sleep_counter:1}).chance,0);
 a.status='';a.ability='Comatose';assert.equal(action(a,'Snore').chance,1);
 a.status='frz';a.ability='';assert.equal(action(a,'Flame Wheel').chance,1);assert.equal(action(a,'Scald').chance,1);assert.equal(action(a,'Burn Up').chance,0.2);
});
test('Full paralysis reduces action opportunity in addition to calculator speed changes',()=>{
 const a=build(),b=build(),normal=score(a,b);a.status='par';const paralyzed=score(a,b);
 assert.equal(paralyzed.outgoing_moves[0].action_chance,0.75);assert.ok(paralyzed.victory<normal.victory);assert.ok(paralyzed.outgoing_moves[0].speed<normal.outgoing_moves[0].speed);
});
test('Confusion chance compounds with paralysis and waking does not clear confusion',()=>{
 const a=build(),b=build(),effects={player:{confusion_turns:3},opponent:{}};
 assert.equal(score(a,b,effects).outgoing_moves[0].action_chance,2/3);
 a.status='par';assert.equal(score(a,b,effects).outgoing_moves[0].action_chance,0.5);
 a.status='slp';effects.player.sleep_counter=1;assert.equal(score(a,b,effects).outgoing_moves[0].action_chance,2/3);
});
test('Sleep counters are preserved and malformed counters are rejected',()=>{
 const s={schema_version:1,game:'run-bun',player:{species:'garchomp',hp_percent:100,build:{...build(),status:'slp'},effects:{sleep_counter:2}},opponent:{species:'garchomp',hp_percent:100,build:build(),effects:{}},field:defaultField()};
 assert.equal(normalizeSnapshot(s,pack,catalog()).effects.player.sleep_counter,2);
 for(const value of [0,8,1.5,'2']){s.player.effects.sleep_counter=value;assert.throws(()=>normalizeSnapshot(s,pack,catalog()),/sleep counter/);}
 s.player.effects.sleep_counter=2;s.player.build.status='';assert.throws(()=>normalizeSnapshot(s,pack,catalog()),/sleep counter/);
});
