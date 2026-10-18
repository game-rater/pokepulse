import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRules,scoreMatchup,effectiveness,bestPressure,normalizePack,validateRules} from '../engine.mjs';
const chart = JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url)));
const pack = JSON.parse(readFileSync(new URL('../data/pokedex.json',import.meta.url)));
const dex = Object.fromEntries(pack.species.map(p => [p.id,p]));
const modern = makeRules(chart), classic = makeRules(chart,'classic');
test('Dual weaknesses, resistances, and immunities multiply',() => {
  assert.equal(effectiveness('Ice',dex.garchomp,modern),4);
  assert.equal(effectiveness('Electric',dex.garchomp,modern),0);
  assert.equal(effectiveness('Grass',dex.charizard,modern),0.25);
});
test('Mirror matchup is Even and directional scores reverse symmetrically',() => {
  assert.equal(scoreMatchup(dex.garchomp,dex.garchomp,modern).raw,50);
  const forward = scoreMatchup(dex.garchomp,dex.weavile,modern);
  const backward = scoreMatchup(dex.weavile,dex.garchomp,modern);
  assert.ok(forward.threat >= 3);assert.ok(backward.threat <= 1);
  assert.equal(forward.raw + backward.raw,100);
  assert.deepEqual(forward,scoreMatchup(dex.garchomp,dex.weavile,modern));
});
test('Classic category and historical Steel resistance are independent of species',() => {
  assert.equal(bestPressure(dex.gengar,dex.alakazam,classic).category,'physical');
  assert.equal(effectiveness('Ghost',dex.metagross,classic),1);
  assert.equal(effectiveness('Ghost',dex.metagross,modern),2);
  assert.throws(() => scoreMatchup(dex.clefable,dex.gengar,classic),/unavailable/);
});
test('Both STAB directions immune stays finite and neutral',() => {
  const normal = {...dex.snorlax,types:['Normal']};
  const ghost = {...normal,id:'ghost',types:['Ghost']};
  assert.equal(scoreMatchup(normal,ghost,modern).raw,50);
});
test('Invalid data packs and incomplete custom charts fail explicitly',() => {
  assert.throws(() => normalizePack({species:[dex.garchomp,dex.garchomp]},modern),/unique/);
  assert.throws(() => normalizePack({species:[{...dex.garchomp,base_stats:{}}]},modern),/base stat/);
  assert.throws(() => validateRules({...modern,type_chart:{}}),/chart entry/);
  assert.doesNotThrow(() => validateRules(classic));
});
test('All bundled species have finite bounded scores against the demo opponent',() => {
  const normalized = normalizePack(pack,modern);
  for (const p of normalized.species) {
    const score = scoreMatchup(p,dex.weavile,modern);
    assert.ok(Number.isInteger(score.raw) && score.raw >= 0 && score.raw <= 100,p.id);
    assert.ok(score.threat >= 0 && score.threat <= 4,p.id);
  }
});
test('Live HP shifts difficulty monotonically and preserves full-HP baseline',() => {
  const score = battle => scoreMatchup(dex.garchomp,dex.weavile,modern,battle).difficulty;
  const full = score({player_hp:100,opponent_hp:100});
  assert.ok(score({player_hp:50,opponent_hp:100}) > full);
  assert.ok(score({player_hp:100,opponent_hp:50}) < full);
  assert.equal(score({player_hp:50,opponent_hp:50}),full);
  assert.equal(score({player_hp:0,opponent_hp:100}),100);
  assert.equal(score({player_hp:100,opponent_hp:0}),0);
  assert.equal(score({player_hp:0,opponent_hp:0}),50);
  assert.throws(() => score({player_hp:-1,opponent_hp:100}),/Remaining HP/);
  const a = score({player_hp:100,opponent_hp:99});
  const b = score({player_hp:100,opponent_hp:98});
  assert.ok(a > b && a - b < 1);
});
