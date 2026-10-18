import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const base = 'http://127.0.0.1:3000';
async function update(input) {
  const response = await fetch(base + '/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  const data = await response.json();assert.equal(response.status,200,data.error);return data;
}
const abort = new AbortController();
const stream = await fetch(base + '/api/events',{signal:abort.signal});
const reader = stream.body.getReader();
let buffered = '';
const decoder = new TextDecoder();
async function event() {
  while (!buffered.includes('\n\n')) {
    const next = await reader.read();
    if (next.done) throw Error('Event stream closed.');
    buffered += decoder.decode(next.value,{stream:true});
  }
  const end = buffered.indexOf('\n\n');
  const message = buffered.slice(0,end);buffered = buffered.slice(end + 2);
  return JSON.parse(message.slice(6));
}
await event();
try {
  let data = await update({reset:true,preset:'modern',player:'garchomp',opponent:'weavile'});
  assert.equal(data.result.threat,3);
  assert.equal(data.result.model,'Smogon damage calculator');
  const message = await event();
  assert.equal(message.player,'garchomp');
  const initial = data.result.victory;
  data = await update({battle:{player_hp:25}});
  assert.equal(data.battle.opponent_hp,100);assert.ok(data.result.victory < initial);
  const hpEvent = await event();assert.equal(hpEvent.battle.player_hp,25);
  data = await update({opponent:'charizard'});assert.deepEqual(data.battle,{player_hp:100,opponent_hp:100});
  data = await update({builds:{player:{moves:['Earthquake']}}});assert.equal(data.result.outgoing_moves[0].max,0);
  const priorStats = data.result.stats.player.atk;
  data = await update({builds:{player:{evs:{atk:252},nature:'Adamant'}}});assert.ok(data.result.stats.player.atk > priorStats);
  const custom = JSON.parse(readFileSync('examples/custom-rules-pack.json','utf8'));
  data = await update({pack:custom,rules:{...custom.rules,id:'custom'},player:'ember',opponent:'tide'});
  assert.equal(data.pack.species.length,2);assert.equal(data.rules.generation,3);assert.equal(data.rules.physical_special_split,true);
  const before = await (await fetch(base + '/api/state')).json();
  const bad = await fetch(base + '/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pack:{species:[]}})});
  assert.equal(bad.status,400);
  assert.deepEqual(await (await fetch(base + '/api/state')).json(),before);
  const blocked = await fetch(base + '/api/state',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://example.com'},body:'{}'});
  assert.equal(blocked.status,403);
  console.log('Server checks passed: shared events, custom data/rules, atomic invalid imports, origin guard.');
} finally {
  abort.abort();
  await update({reset:true,preset:'modern',player:'garchomp',opponent:'weavile'});
}
