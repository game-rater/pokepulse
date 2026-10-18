import test from 'node:test';
import assert from 'node:assert/strict';
import {solveDamageRace} from '../scripts/reference-damage-race.mjs';
const focus={outcomes:[{damage:0,probability:0.2},{damage:180,probability:0.75},{damage:270,probability:0.05}]};
const toss={outcomes:[{damage:100,probability:1}]};
test('Independent two-turn race finds the adaptive 81 percent strategy',()=>{
 const r=solveDamageRace({playerHP:101,opponentHP:250,retaliation:100,moves:[focus,toss]});
 assert.ok(Math.abs(r.expected_percent-81)<1e-10);
 assert.ok(Math.abs(r.root_action_values[0]-81)<1e-10);assert.ok(Math.abs(r.root_action_values[1]-80)<1e-10);
 assert.ok(r.states<10);
});
test('Two certain hits beat two risky knockout attempts',()=>{
 const r=solveDamageRace({playerHP:101,opponentHP:150,retaliation:100,moves:[focus,toss]});
 assert.equal(r.expected_percent,100);assert.ok(Math.abs(r.root_action_values[0]-96)<1e-10);assert.equal(r.root_action_values[1],100);
});
test('Equal knockout successors are merged without losing probability mass',()=>{
 const r=solveDamageRace({playerHP:1,opponentHP:1,retaliation:100,moves:[focus]});
 assert.equal(r.expected_percent,80);assert.equal(r.branches,2);assert.equal(r.merged,1);
});
test('Invalid probabilities cannot masquerade as a proof',()=>{
 assert.throws(()=>solveDamageRace({playerHP:1,opponentHP:1,retaliation:100,moves:[{outcomes:[{damage:1,probability:0.5}]}]}),/Invalid probability/);
});
