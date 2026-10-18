import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messageLayout as l,readMessageObservations,decodeMessage,MessageObserver} from '../run-bun/battle-messages.mjs';
import {integrationScript} from '../run-bun/integration.mjs';
import {BattleRecorder} from '../run-bun/battle-recorder.mjs';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {historyDocument} from '../run-bun/history-view.mjs';
import {outcomeEvidence,explainKnockout} from '../run-bun/loss-explanation.mjs';
const maps=JSON.parse(readFileSync(new URL('../run-bun/reference/mappings.json',import.meta.url),'utf8'));
const native=JSON.parse(readFileSync(new URL('./fixtures/run-bun-native-messages.json',import.meta.url),'utf8'));
const raw=()=>structuredClone(native.cases[0].events.find(e=>e.code===217));
function ramMessage(row,resources=0x18000){
 const ram=Buffer.alloc(0x48000);ram[0x426f9]=2;ram[0x233e4]=2;ram[0x233ee]=row.player_index;ram[0x233ef]=1-row.player_index;
 ram.writeUInt32LE(0x02000000+resources,l.resourcesPointer);ram.writeUInt32LE(1<<row.attacker,l.controllerFlags);
 const base=resources+l.buffers+row.attacker*l.stride;ram[base]=16;ram.writeUInt16LE(row.code,base+2);ram.writeUInt16LE(row.move,base+4);
 ram[l.attacker]=row.attacker;ram[l.target]=row.target;ram[0x45d23]=row.turn;
 row.hp.forEach((n,i)=>ram.writeUInt16LE(n,0x233fc+92*i+42));row.species.forEach((n,i)=>ram.writeUInt16LE(n,0x233fc+92*i));return ram;
}
test('Native replay facts decode a critical hit, a missed Hypnosis, full paralysis and a lethal critical',()=>{
 for(const [name,code,kind] of [['critical',217,'critical-hit'],['miss',23,'miss'],['paralysis',57,'paralyzed'],['lethal-critical',217,'critical-hit']]){
  const e=native.cases.find(c=>c.case===name).events.find(e=>e.code===code),decoded=decodeMessage(e,maps);
  assert.equal(decoded.kind,kind);assert.equal(decoded.evidence,'native-game-message');
  assert.equal(decoded.actor,name==='miss'||name==='paralysis'?'player':'opponent');
  if(name==='miss')assert.equal(decoded.move,'Hypnosis');if(name==='lethal-critical')assert.equal(decoded.player_hp,0);
 }
});
test('Controller buffers follow the native heap pointer, acknowledge flags and player-side positions',()=>{
 for(const pointer of [0x3fc,0x18000]){
  const ram=ramMessage(raw(),pointer),rows=readMessageObservations(ram);assert.equal(rows.length,1);assert.equal(decodeMessage(rows[0],maps).kind,'critical-hit');
  ram.writeUInt32LE(0,l.controllerFlags);assert.deepEqual(readMessageObservations(ram),[]);
 }
 const flipped=raw();flipped.player_index=1;assert.equal(decodeMessage(readMessageObservations(ramMessage(flipped))[0],maps).actor,'player');
});
test('Outside-battle, invalid pointers, unknown IDs and stale command buffers cannot invent outcomes',()=>{
 const ram=ramMessage(raw());ram[0x426f9]=0;assert.deepEqual(readMessageObservations(ram),[]);ram[0x426f9]=2;
 ram.writeUInt32LE(0x01000000,l.resourcesPointer);assert.deepEqual(readMessageObservations(ram),[]);
 for(const change of [e=>e.code=9000,e=>e.attacker=5,e=>e.hp[0]=-1,e=>e.species[0]=99999,e=>e.move=65535,e=>e.turn=300]){
  const e=raw();change(e);assert.equal(decodeMessage(e,maps),null);
 }
});
test('Legacy RAM sampling deduplicates a displayed message and re-arms after acknowledgement',()=>{
 const observer=new MessageObserver(),rows=readMessageObservations(ramMessage(raw()));
 assert.equal(observer.observe(rows,maps).length,1);assert.equal(observer.observe(rows,maps).length,0);
 observer.observe([],maps);assert.equal(observer.observe(rows,maps).length,1);
});
test('Buffered frames survive fast-forward, deduplicate IDs, preserve repeated hits and expose gaps',()=>{
 const observer=new MessageObserver(),events=native.cases[0].events.map(e=>structuredClone(e));
 const first=observer.observe([],maps,{session:'test',events});assert.equal(first.filter(e=>e.kind==='critical-hit').length,1);
 assert.deepEqual(observer.observe([],maps,{session:'test',events}),[]);
 const repeated={...raw(),id:events.at(-1).id+1};assert.equal(observer.observe([],maps,{session:'test',events:[repeated]})[0].kind,'critical-hit');
 const overflow=observer.observe([],maps,{session:'test',events:[{...raw(),id:200}]});assert.equal(overflow[0].kind,'capture-gap');
 assert.equal(observer.observe([],maps,{session:'reloaded',events:[{...raw(),id:1}]})[0].kind,'critical-hit');
 assert.throws(()=>observer.observe([],maps,{session:'',events:[]}),/Invalid/);
});
test('A native lethal critical explains the knockout without claiming an alternative would have won',()=>{
 const r=new BattleRecorder({directory:'unused'}),before={player:mon('Wooper',['Earthquake'],{level:20,hp:35}),opponent:mon('Rattata',['Hyper Fang'],{level:20,hp:48}),field:{},battle_phase:{kind:'selection',turn:0}};
 r.recordState(before);r.recordResult({display_score:90});
 const events=native.cases.find(c=>c.case==='lethal-critical').events.map(e=>decodeMessage(e,maps));r.recordMessages(events);
 const after=structuredClone(before);after.player.current_hp=0;after.battle_phase.kind='resolving';r.recordState(after);
 const row=r.history().entries[0];assert.match(row.knockout.cause,/Hyper Fang critically hit/);assert.equal(row.review,null);
 assert.match(row.knockout.evidence,/does not prove/);assert.equal(row.battle_events.find(e=>e.kind==='critical-hit').unfavorable,true);
 const html=historyDocument(r.history());assert.match(html,/Luck and battle effects/);assert.match(html,/critical hit/);
});
test('Missing outcome capture produces an explicit unknown cause, never an invented critical hit',()=>{
 const r=new BattleRecorder({directory:'unused'}),before={player:mon('Wooper',['Earthquake'],{level:20,hp:35}),opponent:mon('Rattata',['Hyper Fang'],{level:20}),field:{},battle_phase:{kind:'selection',turn:0}};
 r.recordState(before);const after=structuredClone(before);after.player.current_hp=0;after.battle_phase.kind='resolving';r.recordState(after);
 const row=r.history().entries[0];assert.match(row.knockout.cause,/not captured/);assert.ok(!row.knockout.cause.includes('critical'));
});
test('The generated integration journals every frame while preserving the existing RAM capture cadence',()=>{
 const script=integrationScript('C:/test');assert.match(script,/pcall\(observeMessages\)/);assert.match(script,/frames % 15 == 0/);
 assert.match(script,/#events > 128/);assert.match(script,/resources \+ 0x24 \+ controller\*0x200/);
 assert.ok(script.indexOf('journal:close()')<script.indexOf("file:write('PTHREAT1'"));
 assert.ok(!/emu:write/.test(script));
});

test('Native ordinary-attack and poison knockouts retain the exact observed final damage source',()=>{
 for(const [kind,expected] of [['lethal-attack',/Hyper Fang knocked out/],['poison',/fainted from poison damage/]]){
  const replay=native.cases.find(c=>c.case===kind),events=outcomeEvidence(replay.events.map(e=>decodeMessage(e,maps)));
  const result=explainKnockout({player:{species:'Wooper',current_hp:32}},{player:{current_hp:0}},events,{complete:true,consecutive:true});
  assert.match(result.cause,expected);
  const html=historyDocument({entries:[{battle_events:events,notes:[],changes:[],player_moves:[],opponent_moves:[]}]});
  assert.ok(!html.includes('A battle event was recorded.'));
 }
});

test('Unknown messages, journal gaps, different actions or missing phases prevent stale damage attribution',()=>{
 const replay=native.cases.find(c=>c.case==='lethal-attack').events.slice(0,2).map(e=>decodeMessage(e,maps));
 for(const mutate of [e=>e.splice(1,0,{kind:'other-message'}),e=>e.splice(1,0,{kind:'capture-gap'}),e=>e[1].action_index++,e=>e[1].phase=null,e=>e[1].turn++]){
  const events=structuredClone(replay);mutate(events);
  const result=explainKnockout({player:{species:'Wooper',current_hp:20}},{player:{current_hp:0}},outcomeEvidence(events),{complete:true,consecutive:true});
  assert.match(result.cause,/not captured/);
 }
});

test('Critical messages arriving after the terminal HP capture still explain the same knockout',()=>{
 const r=new BattleRecorder({directory:'unused'}),before={player:mon('Wooper',['Earthquake'],{level:20,hp:35}),opponent:mon('Rattata',['Hyper Fang'],{level:20,hp:48}),field:{},battle_phase:{kind:'selection',turn:0}};
 r.recordState(before);const after=structuredClone(before);after.player.current_hp=0;after.battle_phase.kind='resolving';r.recordState(after);
 r.recordMessages(native.cases.find(c=>c.case==='lethal-critical').events.map(e=>decodeMessage(e,maps)));
 assert.match(r.history().entries[0].knockout.cause,/critically hit/);
});

test('Favorable rolls are recorded without being labeled unfavorable to the player',()=>{
 const ownCrit=decodeMessage({...raw(),player_index:1},maps),opponentMiss=decodeMessage({...raw(),code:23},maps);
 const events=outcomeEvidence([ownCrit,opponentMiss]);assert.ok(events.every(e=>!e.unfavorable));
});

test('A confusion message before the HP update can explain its contiguous lethal self-hit',()=>{
 const events=native.cases.find(c=>c.case==='lethal-attack').events.slice(0,2).map(e=>decodeMessage(e,maps));
 Object.assign(events[0],{kind:'confusion-self-hit',actor:'player',actor_species:'Wooper'});
 const result=explainKnockout({player:{species:'Wooper',current_hp:20}},{player:{current_hp:0}},outcomeEvidence(events),{complete:true,consecutive:true});
 assert.match(result.cause,/hurting itself in confusion/);
});
