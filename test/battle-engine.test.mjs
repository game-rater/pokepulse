import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeRules} from '../engine.mjs';
import {defaultBuild,defaultField,scoreBattle,validateBuild} from '../battle-engine.mjs';
const pack = JSON.parse(readFileSync(new URL('../data/pokedex.json',import.meta.url)));
const dex = Object.fromEntries(pack.species.map(p=>[p.id,p]));
const chart = JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url)));
const rules = makeRules(chart);
function setup(a='garchomp',b='weavile') {return {a:dex[a],b:dex[b],builds:{player:defaultBuild(dex[a],9),opponent:defaultBuild(dex[b],9)},field:defaultField(),battle:{player_hp:100,opponent_hp:100}};}
const score = s=>scoreBattle(s.a,s.b,rules,s.battle,s.builds,s.field);
test('Reference level-50 neutral Earthquake damage range and actual stats',()=> {
  const s = setup();s.builds.player.moves = ['Earthquake'];
  const result = score(s);
  assert.equal(result.model,'Smogon damage calculator');
  assert.deepEqual([result.outgoing_moves[0].min,result.outgoing_moves[0].max],[100,118]);
  assert.equal(result.stats.player.atk,150);assert.equal(result.stats.opponent.hp,145);
  assert.ok(result.victory > 0 && result.victory < 100);
});
test('Ground immunity from Levitate is applied by the calculator',()=> {
  const s = setup('garchomp','gengar');s.builds.player.moves = ['Earthquake'];
  const without = score(s);assert.ok(without.outgoing_moves[0].max > 0);
  s.builds.opponent.ability = 'Levitate';assert.equal(score(s).outgoing_moves[0].max,0);
});
test('Boosts, nature, EVs, burn, items, and Reflect change actual damage',()=> {
  const s = setup();s.builds.player.moves = ['Earthquake'];
  const base = score(s).outgoing_moves[0].max;
  s.builds.player.boosts.atk = 2;assert.ok(score(s).outgoing_moves[0].max > base);
  s.builds.player.boosts.atk = 0;s.builds.player.status = 'brn';assert.ok(score(s).outgoing_moves[0].max < base);
  s.builds.player.status = '';s.builds.player.item = 'Choice Band';assert.ok(score(s).outgoing_moves[0].max > base);
  s.builds.player.item = '';s.field.opponent.reflect = true;assert.ok(score(s).outgoing_moves[0].max < base);
  s.field.opponent.reflect = false;s.builds.player.nature = 'Adamant';s.builds.player.evs.atk = 252;assert.ok(score(s).outgoing_moves[0].max > base);
});
test('HP has reversed outlook direction and endpoints only identify resolved duels',()=> {
  const s = setup();const base = score(s).victory;
  s.battle.player_hp = 25;assert.ok(score(s).victory < base);
  s.battle = {player_hp:100,opponent_hp:25};assert.ok(score(s).victory > base);
  s.battle.opponent_hp = 0;assert.equal(score(s).victory,100);
  s.battle = {player_hp:0,opponent_hp:100};assert.equal(score(s).victory,0);
  s.battle.opponent_hp = 0;assert.equal(score(s).victory,50);
});
test('Custom mechanics never silently use incompatible standard damage formulas',()=> {
  const s = setup();const custom = {...rules,type_chart:structuredClone(chart)};custom.type_chart.Ice.Ground = 1;
  const result = scoreBattle(s.a,s.b,custom,s.battle,s.builds,s.field);
  assert.equal(result.model,'Type/stat heuristic');assert.ok(result.warnings[0].includes('custom type chart'));
});
test('Invalid builds fail and status-move limitations are visible',()=> {
  const s = setup();s.builds.player.evs.atk = 252;s.builds.player.evs.spe = 252;s.builds.player.evs.hp = 252;
  assert.throws(()=>validateBuild(s.builds.player,9),/510/);
  s.builds.player = defaultBuild(s.a,9);s.builds.player.moves = ['Swords Dance'];
  const result = score(s);assert.equal(result.outgoing_moves[0].max,0);assert.ok(result.warnings.some(w=>w.includes('status moves')));
});
