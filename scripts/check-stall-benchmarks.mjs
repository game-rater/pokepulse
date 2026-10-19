import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stallFixtures} from './stall-benchmark-fixtures.mjs';
import {benchmarkReference} from './benchmark-oracles.mjs';
import {assessInitialEstimate} from './prediction-target.mjs';
export function assessBenchmarkRows(rows,fixtures){
 if(!Array.isArray(rows)||!rows.length)throw Error('No benchmark rows');
 return rows.map(row=>{
  const f=fixtures.find(f=>f.id===row.case);if(!f)throw Error('Unknown benchmark case '+row.case);
  const reference=benchmarkReference(f,row.opponent_model);
  if(row.fixture_hash!==reference.input_sha256||row.reference?.expected_percent!==reference.expected_percent)throw Error('Stale or changed reference for '+row.case);
  const validScore=score=>Number.isFinite(score)&&score>=0&&score<=100;
  const first=row.first_second,available=validScore(first?.score)&&Number.isFinite(first.available_at_ms)&&first.available_at_ms>=0&&first.available_at_ms<=1000&&!row.input_blocked;
  const earlyError=available?Math.abs(first.score-reference.expected_percent):null;
  const finalError=validScore(row.score)&&!row.input_blocked?Math.abs(row.score-reference.expected_percent):null;
  const earlyPass=available&&earlyError<=10,finalPass=finalError!==null&&finalError<=10;
  const initial=row.initial_estimate||row.checkpoints?.['300'];
  const target=assessInitialEstimate(row.input_blocked?[]:[{score:initial?.score,elapsed_ms:initial?.available_at_ms}],reference.expected_percent);
  return {case:row.case,opponent_model:row.opponent_model,trial:row.trial,expected_percent:reference.expected_percent,
   score_at_one_second:available?first.score:null,error_at_one_second_pp:earlyError,final_score:row.score,final_error_pp:finalError,
   first_second_pass:earlyPass,initial_estimate:target,initial_estimate_pass:target.goal_met===true,final_pass:finalPass,pass:target.goal_met===true&&finalPass};
 });
}
export function assessStallRows(rows){return assessBenchmarkRows(rows,stallFixtures);}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const files=process.argv.slice(2).filter(a=>!a.startsWith('--')),out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
 if(!files.length)throw Error('Pass one or more retained-turn stall benchmark JSON files');
 const cases=assessStallRows(files.flatMap(f=>JSON.parse(readFileSync(f,'utf8')).rows));
 const report={created_at:new Date().toISOString(),scope:'Warm search, active pair, ten-percentage-point error budget strictly before 300ms; final estimate must also remain within that budget. Not a cold/UI latency test.',total:cases.length,passed:cases.filter(c=>c.pass).length,failed:cases.filter(c=>!c.pass).length,cases};
 for(const c of cases)console.log(`${c.pass?'PASS':'FAIL'} ${c.case}/${c.opponent_model}: expected ${c.expected_percent}%; before 300ms ${c.initial_estimate.score??'unavailable'}%; final ${c.final_score??'unavailable'}%`);
 if(out){const path=resolve(out);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
 console.log(`${report.passed}/${report.total} passed`);process.exitCode=report.failed?1:0;
}
