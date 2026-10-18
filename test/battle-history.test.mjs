import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {referenceMon as mon} from '../scripts/accuracy-benchmark-fixtures.mjs';
import {BattleHistory} from '../run-bun/battle-history.mjs';
import {BattleRecorder} from '../run-bun/battle-recorder.mjs';
import {historyDocument} from '../run-bun/history-view.mjs';
const snapshot=(turn=0,kind='selection')=>({player:mon('Mew',['Swords Dance','Tackle']),opponent:mon('Machamp',['Tackle']),field:{},battle_phase:{turn,kind}});
function recording({edit=()=>{},after=()=>{},skip=1}={}){
 const r=new BattleRecorder({directory:'unused',now:()=>1000}),before=snapshot();before.player.build.boosts.atk=6;edit(before);
 r.recordState(before);r.recordResult({display_score:80});
 const action=structuredClone(before);action.battle_phase.kind='actions';r.recordState(action);
 const next=structuredClone(before);next.battle_phase.turn=skip;next.player.pp['Swords Dance']--;
 next.player.effects.last_move='Swords Dance';next.player.current_hp-=40;after(next);r.recordState(next);r.recordResult({display_score:40});
 return r;
}
test('Consecutive decision review explains an inferred capped move with observed effects and available alternatives',()=>{
 const r=recording(),[current,turn]=r.history().entries;
 assert.equal(current.assessment,'in-progress');assert.equal(turn.assessment,'review-decision');
 assert.equal(turn.review.move,'Swords Dance');assert.match(turn.review.reasons[0],/limit/);assert.deepEqual(turn.review.alternatives,['Tackle']);
 assert.deepEqual([turn.before_score,turn.after_score],[80,40]);assert.ok(turn.changes.some(c=>c.kind==='hp'&&c.after===301));
 assert.match(turn.review.evidence,/inferred/);
});
test('A probability drop alone never becomes a player mistake',()=>{
 const r=recording({edit:s=>{s.player.build.boosts.atk=0;}}),row=r.history().entries[1];
 assert.equal(row.review,null);assert.match(row.notes.join(' '),/do not establish a worse choice/);
});
test('Poison waiting is not falsely blamed for a directly ineffective move',()=>{
 const r=recording({edit:s=>{s.opponent.build.status='tox';s.opponent.effects.toxic_counter=2;}}),row=r.history().entries[1];
 assert.equal(row.review,null);assert.match(row.notes.join(' '),/waiting could be useful/);
});
test('Missing prior-move corroboration and PP draining do not establish a mistake',()=>{
 for(const config of [{after:s=>{s.player.effects.last_move='Tackle';}},{after:s=>{s.player.pp['Swords Dance']-=3;}},
  {edit:s=>{s.opponent.build.moves.push('Spite');s.opponent.pp.Spite=10;}}]){
  const row=recording(config).history().entries[1];assert.equal(row.review,null);assert.ok(row.notes.length);
 }
});
test('Incomplete stats and unmodeled live effects cannot produce a decision verdict',()=>{
 for(const edit of [s=>{delete s.player.actual_stats;},s=>{s.player.effects.unknown_effects=['unknown timing effect'];}]){
  const row=recording({edit}).history().entries[1];assert.equal(row.review,null);assert.match(row.notes.join(' '),/could not be assessed/);
 }
});
test('Skipped turns, missing turn counters and switches do not receive action blame',()=>{
 for(const config of [{skip:2},{edit:s=>{delete s.battle_phase.turn;}},{after:s=>{s.opponent.species='Blissey';}}]){
  const row=recording(config).history().entries[1];assert.equal(row.review,null);assert.ok(['incomplete','matchup-changed'].includes(row.assessment));
 }
});
test('Repeated selection observations merge and the latest stable next selection is used',()=>{
 const r=recording(),next=structuredClone(r.previous);next.player.current_hp-=1;r.recordState(next);r.recordResult({display_score:35});
 const rows=r.history().entries;assert.equal(rows.length,2);assert.equal(rows[1].after_score,35);
 assert.equal(rows[1].changes.find(c=>c.kind==='hp').after,300);
});
test('Late refinements and other-state/model estimates cannot rewrite a past decision score',()=>{
 const r=recording();r.recordResult({display_score:99},1);
 assert.equal(r.history().entries[1].before_score,80);
 r.append('optimizer',{opponent_model:'npc-ai'});r.recordResult({display_score:90});
 assert.equal(r.history().entries[1].after_score,40);
 const next=structuredClone(r.previous);next.battle_phase.kind='actions';r.recordState(next);r.recordResult({display_score:98},3);
 assert.equal(r.history().entries[1].after_score,40,'late refinement after next action is excluded');
});
test('Pending/blocked predictions and unknown values are not displayed as historical estimates',()=>{
 const r=new BattleRecorder({directory:'unused'});r.recordState(snapshot());
 r.recordResult({display_score:99,pending:true});r.recordResult({display_score:99,outlook:{input_blocked:true}});
 assert.equal(r.history().entries[0].before_score,null);
});
test('Terminal and disconnected sequences preserve observations without bridging gaps',()=>{
 const r=recording(),dead=structuredClone(r.previous);dead.battle_phase.kind='end-turn';dead.player.current_hp=0;r.recordState(dead);
 assert.equal(r.history().entries[0].complete,true);
 const gap=recording();gap.append('tracking',{tracking:{status:'disconnected'}});gap.recordState(snapshot(0));
 assert.equal(gap.history().entries[0].battle,2);assert.equal(gap.history().entries[1].assessment,'in-progress');
 const terminal=recording(),selection=structuredClone(terminal.previous);selection.player.current_hp=0;selection.battle_phase.turn=2;terminal.recordState(selection);
 assert.equal(terminal.history().entries.length,2);assert.equal(terminal.history().entries[0].complete,true,'terminal selection is an outcome, not a new unplayed decision');
});
test('Review computation is read-only and classification is cached and bounded',()=>{
 let calls=0;const reviewer=new BattleHistory({classify:()=>{calls++;return {reasons:[],filtered:false};}}),r=recording(),events=r.retainedEvents(),before=JSON.stringify(events);
 reviewer.review(events);reviewer.review(events);assert.equal(calls,1);assert.equal(JSON.stringify(events),before);
 for(let i=0;i<220;i++){const copy=structuredClone(events);for(const e of copy)e.state_id+=i*10;reviewer.review(copy);}
 assert.ok(reviewer.cache.size<=200);
});
test('Saved and live review HTML escape game strings and render only whole percentages',()=>{
 const history=recording().history();history.entries[1].player='<script>alert(1)</script>';history.entries[1].before_score=51.234;
 history.entries[1].review.alternatives=['<img src=x onerror=alert(1)>'];
 const saved=historyDocument(history),live=historyDocument(history,{live:true});
 assert.ok(saved.includes('&lt;script&gt;'));assert.ok(!saved.includes('<script>alert'));assert.ok(saved.includes('51%'));assert.ok(!saved.includes('51.234'));
 assert.ok(!saved.includes('src="/history-app.mjs"'));assert.ok(live.includes('src="/history-app.mjs"'));
 assert.ok(saved.indexOf('Review this decision:')<saved.indexOf('Waiting for the next decision'),'completed decisions are shown before the unfinished current turn');
});
test('Saved reports include a standalone player review alongside the original debug timeline',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-review-'));
 try{const r=recording();r.directory=directory;const saved=await r.save();
  assert.equal(JSON.parse(await readFile(join(saved.directory,'review.json'),'utf8')).entries.length,2);
  assert.match(await readFile(join(saved.directory,'review.html'),'utf8'),/Review this decision/);
  assert.match(await readFile(join(saved.directory,'timeline.html'),'utf8'),/PokéPulse bug report/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
