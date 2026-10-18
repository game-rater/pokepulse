// Time slices bound responsiveness, not the lifetime of a battle search.
import {setImmediate, setTimeout} from 'node:timers/promises';

export async function refineUntilResolved({run,publish,obsolete,budgets=[150,250],pauseMs=50}) {
  if(!budgets.length||budgets.some(ms=>!Number.isFinite(ms)||ms<=0))throw Error('Search time slices must be positive.');
  let depth=4;
  for(let pass=0;!obsolete();pass++) {
    const timeMs=budgets[Math.min(pass,budgets.length-1)];
    // Cover short continuations across actions before spending a slice down
    // one very deep branch. Repeat a budget-limited horizon using saved bounds.
    const options={timeMs,maxNodes:Infinity,maxDepth:depth,matrixIterations:256*(pass+1)};
    const result=run(options);
    if(obsolete())return;
    publish(result,{pass:pass+1,...options});
    if(result.outlook.complete||result.outlook.input_blocked||result.outlook.sampling_complete||result.outlook.search_paused)return;
    // A horizon may remain expensive even after several passes. Deepen anyway
    // so shallow unresolved leaves cannot permanently stall the search.
    if(!result.outlook.budget_exhausted||(pass+1)%4===0)depth=depth<128?depth*2:depth+32;
    // Yield so queued state changes can replace this search. An unsupported
    // continuation can return immediately; avoid spinning on it at full CPU.
    if(result.outlook.elapsed_ms<10&&pauseMs)await setTimeout(pauseMs);
    else await setImmediate();
  }
}
