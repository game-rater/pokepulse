import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:3001';
const get=async()=>await(await fetch(`${base}/api/state`)).json();
const initial=await get();
const snapshot={schema_version:1,game:'run-bun',player:{species:initial.player,hp_percent:initial.battle.player_hp,build:initial.builds.player,effects:initial.effects.player},opponent:{species:initial.opponent,hp_percent:initial.battle.opponent_hp,build:initial.builds.opponent,effects:initial.effects.opponent},field:initial.field};
const post=async(path,body)=>fetch(`${base}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
try{
  const changed=structuredClone(snapshot);changed.player.build.moves=['Earthquake','Swords Dance'];changed.player.effects={taunted:true,disabled_moves:['Earthquake']};
  const response=await post('/api/snapshot',changed);assert.equal(response.status,200);const result=await response.json();assert.equal(result.result.outgoing_moves[1].reason,'Blocked by Taunt');
  assert.equal((await post('/api/state',{battle:{player_hp:50}})).status,409);assert.equal((await get()).effects.player.taunted,true);
  changed.player.hp_percent=50;assert.equal((await post('/api/snapshot',changed)).status,200);
  changed.player.hp_percent=999;assert.equal((await post('/api/snapshot',changed)).status,400);assert.equal((await get()).battle.player_hp,50);
  assert.equal((await post('/api/state',{builds:{player:{level:999}}})).status,409);
  assert.equal((await fetch(`${base}/?overlay=1`)).status,200);
  console.log('Run & Bun snapshot, effects persistence, atomic validation, and overlay smoke checks passed.');
}finally{assert.equal((await post('/api/snapshot',snapshot)).status,200);}
