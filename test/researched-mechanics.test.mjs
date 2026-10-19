import test from 'node:test';
import assert from 'node:assert/strict';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle,installChanceTape,nativeMoveChoices,packed} from '../analysis/native-battle.mjs';
import {nativePositionFeatures} from '../analysis/position-features.mjs';
import {prepareNativePosition} from '../analysis/native-search.mjs';
import {createRequire} from 'node:module';
import {strategyFixtures} from '../scripts/strategy-benchmark-fixtures.mjs';
import {realBattleFixtures} from '../scripts/real-battle-fixtures.mjs';
const {Battle}=createRequire(import.meta.url)('../vendor/showdown/dist/sim/battle.js');
// Cases adapted to singles/Gen 8 from upstream mechanics regressions. Sources
// and Run & Bun scope are documented in analysis/RESEARCHED-CASES.md.
function game(player,opponent){
 const state=createCompleteBattle({player,opponent,field:{}}),battle=restoreCompleteBattle(state);
 installChanceTape(battle,[],state.unknownNature,state,()=>0.99);return {state,battle};
}
const act=(b,a=1,c=1)=>{assert.equal(b.choose('p1',`move ${a}`),true);assert.equal(b.choose('p2',`move ${c}`),true);};

test('Multiscale applies only while full HP and Mold Breaker bypasses it',()=>{
 const damage=(ability,hp)=>{const p=mon('Mew',['Tackle'],{ability}),q=mon('Dragonite',['Splash'],{ability:'Multiscale'});if(hp)q.current_hp--;const {battle:b}=game(p,q);act(b);return q.current_hp-b.p2.active[0].hp;};
 const full=damage('',false),chipped=damage('',true),bypassed=damage('Mold Breaker',false);
 assert.ok(full>0);assert.ok(Math.abs(chipped-2*full)<=1);assert.equal(bypassed,chipped);
});

test('A multi-hit attack continues into real HP after breaking Substitute',()=>{
 const p=mon('Mew',['Double Hit'],{ability:'No Guard'}),q=mon('Mew',['Splash'],{effects:{substitute_hp:1}});
 const {battle:b}=game(p,q);act(b);assert.equal(b.p2.active[0].volatiles.substitute,undefined);assert.ok(b.p2.active[0].hp<q.current_hp);
});

test('Disguise only blocks the first hit and an already busted live Disguise is not regenerated',()=>{
 const damage=(busted,move)=>{const p=mon('Mew',[move],{ability:'No Guard'}),q=mon('Mimikyu',['Splash'],{ability:'Disguise',effects:{disguise_busted:busted}});const {battle:b}=game(p,q);act(b);return {b,damage:q.current_hp-b.p2.active[0].hp,max:q.actual_stats.hp};};
 const intact=damage(false,'Shadow Ball'),busted=damage(true,'Shadow Ball');
 assert.equal(intact.damage,Math.floor(intact.max/8));assert.ok(busted.damage>intact.damage);assert.ok(damage(false,'Twineedle').damage>intact.damage);
});

test('Encore plus Disable exposes Struggle, consumes no disabled PP and expires back to legal moves',()=>{
 for(const last_move of ['Tackle','Splash',undefined]){
 const p=mon('Mew',['Tackle','Splash'],{effects:{last_move,encore_move:'Tackle',encore_turns:2,disabled_moves:['Tackle'],disable_turns:2}});
 const {battle:b}=game(p,mon('Mew',['Splash']));assert.deepEqual(nativeMoveChoices(b.p1.active[0]).map(m=>m.id),['struggle']);
 const pp=b.p1.active[0].moveSlots[0].pp;act(b);assert.equal(b.p1.active[0].moveSlots[0].pp,pp);assert.ok(b.log.some(l=>l.includes('|Struggle|')));
 act(b);assert.ok(nativeMoveChoices(b.p1.active[0]).some(m=>m.id==='tackle'));
 }
});

