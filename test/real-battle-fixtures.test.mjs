import test from 'node:test';
import assert from 'node:assert/strict';
import {realBattleFixtures} from '../scripts/real-battle-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/complete-moves.mjs';

test('Four public battle-inspired families provide three distinct reconstructed states each',()=>{
 assert.equal(realBattleFixtures.length,12);assert.equal(new Set(realBattleFixtures.map(f=>f.id)).size,12);
 assert.equal(new Set(realBattleFixtures.map(f=>f.family)).size,4);
 for(const family of new Set(realBattleFixtures.map(f=>f.family))){
  const cases=realBattleFixtures.filter(f=>f.family===family);
  assert.equal(cases.length,3);assert.equal(new Set(cases.map(f=>JSON.stringify(f.snapshot))).size,3);
 }
});
for(const fixture of realBattleFixtures)test(`${fixture.id}: native hydration preserves exact HP and all move choices`,()=>{
 assert.equal(fixture.provenance.kind,'synthetic-reconstruction');assert.ok(fixture.provenance.report.startsWith('https://'));
 assert.equal(fixture.expected,undefined);
 const state=createCompleteBattle(fixture.snapshot),game=restoreCompleteBattle(state);
 for(const [i,side] of [fixture.snapshot.player,fixture.snapshot.opponent].entries()){
  const p=game.sides[i].active[0];assert.equal(p.hp,side.current_hp);assert.equal(p.maxhp,side.actual_stats.hp);
  assert.equal(p.status,side.build.status);assert.equal(p.moveSlots.length,4);
  assert.deepEqual(p.boosts,side.build.boosts);
  assert.equal(p.item,side.build.item.toLowerCase().replace(/[^a-z0-9]/g,''));
  assert.ok(p.moveSlots.every(m=>Number.isInteger(m.pp)&&m.pp>0));
 }
});
test('The documented Drednaw build and consumed-item phases remain explicit',()=>{
 const initial=realBattleFixtures.find(f=>f.id==='drednaw-lunatone-initial').snapshot;
 assert.deepEqual(initial.player.build.ivs,{hp:20,atk:17,def:16,spa:9,spd:26,spe:17});
 assert.equal(initial.player.build.item,'Chesto Berry');assert.equal(initial.opponent.build.item,'Weakness Policy');
 const asleep=realBattleFixtures.find(f=>f.id==='drednaw-lunatone-asleep').snapshot;
 assert.equal(asleep.player.build.item,'');assert.equal(asleep.opponent.build.item,'');
 assert.equal(asleep.player.effects.sleep_counter,2);assert.equal(asleep.opponent.build.boosts.spa,2);
});
test('Successive scenario variants preserve Rest, Guts and previous protection state',()=>{
 const resting=realBattleFixtures.find(f=>f.id==='monferno-scraggy-resting').snapshot;
 assert.equal(resting.opponent.build.status,'slp');assert.equal(resting.opponent.effects.sleep_counter,2);
 const para=realBattleFixtures.find(f=>f.id==='hariyama-porygon2-paralyzed').snapshot;
 assert.equal(para.player.build.status,'par');assert.equal(para.player.build.ability,'Guts');
 assert.equal(para.opponent.build.boosts.spa,1);
 const protect=realBattleFixtures.find(f=>f.id==='togedemaru-cinccino-protected').snapshot;
 assert.equal(protect.player.effects.protect_streak,1);assert.equal(protect.player.effects.last_move,'Spiky Shield');
 assert.equal(protect.player.effects.first_turn,false);
});
