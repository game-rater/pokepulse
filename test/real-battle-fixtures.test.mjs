import test from 'node:test';
import assert from 'node:assert/strict';
import {realBattleFixtures} from '../scripts/real-battle-fixtures.mjs';
import {createCompleteBattle,restoreCompleteBattle} from '../analysis/complete-moves.mjs';

for(const fixture of realBattleFixtures)test(`${fixture.id}: native hydration preserves exact HP and all move choices`,()=>{
 assert.equal(fixture.provenance.kind,'synthetic-reconstruction');assert.ok(fixture.provenance.report.startsWith('https://'));
 assert.equal(fixture.expected,undefined);
 const state=createCompleteBattle(fixture.snapshot),game=restoreCompleteBattle(state);
 for(const [i,side] of [fixture.snapshot.player,fixture.snapshot.opponent].entries()){
  const p=game.sides[i].active[0];assert.equal(p.hp,side.current_hp);assert.equal(p.maxhp,side.actual_stats.hp);
  assert.equal(p.status,side.build.status);assert.deepEqual(p.moveSlots.map(m=>m.move),side.build.moves);
  assert.deepEqual(p.moveSlots.map(m=>m.pp),side.build.moves.map(move=>side.pp[move]));
  const {hp,...stats}=side.actual_stats;assert.deepEqual(p.storedStats,stats);
  assert.equal(p.ability,side.build.ability.toLowerCase().replace(/[^a-z0-9]/g,''));
  if(side.effects.sleep_counter!==undefined)assert.equal(p.statusState.time,side.effects.sleep_counter);
  if(side.effects.protect_streak)assert.equal(p.volatiles.stall.counter,3**side.effects.protect_streak);
  assert.deepEqual(p.boosts,side.build.boosts);
  assert.equal(p.item,side.build.item.toLowerCase().replace(/[^a-z0-9]/g,''));
 }
});
