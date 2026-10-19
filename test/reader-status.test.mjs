import test from 'node:test';
import assert from 'node:assert/strict';
import {readerStatus} from '../run-bun/reader-status.mjs';
import {spawnSync} from 'node:child_process';
const state=()=>({tracking:{status:'battle',received_at:9000},battle_phase:{kind:'selection'},prediction_started_at:9100,prediction_updated_at:9200,
 result:{display_score:51,refining:false,outlook:{}}});
const status=s=>readerStatus(s,{now:10000});
test('Status distinguishes fresh captures from a responsive reader with stale game data',()=>{
 const s=state();assert.equal(status(s).kind,'ready');s.tracking.received_at=1000;
 assert.equal(status(s).kind,'stale');assert.equal(status(s).connection,'stale');
 s.tracking.received_at=10000;assert.equal(status(s).kind,'ready');
 s.tracking.status='stale';assert.equal(status(s).kind,'stale');
 s.tracking.status='disconnected';assert.equal(status(s).kind,'disconnected');
});
test('Outside battle, unsupported input and loading have distinct actionable statuses',()=>{
 const s=state();
 for(const [tracking,kind] of [['outside-battle','outside-battle'],['unsupported','unsupported'],['waiting','reading']]){
  s.tracking.status=tracking;s.tracking.message='Specific reader explanation';
  const view=status(s);assert.equal(view.kind,kind);assert.ok(view.action);assert.equal(view.connection,'connected');
  if(tracking!=='outside-battle')assert.match(view.detail,/Specific reader explanation/);
 }
});
test('Calculating is distinct from missing data and a stopped unresolved calculation',()=>{
 const s=state();s.result=null;assert.equal(status(s).kind,'calculating');
 s.result={display_score:null,refining:true,outlook:{input_blocked:true,unresolved_reasons:['Wake-up counter unavailable','Wake-up counter unavailable']}};
 let view=status(s);assert.equal(view.kind,'missing-data');assert.deepEqual(view.reasons,['Wake-up counter unavailable']);
 s.result.outlook={};assert.equal(status(s).kind,'calculating');
 for(const flag of ['search_paused','sampling_complete','complete']){s.result.outlook={[flag]:true};assert.equal(status(s).kind,'unavailable');}
 s.result=null;s.prediction_started_at=null;assert.equal(status(s).kind,'reading');
});
test('Zero is a valid prediction; explicit null never falls back to an old victory value',()=>{
 const s=state();s.result.display_score=0;assert.equal(status(s).kind,'ready');
 s.result.refining=true;assert.equal(status(s).kind,'refining');
 s.result.display_score=null;s.result.victory=75;assert.equal(status(s).kind,'calculating');
 delete s.result.display_score;s.result.refining=false;assert.equal(status(s).kind,'ready');
});
test('Battle animation and prediction failures are explained without changing input or meter values',()=>{
 const s=state();s.battle_phase.kind='resolving';const before=structuredClone(s);
 assert.equal(status(s).kind,'reading');assert.deepEqual(s,before);
 s.prediction_error='Native move failed';const view=status(s);assert.equal(view.kind,'error');assert.match(view.detail,/Native move failed/);
 assert.equal(s.result.display_score,51);
});
test('Status preserves true update timestamps and rejects invalid clock values',()=>{
 const s=state(),view=status(s);assert.equal(view.last_game_at,9000);assert.equal(view.last_prediction_at,9200);assert.equal(view.prediction_started_at,9100);
 s.prediction_started_at=NaN;s.prediction_updated_at=-1;s.tracking.received_at=null;
 const invalid=status(s);assert.equal(invalid.last_game_at,null);assert.equal(invalid.last_prediction_at,null);assert.equal(invalid.prediction_started_at,null);
});
test('Desktop status panel updates and reconnects through its real PowerShell controls',{skip:process.platform!=='win32'},()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','test-ground/check-reader-status-panel.ps1'],{encoding:'utf8',timeout:15000,windowsHide:true});
 assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PASS: reader status panel/);
});
