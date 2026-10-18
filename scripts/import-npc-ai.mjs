// Reproducible import; no upstream install scripts are executed.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {execFileSync} from 'node:child_process';
import {patchNpcAi,npcAiPatches} from './npc-ai-patches.mjs';
const root='.local-tools/rnb-ai-reference';
let source=readFileSync(`${root}/calc/src/ai.ts`,'utf8');
source=source.replace(/^import .*;\r?\n/gm,'');
source=patchNpcAi(source);
const header=`// Run & Bun community AI predictor. See source.json and LICENSE.\nimport calculator from '../run-bun/index.js';\nimport util from '../run-bun/mechanics/util.js';\nimport mechanics from '../run-bun/mechanics/gen789.js';\nconst {Generations,Move,Field}=calculator;\nconst {getMoveEffectiveness}=util;\nconst {calculateSMSSSV}=mechanics;\n`;
mkdirSync('vendor/npc-ai',{recursive:true});
writeFileSync('vendor/npc-ai/predictor.mjs',header.replace('const {calculateSMSSSV}=mechanics;',"const calculateSMSSSV=(...args)=>{const result=mechanics.calculateSMSSSV(...args);result.damageRolls=()=>typeof result.damage==='number'?[result.damage]:result.damage;return result;};")+stripTypeScriptTypes(source));
writeFileSync('vendor/npc-ai/LICENSE',readFileSync(`${root}/LICENSE`));
writeFileSync('vendor/npc-ai/source.json',JSON.stringify({repository:'https://github.com/SynchEleven/rnb-calc-ultimate',commit:execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),file:'calc/src/ai.ts',license:'MIT',patches:npcAiPatches,adaptations:'Type annotations removed; runtime imports use existing Run & Bun calculator with damageRolls compatibility. This is a community implementation, not verified ROM code.'},null,2)+'\n');
