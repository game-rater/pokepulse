import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BattleRecorder} from '../run-bun/battle-recorder.mjs';

test('Recorder retains replay context, sampled display and same-state review flags in an immutable report',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'pokepulse-recorder-'));let clock=0;
 const r=new BattleRecorder({directory,now:()=>clock,maxAgeMs:1000});
 try{
  const snapshot={player:{hp:30,status:'slp'},opponent:{hp:20}};
  r.recordState(snapshot);snapshot.player.hp=999;
  r.recordResult({display_score:30,outlook:{lower_bound:20,upper_bound:40}});
  clock=900;r.recordResult({display_score:80,outlook:{lower_bound:70,upper_bound:90}});
  r.recordDisplay({score:65,mode:'losses',state_id:1});
  clock=1100;const saved=await r.save({note:'<script>bad</script>',source:'hotkey'});
  const report=JSON.parse(await readFile(saved.report_path,'utf8'));
  assert.equal(report.events.find(e=>e.kind==='battle-state').snapshot.player.hp,30);
  assert.equal(report.events.find(e=>e.kind==='battle-state').context_only,true);
  assert.equal(report.events.find(e=>e.kind==='display').display.score,65);
  assert.ok(report.events.some(e=>e.kind==='review-flag'));
  r.recordState({player:{hp:10},opponent:{hp:20}});
  assert.equal(report.events.filter(e=>e.kind==='battle-state').length,1);
  const html=await readFile(join(saved.directory,'timeline.html'),'utf8');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>bad'));
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('Recorder bounds ring size and records observations rather than inventing actions',()=>{
 const r=new BattleRecorder({directory:'unused',maxBytes:1500,maxEvents:5});
 r.recordState({player:{pp:{Tackle:10}},opponent:{hp:20}});
 r.recordState({player:{pp:{Tackle:9}},opponent:{hp:12}});
 assert.ok(r.events.at(-1).event.changes.some(c=>c.path==='player.pp.Tackle'));
 for(let i=0;i<50;i++)r.append('tracking',{tracking:{status:'battle'}});
 assert.deepEqual(r.events.map(e=>e.event.id),[48,49,50,51,52]);assert.ok(r.bytes<=1500);
 assert.equal(r.events.some(e=>e.event.kind==='selected-move'),false);
});

test('Oversized events are rejected without evicting useful retained observations',()=>{
 const r=new BattleRecorder({directory:'unused',maxBytes:500});r.append('tracking',{tracking:{status:'battle'}});
 const before=r.retainedEvents();r.append('oversized',{payload:'x'.repeat(1000)});
 assert.deepEqual(r.retainedEvents(),before);assert.equal(r.bytes,Buffer.byteLength(JSON.stringify(before[0])));
});

test('Native messages are detached from caller mutation and retained within recorder age limits',()=>{
 let now=0;const r=new BattleRecorder({directory:'unused',now:()=>now,maxAgeMs:1000});
 const message={kind:'critical-hit',move:'Hyper Fang'};r.recordMessages([message]);message.move='Splash';
 assert.equal(r.retainedEvents()[0].message.move,'Hyper Fang');now=1001;r.status();assert.deepEqual(r.retainedEvents(),[]);assert.equal(r.bytes,0);
});
