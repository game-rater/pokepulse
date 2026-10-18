import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pack,catalog,defaultBuild,defaultField,scoreBattle} from '../run-bun/profile.mjs';
import {normalizeSnapshot} from '../run-bun/input.mjs';
import {makeRules} from '../engine.mjs';
import {readFileSync} from 'node:fs';
const rules=makeRules(JSON.parse(readFileSync(new URL('../data/type-chart.json',import.meta.url))),'gen8');
function sample(){const player=pack.species.find(s=>s.id==='garchomp'),opponent=pack.species.find(s=>s.id==='weavile');return {schema_version:1,game:'run-bun',player:{species:player.id,hp_percent:100,build:defaultBuild(player),effects:{}},opponent:{species:opponent.id,hp_percent:100,build:defaultBuild(opponent),effects:{}},field:defaultField()};}
function analyze(s){const n=normalizeSnapshot(s,pack,catalog());return scoreBattle(pack.species.find(p=>p.id===n.player),pack.species.find(p=>p.id===n.opponent),rules,n.battle,n.builds,n.field,n.effects);}
test('Run & Bun complete snapshot gives finite damage and reacts to HP',()=>{const s=sample();const first=analyze(s);assert.ok(Number.isFinite(first.victory));assert.ok(first.outgoing_moves.every(m=>Number.isFinite(m.max_percent)));s.opponent.hp_percent=0;assert.equal(analyze(s).victory,100);s.player.hp_percent=0;s.opponent.hp_percent=100;assert.equal(analyze(s).victory,0);});
test('Disable and Encore restrict available damaging moves; Taunt blocks status moves',()=>{const s=sample();s.player.build.moves=['Earthquake','Swords Dance'];s.player.effects={taunted:true,disabled_moves:['Earthquake']};let r=analyze(s);assert.equal(r.outgoing_moves[0].available,false);assert.equal(r.outgoing_moves[1].reason,'Blocked by Taunt');s.player.effects={encore_move:'Swords Dance'};r=analyze(s);assert.equal(r.outgoing_moves[0].reason,'Blocked by Encore');});
test('Snapshot validation rejects malformed effects and stats without mutating input',()=>{const s=sample();s.player.effects.taunted='yes';assert.throws(()=>analyze(s),/Taunted/);s.player.effects={};s.player.build.ivs.hp=99;assert.throws(()=>analyze(s),/ivs/);assert.equal(s.player.build.ivs.hp,99);});
