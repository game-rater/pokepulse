// Run the same correctness scenarios against the pinned upstream predictor and
// our patched adapter without replacing any runtime files.
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {spawnSync} from 'node:child_process';
const base=resolve('.local-tools'),directory=mkdtempSync(join(base,'npc-audit-'));
if(!directory.startsWith(base+'\\')&&!directory.startsWith(base+'/'))throw Error('Unexpected audit directory');
function imports(source,origin,overrides={}){
 return source.replace(/from '([^']+)'/g,(match,target)=>target.startsWith('.')?`from '${pathToFileURL(overrides[target]||resolve(dirname(origin),target)).href}'`:match);
}
try{
 const predictorPath=join(directory,'predictor.mjs'),adapterPath=join(directory,'adapter.mjs'),testPath=join(directory,'correctness.test.mjs');
 const source=readFileSync('.local-tools/rnb-ai-reference/calc/src/ai.ts','utf8').replace(/^import .*;\r?\n/gm,'');
 const patched=readFileSync('vendor/npc-ai/predictor.mjs','utf8');
 const header=patched.slice(0,patched.indexOf('// interfaces'));
 writeFileSync(predictorPath,imports(header,resolve('vendor/npc-ai/predictor.mjs'))+stripTypeScriptTypes(source));
 const adapter=readFileSync('run-bun/npc-ai.mjs','utf8').replace(' result.toxicCounter=Math.max(1,(p.statusState.stage||0)+1);','');
 writeFileSync(adapterPath,imports(adapter,resolve('run-bun/npc-ai.mjs'),{'../vendor/npc-ai/predictor.mjs':predictorPath}));
 writeFileSync(testPath,imports(readFileSync('test/npc-ai-correctness.test.mjs','utf8'),resolve('test/npc-ai-correctness.test.mjs'),{'../run-bun/npc-ai.mjs':adapterPath}));
 for(const [label,file] of [['upstream',testPath],['patched','test/npc-ai-correctness.test.mjs']]){
  const run=spawnSync(process.execPath,['--test','--test-reporter=spec',file],{encoding:'utf8'});
  const report=run.stdout.replace(/\u001b\[[0-9;]*m/g,'');
  const summary=report.split('\n').filter(line=>/^ℹ (tests|pass|fail) /.test(line));
  console.log(label+': '+summary.join('; '));
  if(label==='upstream')console.log(report.split('ℹ tests')[0].split('\n').filter(line=>line.startsWith('✖')).join('\n'));
  if(label==='patched'&&run.status!==0)throw Error(report+'\n'+run.stderr);
 }
}finally{rmSync(directory,{recursive:true,force:true});}
