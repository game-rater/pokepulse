import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stallFixtures} from './stall-benchmark-fixtures.mjs';
import {benchmarkReference} from './benchmark-oracles.mjs';
export function assessBenchmarkRows(rows,fixtures){
 if(!Array.isArray(rows)||!rows.length)throw Error('No benchmark rows');
 return rows.map(row=>{
  const f=fixtures.find(f=>f.id===row.case);if(!f)throw Error('Unknown benchmark case '+row.case);
  const reference=benchmarkReference(f,row.opponent_model);
  if(row.fixture_hash!==reference.input_sha256||row.reference?.expected_percent!==reference.expected_percent)throw Error('Stale or changed reference for '+row.case);
  const first=row.first_second,available=Number.isFinite(first?.score)&&first.available_at_ms>0&&first.available_at_ms<=1000&&!row.input_blocked;
  const earlyError=available?Math.abs(first.score-reference.expected_percent):null;
  const finalError=Number.isFinite(row.score)&&!row.input_blocked?Math.abs(row.score-reference.expected_percent):null;
  const earlyPass=available&&earlyError<=10,finalPass=finalError!==null&&finalError<=10;
  return {case:row.case,opponent_model:row.opponent_model,trial:row.trial,expected_percent:reference.expected_percent,
   score_at_one_second:available?first.score:null,error_at_one_second_pp:earlyError,final_score:row.score,final_error_pp:finalError,
   first_second_pass:earlyPass,final_pass:finalPass,pass:earlyPass&&finalPass};
 });
}
export function assessStallRows(rows){return assessBenchmarkRows(rows,stallFixtures);}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const files=process.argv.slice(2).filter(a=>!a.startsWith('--')),out=process.argv.find(a=>a.startsWith('--out='))?.slice(6);
 if(!files.length)throw Error('Pass one or more retained-turn stall benchmark JSON files');
 const cases=assessStallRows(files.flatMap(f=>JSON.parse(readFileSync(f,'utf8')).rows));
 const report={created_at:new Date().toISOString(),scope:'Warm search, active pair, ten-percentage-point error budget by one second; final estimate must also remain within that budget. Not a cold/UI latency test.',total:cases.length,passed:cases.filter(c=>c.pass).length,failed:cases.filter(c=>!c.pass).length,cases};
 for(const c of cases)console.log(`${c.pass?'PASS':'FAIL'} ${c.case}/${c.opponent_model}: expected ${c.expected_percent}%; at 1s ${c.score_at_one_second??'unavailable'}%; final ${c.final_score??'unavailable'}%`);
 if(out){const path=resolve(out);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n');}
 console.log(`${report.passed}/${report.total} passed`);process.exitCode=report.failed?1:0;
}