test('Magic Guard prevents Life Orb, contact and recoil damage without removing dealt damage',()=>{
 const p=mon('Clefable',['Double-Edge'],{ability:'Magic Guard',item:'Life Orb'}),q=mon('Mew',['Splash'],{ability:'Rough Skin'});
 const {battle:b}=game(p,q);act(b);assert.equal(b.p1.active[0].hp,p.current_hp);assert.ok(b.p2.active[0].hp<q.current_hp);
});

test('Liquid Ooze reverses drain healing even when the draining move deals damage',()=>{
 const p=mon('Mew',['Giga Drain'],{hp:100}),q=mon('Tentacruel',['Splash'],{ability:'Liquid Ooze'});
 const {battle:b}=game(p,q);act(b);assert.ok(b.p1.active[0].hp<100);assert.ok(b.p2.active[0].hp<q.current_hp);
});

test('Restored branches own sets, logs, RNG, requests and nested mechanics independently',()=>{
 const {state}=game(mon('Mew',['Recover','Tackle'],{hp:100,item:'Sitrus Berry'}),mon('Blissey',['Splash'],{status:'tox',effects:{toxic_counter:2}}));
 const before=JSON.stringify(state),a=restoreCompleteBattle(state),b=restoreCompleteBattle(state);
 a.p1.active[0].set.moves[0]='Splash';a.p1.active[0].set.ivs.atk=0;a.log.push('branch-only');a.p2.active[0].statusState.stage=14;
 a.p1.activeRequest.active[0].moves[0].pp=0;a.prng.random();
 assert.equal(JSON.stringify(state),before);assert.equal(b.p1.active[0].set.moves[0],'Recover');assert.notEqual(b.p1.active[0].set.ivs.atk,0);assert.ok(!b.log.includes('branch-only'));assert.equal(b.p2.active[0].statusState.stage,2);
 const restored=packed(b);assert.equal(restored.saved.sides[0].pokemon[0].hp,100);
});

test('Native preparation reuses unchanged immutable roots and invalidates every changed snapshot',()=>{
 const snapshot={player:mon('Mew',['Tackle']),opponent:mon('Mew',['Splash']),field:{}},options={session:{}};
 const a=prepareNativePosition(snapshot,options),b=prepareNativePosition(structuredClone(snapshot),options);assert.equal(a.initial,b.initial);
 snapshot.player.current_hp--;assert.notEqual(prepareNativePosition(snapshot,options).initial,a.initial);
});

test('A deterministic passive fixed point ends early, while poison clocks still reach their KO',()=>{
 const plain={player:mon('Mew',['Splash']),opponent:mon('Mew',['Splash']),field:{}};
 const before=JSON.stringify(plain),f=nativePositionFeatures(createCompleteBattle(plain));assert.ok(f.passive.steps<=2);assert.deepEqual(f.passive.clock,[Infinity,Infinity]);assert.equal(JSON.stringify(plain),before);
 plain.opponent.build.status='tox';plain.opponent.effects.toxic_counter=0;
 const toxic=nativePositionFeatures(createCompleteBattle(plain));assert.ok(toxic.passive.steps>2);assert.ok(Number.isFinite(toxic.passive.clock[1]));
});

test('Selective restoration matches the former fully cloned deserializer across strategic and reconstructed battles',()=>{
 for(const fixture of [...strategyFixtures,...realBattleFixtures]){
  const state=createCompleteBattle(fixture.snapshot),before=JSON.stringify(state),fast=restoreCompleteBattle(state),original=Battle.fromJSON(structuredClone(state.saved));
  for(const b of [fast,original]){
   installChanceTape(b,[],state.unknownNature,state,()=>0.5);
   const slots=b.sides.map(s=>nativeMoveChoices(s.active[0])[0]?.slot||1);act(b,...slots);
  }
  assert.equal(packed(fast,state.unknownNature).key,packed(original,state.unknownNature).key,fixture.id);assert.equal(JSON.stringify(state),before,fixture.id);
 }
});

test('Stochastic passive effects retain the full probe horizon instead of declaring a false fixed point',()=>{
 const snapshot={player:mon('Mew',['Splash'],{ability:'Shed Skin',status:'par'}),opponent:mon('Mew',['Splash']),field:{}};
 const f=nativePositionFeatures(createCompleteBattle(snapshot));assert.equal(f.passive.steps,32);
});
