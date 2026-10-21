// Metadata/state matching only; no ROM, worker, search or live process touched.
import {performance} from 'node:perf_hooks';
import {createCompleteBattle,restoreCompleteBattle,nativeMoveChoices} from '../analysis/native-battle.mjs';
import {strategyOrdering,strategyPatterns} from '../analysis/strategy-registry.mjs';
import {referenceMon} from './accuracy-benchmark-fixtures.mjs';
const iterations=Number(process.argv[2]||10000);
if(!Number.isInteger(iterations)||iterations<1||iterations>1000000)throw Error('Use 1–1000000 iterations');
const battle=restoreCompleteBattle(createCompleteBattle({player:referenceMon('Mew',['Spore','Wake-Up Slap','Toxic','Hex'],{level:30}),opponent:referenceMon('Mew',['Tackle'],{level:30}),field:{}}));
const p=battle.p1.active[0],moves=nativeMoveChoices(p),cold=performance.now(),first=strategyOrdering(p,moves),compileMs=performance.now()-cold;
let hits=0;const start=performance.now();
for(let i=0;i<iterations;i++)hits+=strategyOrdering(p,moves).matches.length;
const elapsedMs=performance.now()-start;
console.log(JSON.stringify({families:strategyPatterns.length,iterations,first_lookup_ms:compileMs,warm_lookup_us:1000*elapsedMs/iterations,total_lookup_ms:elapsedMs,matches_per_lookup:hits/iterations,first_matches:first.matches.map(m=>m.id),scope:'Move metadata and current-state hints only; not battle prediction latency.'},null,2));
