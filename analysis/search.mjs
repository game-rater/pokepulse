// Adapter-independent simultaneous-action stochastic game search.
// Unknown leaves have value [0,1]. No discarded probability is renormalized.
// Safe interval dominance for simultaneous mixed strategies. A row is
// removable only when another row (or a uniform mixture) beats its entire
// optimistic payoff vector. Columns use the reversed inequality.
export function matrixPruning(lower,upper){
 const rows=lower.map((_,i)=>i),columns=lower[0].map((_,j)=>j);
 let changed=true;
 while(changed){
  changed=false;
  for(const i of [...rows]){
   if(rows.length===1)break;
   const others=rows.filter(k=>k!==i);
   const pure=others.some(k=>columns.every(j=>lower[k][j]>=upper[i][j])&&
    (columns.some(j=>lower[k][j]>upper[i][j]+1e-12)||k<i));
   const mixed=others.length>1&&columns.every(j=>others.reduce((s,k)=>s+lower[k][j],0)/others.length>upper[i][j]+1e-12);
   if(pure||mixed){rows.splice(rows.indexOf(i),1);changed=true;}
  }
  for(const j of [...columns]){
   if(columns.length===1)break;
   const others=columns.filter(k=>k!==j);
   const pure=others.some(k=>rows.every(i=>upper[i][k]<=lower[i][j])&&
    (rows.some(i=>upper[i][k]<lower[i][j]-1e-12)||k<j));
   const mixed=others.length>1&&rows.every(i=>others.reduce((s,k)=>s+upper[i][k],0)/others.length<lower[i][j]-1e-12);
   if(pure||mixed){columns.splice(columns.indexOf(j),1);changed=true;}
  }
 }
 return {rows,columns,pruned:lower.length-rows.length+lower[0].length-columns.length};
}
export function thresholdDecision(lower,upper,threshold){return lower>=threshold?'above':upper<threshold?'below':'unresolved';}
export function proofThreshold(lower,upper){return (lower+upper)/2;}
export function matrixBounds(lower, upper, iterations=256,shouldStop=()=>false) {
  let rows=lower.length, cols=lower[0].length;
  if(rows>1&&cols>1){
    const active=matrixPruning(lower,upper);
    lower=active.rows.map(i=>active.columns.map(j=>lower[i][j]));
    upper=active.rows.map(i=>active.columns.map(j=>upper[i][j]));
    rows=lower.length;cols=lower[0].length;
  }
  if(rows===1&&cols===1)return {lower:lower[0][0],upper:upper[0][0]};
  if(rows===1)return {lower:Math.min(...lower[0]),upper:Math.min(...upper[0])};
  if(cols===1)return {lower:Math.max(...lower.map(r=>r[0])),upper:Math.max(...upper.map(r=>r[0]))};
  const pureLo=Math.max(...lower.map(r=>Math.min(...r)));
  const pureHi=Math.min(...upper[0].map((_,j)=>Math.max(...upper.map(r=>r[j]))));
  if(pureHi-pureLo<1e-12)return {lower:pureLo,upper:pureHi};
  // Any mixed row policy provides a lower bound; any column policy an upper.
  // Fictitious play improves those certificates without assuming convergence.
  const p=Array(rows).fill(1),q=Array(cols).fill(1);
  let lo=pureLo,hi=pureHi;
  for(let k=0;k<iterations;k++){
    if((k&31)===0&&shouldStop())break;
    const ps=p.reduce((a,b)=>a+b),qs=q.reduce((a,b)=>a+b);
    const rv=lower.map(r=>r.reduce((s,v,j)=>s+v*q[j]/qs,0));
    const cv=upper[0].map((_,j)=>upper.reduce((s,r,i)=>s+r[j]*p[i]/ps,0));
    lo=Math.max(lo,Math.min(...lower[0].map((_,j)=>lower.reduce((s,r,i)=>s+r[j]*p[i]/ps,0))));
    hi=Math.min(hi,Math.max(...upper.map(r=>r.reduce((s,v,j)=>s+v*q[j]/qs,0))));
    p[rv.indexOf(Math.max(...rv))]++;q[cv.indexOf(Math.min(...cv))]++;
  }
  return {lower:lo,upper:Math.max(lo,hi)};
}

export function searchBattle(adapter,initial,options={}) {
  if(options.thresholdSearch&&options.targetProbability===undefined)return searchProbabilityThresholds(adapter,initial,options);
  if(options.progressive)return searchFrontier(adapter,initial,options);
  const {maxDepth=64,maxNodes=50000,timeMs=1000,tolerance=0.002,onProgress=()=>{}}=options;
  const session=options.session||{};
  const cache=session.cache??=new Map(),certificates=session.certificates??=new Map();
  const pairs=session.pairs??=new Map();
  const pass=session.pass=(session.pass||0)+1,start=performance.now();
  const remember=(key,value)=>cache.set(key,{...value,pass});
  const stats={nodes:0,cache_hits:0,merged_branches:0,pruned_actions:0,pruned_chance_branches:0,depth:0,
    root_reused:certificates.has(adapter.key(initial))};
  let stopped=false,cycleVisits=0;
  const ancestors=new Set();
  const unknown=()=>({lower:0,upper:1});
  function visit(state,depth,pathProbability=1){
    if(options.shouldStop?.()){stopped=true;return certificates.get(adapter.key(state))||unknown();}
    const terminal=adapter.terminal(state);
    if(terminal!==null)return {lower:terminal,upper:terminal};
    const key=adapter.key(state),ck=depth+'|'+key;
    const cached=cache.get(ck);
    if(cached&&(cached.pass===pass||cached.horizon_complete||cached.upper-cached.lower<=tolerance)){stats.cache_hits++;return cached;}
    const known=certificates.get(key)||unknown();
    if(state===initial&&options.targetProbability!==undefined&&
      thresholdDecision(known.lower,known.upper,options.targetProbability)!=='unresolved'){stats.cache_hits++;return known;}
    if(known.upper-known.lower<=tolerance){stats.cache_hits++;return known;}
    // A cycle uses the previous valid certificate, rather than recursing
    // indefinitely. Later passes tighten it using the exiting branches.
    if(ancestors.has(key)){cycleVisits++;return known;}
    if(pathProbability<(options.minPathProbability??0)){
      stats.pruned_chance_branches++;return known;
    }
    if(!depth||stopped)return known;
    if(stats.nodes>=maxNodes||performance.now()-start>=timeMs){stopped=true;return known;}
    stats.nodes++;
    const cyclesBefore=cycleVisits;
    const [ourActions,theirActions]=adapter.actions(state);
    // Time-limited passes must not always spend their budget on the first
    // action pair. Rotate both axes together for every row of this matrix.
    const rotate=(actions,index)=>{const offset=index%Math.max(1,actions.length);return [...actions.slice(offset),...actions.slice(0,offset)];};
    // Advance the opponent axis after a full player-action cycle. Advancing
    // both together only visits diagonal pairs when their counts are equal.
    const ours=rotate(ourActions,pass-1),theirs=rotate(theirActions,Math.floor((pass-1)/Math.max(1,ourActions.length)));
    if(!ours.length||!theirs.length)return known;
    ancestors.add(key);
    const lows=ours.map(a=>theirs.map(b=>pairs.get(JSON.stringify([key,a,b]))?.lower??0));
    const highs=ours.map(a=>theirs.map(b=>pairs.get(JSON.stringify([key,a,b]))?.upper??1));
    const masks=()=>options.boundPruning===false?{rows:ours.map((_,i)=>i),columns:theirs.map((_,j)=>j),pruned:0}:matrixPruning(lows,highs);
    const ignoredRows=new Set(),ignoredColumns=new Set();
    for(let r=0;r<ours.length;r++){
      const active=masks();
      if(!active.rows.includes(r)){ignoredRows.add(r);continue;}
      for(let c=0;c<theirs.length;c++){
        if(!masks().columns.includes(c)){ignoredColumns.add(c);continue;}
        const a=ours[r],b=theirs[c],pairKey=JSON.stringify([key,a,b]),pair=pairs.get(pairKey);
        if(pair&&pair.upper-pair.lower<=tolerance){stats.cache_hits++;continue;}
        const branches=adapter.transitions(state,a,b),merged=new Map();let total=0;
        for(const branch of branches){
          if(!Number.isFinite(branch.probability)||branch.probability<0)throw Error('Invalid transition probability');
          total+=branch.probability;if(!branch.probability)continue;
          const k=adapter.key(branch.state),old=merged.get(k);
          if(old){old.probability+=branch.probability;stats.merged_branches++;}else merged.set(k,{...branch});
        }
        if(Math.abs(total-1)>1e-8)throw Error('Transition probabilities must sum to one');
        let lo=0,hi=0,remaining=1;
        const sorted=[...merged.values()].sort((a,b)=>b.probability-a.probability);
        for(let i=0;i<sorted.length;i++){
          const branch=sorted[i],v=visit(branch.state,depth-(adapter.depthCost?.(state)??1),pathProbability*branch.probability);
          remaining=Math.max(0,remaining-branch.probability);lo+=branch.probability*v.lower;hi+=branch.probability*v.upper;
          lows[r][c]=Math.max(lo,pair?.lower??0);highs[r][c]=Math.min(hi+remaining,pair?.upper??1);
          const relevant=masks();
          const thresholdProof=state===initial&&options.targetProbability!==undefined?
            matrixBounds(lows,highs,32):null;
          // A dominated action needs no more chance expansion. Preserve the
          // unvisited tail as [0,mass], never renormalize the visited outcomes.
          if(remaining<=(options.chanceTolerance??1e-12)||!relevant.rows.includes(r)||!relevant.columns.includes(c)||
            thresholdProof&&thresholdDecision(thresholdProof.lower,thresholdProof.upper,options.targetProbability)!=='unresolved'){
            hi+=remaining;stats.pruned_chance_branches+=sorted.length-i-1;break;
          }
        }
        lows[r][c]=Math.max(lo,pair?.lower??0);highs[r][c]=Math.max(lows[r][c],Math.min(hi,pair?.upper??1));
        pairs.set(pairKey,{lower:lows[r][c],upper:highs[r][c]});
        if(state===initial&&options.targetProbability!==undefined){
          const proof=matrixBounds(lows,highs,64);
          if(thresholdDecision(proof.lower,proof.upper,options.targetProbability)!=='unresolved'){
            const result={lower:Math.max(known.lower,proof.lower),upper:Math.min(known.upper,proof.upper)};
            remember(ck,{...result,horizon_complete:false});certificates.set(key,result);ancestors.delete(key);return result;
          }
        }
      }
      if(Math.min(...lows[r])>=1-1e-12){
        stats.pruned_actions+=ours.length-r-1;
        const result={lower:1,upper:1};remember(ck,result);certificates.set(key,result);ancestors.delete(key);return result;
      }
    }
    stats.pruned_actions+=ignoredRows.size+ignoredColumns.size;
    const v=matrixBounds(lows,highs,options.matrixIterations??256,()=>{
      if(options.shouldStop?.()||performance.now()-start>=timeMs)stopped=true;
      return stopped;
    });
    const result={lower:Math.max(known.lower,v.lower),upper:Math.min(known.upper,v.upper)};
    result.upper=Math.max(result.lower,result.upper);
    remember(ck,{...result,horizon_complete:!stopped&&cycleVisits===cyclesBefore});certificates.set(key,result);
    ancestors.delete(key);
    return result;
  }
  let result=unknown();
  const depths=options.depths||[maxDepth];
  for(const depth of depths){
    result=visit(initial,depth);stats.depth=depth;
    onProgress({...result,...stats,elapsed_ms:performance.now()-start});
    if(stopped||result.upper-result.lower<=tolerance||(options.targetProbability!==undefined&&thresholdDecision(result.lower,result.upper,options.targetProbability)!=='unresolved'))break;
  }
  return {...result,...stats,elapsed_ms:performance.now()-start,budget_exhausted:stopped,
    max_depth:maxDepth,complete:result.upper-result.lower<=tolerance,threshold_answer:options.targetProbability===undefined?undefined:thresholdDecision(result.lower,result.upper,options.targetProbability)};
}

// Persistent frontier search: expand each distinct state once, then propagate
// interval values through the retained graph. A time slice resumes its frontier
// instead of repeatedly traversing a deep, unfinished action branch.
export function searchFrontier(adapter,initial,options={}){
  const session=options.session||{},graph=session.graph??=new Map(),start=performance.now();
  // Probabilities are displayed as percentages, so 0.01 permits a certified
  // interval up to one percentage point wide in the progressive live search.
  const tolerance=options.tolerance??0.01,limit=options.maxNodes??50000;
  const resolved=node=>node.upper>=1-1e-12?node.lower>=1-1e-12:
    node.lower<=1e-12?node.upper<=1e-12:node.upper-node.lower<=tolerance;
  let expanded=0,merged=0,stopped=false,depth=0,pruned=0,chancePruned=0;
  const dirty=session.dirty??={queue:[],head:0,set:new Set()};
  const mark=node=>{if(!dirty.set.has(node.key)){dirty.set.add(node.key);dirty.queue.push(node);}};
  const get=state=>{const key=adapter.key(state);if(graph.has(key))return graph.get(key);
    const terminal=adapter.terminal(state),guess=terminal===null?options.evaluate?.(state):terminal;
    const node={key,state,lower:terminal??0,upper:terminal??1,estimate:terminal??(Number.isFinite(guess)?Math.max(0,Math.min(1,guess)):0.5),terminal:terminal!==null,edges:null,parents:new Set()};graph.set(key,node);return node;};
  const root=get(initial),reused=!!root.edges;
  const expired=()=>options.shouldStop?.()||performance.now()-start>=0.6*(options.timeMs??1000)||expanded>=limit;
  // Resume the actual traversal, rather than spending every slice on the same
  // high-priority prefix. Rerooting starts a fresh traversal of the retained graph.
  let frontier=session.frontier;
  if(!frontier||frontier.rootKey!==root.key||!frontier.heap.length){
    frontier=session.frontier={rootKey:root.key,heap:[],queued:new Map(),fifo:[],fifoHead:0,deferred:[],seen:new Set(),reachable:[]};
  }
  const heap=frontier.heap;
  const queued=frontier.queued;
  function rise(entry){let i=entry.index;while(i){const p=(i-1)>>1;if(heap[p].priority>=entry.priority)break;heap[i]=heap[p];heap[i].index=i;i=p;}heap[i]=entry;entry.index=i;}
  function push(entry){const existing=queued.get(entry.node.key);if(existing){if(entry.priority>existing.priority){existing.priority=entry.priority;existing.mass=entry.mass;existing.depth=Math.min(existing.depth,entry.depth);rise(existing);}return;}
    queued.set(entry.node.key,entry);entry.index=heap.length;heap.push(entry);frontier.fifo.push(entry);rise(entry);}
  function pop(){const top=heap[0],last=heap.pop();queued.delete(top.node.key);if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1].priority>heap[c].priority)c++;if(heap[c].priority<=last.priority)break;heap[i]=heap[c];heap[i].index=i;i=c;}heap[i]=last;last.index=i;}return top;}
  const seen=frontier.seen,reachable=frontier.reachable;
  const deferred=[];
  for(const entry of frontier.deferred){
    if(entry.depth<(options.maxDepth??128)){seen.delete(entry.node.key);push(entry);}else deferred.push(entry);
  }
  frontier.deferred=deferred;
  if(!heap.length)push({node:root,depth:0,priority:1,mass:1});
  const initialSeen=seen.size;
  function backup(node){
    if(!node.edges?.length)return;
    const before=[node.lower,node.upper,node.estimate];
    const lo=node.edges.map(row=>row.map(branches=>branches.reduce((sum,b)=>sum+b.probability*b.node.lower,0)));
    const hi=node.edges.map(row=>row.map(branches=>branches.reduce((sum,b)=>sum+b.probability*b.node.upper,0)));
    node.active=options.boundPruning===false?{rows:lo.map((_,i)=>i),columns:lo[0].map((_,j)=>j),pruned:0}:matrixPruning(lo,hi);
    node.proofThreshold=options.targetProbability??proofThreshold(node.lower,node.upper);
    const bounds=matrixBounds(lo,hi,64,()=>!!options.shouldStop?.());
    node.lower=Math.max(node.lower,bounds.lower);node.upper=Math.max(node.lower,Math.min(node.upper,bounds.upper));
    const estimates=node.edges.map(row=>row.map(branches=>branches.reduce((sum,b)=>sum+b.probability*b.node.estimate,0)));
    const partial=matrixBounds(estimates,estimates,32,()=>!!options.shouldStop?.());
    node.estimate=Math.max(node.lower,Math.min(node.upper,(partial.lower+partial.upper)/2));
    if(Math.abs(node.lower-before[0])+Math.abs(node.upper-before[1])+Math.abs(node.estimate-before[2])>1e-10){
      for(const parent of node.parents)mark(parent);
      (session.certificates??=new Map()).set(node.key,{lower:node.lower,upper:node.upper});
    }
  }
  function propagate(deadline){
    while(dirty.head<dirty.queue.length){
      if(options.shouldStop?.()||performance.now()-start>=deadline)break;
      const node=dirty.queue[dirty.head++];dirty.set.delete(node.key);backup(node);
    }
    if(dirty.head===dirty.queue.length){dirty.queue=[];dirty.head=0;}
  }
  function expand(node){
    if(node.edges||node.terminal)return;
    const [ours,theirs]=adapter.actions(node.state);if(!ours.length||!theirs.length){node.terminal=true;return;}
    node.edges=ours.map(a=>theirs.map(b=>{
      const branches=new Map();let total=0;
      for(const branch of adapter.transitions(node.state,a,b)){
        if(!Number.isFinite(branch.probability)||branch.probability<0)throw Error('Invalid transition probability');
        total+=branch.probability;if(!branch.probability)continue;
        const child=get(branch.state),old=branches.get(child.key);child.parents.add(node);
        if(old){old.probability+=branch.probability;merged++;}else branches.set(child.key,{node:child,probability:branch.probability});
      }
      if(Math.abs(total-1)>1e-8)throw Error('Transition probabilities must sum to one');
      return [...branches.values()];
    }));expanded++;
  }
  function strategyValues(node){return node.edges.map(row=>{
    const values=row.map(bs=>bs.reduce((v,b)=>v+b.probability*b.node.estimate,0));
    return options.strategyValue?options.strategyValue(values,node.state):Math.min(...values);
  });}
  // Verify a short promising strategy through all opponent/chance responses.
  // A heuristic selects the strategy; only enumerated outcomes certify its value.
  const focusSeen=new Set();
  function focus(node,remaining){
    if(node.terminal||resolved(node)||remaining<=0||focusSeen.has(node.key)||expired())return;
    focusSeen.add(node.key);expand(node);if(!node.edges)return;
    backup(node);
    const values=strategyValues(node),active=node.active.rows;
    const preferred=active.reduce((a,b)=>values[a]>=values[b]?a:b),row=node.edges[preferred];
    for(const c of node.active.columns)for(const branch of row[c])focus(branch.node,remaining-(adapter.depthCost?.(node.state)??1));
    backup(node);
  }
  propagate(0.2*(options.timeMs??1000));
  if(options.focusedStrategy)focus(root,Math.min(4,options.maxDepth??128));
  while(heap.length&&!resolved(root)&&(options.targetProbability===undefined||thresholdDecision(root.lower,root.upper,options.targetProbability)==='unresolved')){
    if(expired()){stopped=true;break;}
    const entry=pop(),node=entry.node;if(seen.has(node.key))continue;seen.add(node.key);reachable.push(node);
    depth=Math.max(depth,entry.depth);
    if(node.terminal||resolved(node))continue;
    if(node!==root&&node.parents.size&&[...node.parents].every(parent=>parent.edges&&parent.active&&
      !parent.active.rows.some(r=>parent.active.columns.some(c=>parent.edges[r][c].some(b=>b.node===node))))){chancePruned++;continue;}
    if(!node.edges){
      if(entry.depth>=(options.maxDepth??128)){frontier.deferred.push(entry);continue;}
      expand(node);if(!node.edges)continue;
    }
    backup(node);
    const rowValues=strategyValues(node);
    const preferred=node.active.rows.reduce((a,b)=>rowValues[a]>=rowValues[b]?a:b);
    pruned+=node.active.pruned;
    for(let r=0;r<node.edges.length;r++){
      const row=node.edges[r];
      const ceiling=Math.max(...row.map(bs=>bs.reduce((v,b)=>v+b.probability*b.node.upper,0)));
      // Only our choices are eliminated: a certified policy beats this action
      // against every opponent move. Never discard an opponent's possible move.
      if(!node.active.rows.includes(r)||ceiling<node.lower-1e-10){continue;}
      for(const c of node.active.columns)for(const b of row[c])if(!seen.has(b.node.key)&&!resolved(b.node)){
        const width=b.node.upper-b.node.lower;
        const threshold=thresholdDecision(b.node.lower,b.node.upper,node.proofThreshold);
        const influence=(r===preferred?1:0.02)*(threshold==='unresolved'?2:1);
        const work=Math.max(1,options.workEstimate?.(b.node.state)??1);
        const mass=entry.mass*b.probability*influence;
        const priority=options.branchPriority==='probability'?entry.priority*b.probability*(entry.depth+1)/(entry.depth+2):mass*width/work;
        push({node:b.node,depth:entry.depth+(adapter.depthCost?.(node.state)??1),priority,mass});
      }
    }
    // Reserve work for older, neglected states independently of their score.
    frontier.steps=(frontier.steps||0)+1;
    if(frontier.steps%20===0&&heap.length){
      while(frontier.fifoHead<frontier.fifo.length&&!queued.has(frontier.fifo[frontier.fifoHead].node.key))frontier.fifoHead++;
      const oldest=frontier.fifo[frontier.fifoHead++];
      if(oldest){oldest.priority=Math.max(oldest.priority,heap[0].priority+1);rise(oldest);}
      if(frontier.fifoHead>4096){frontier.fifo=frontier.fifo.slice(frontier.fifoHead);frontier.fifoHead=0;}
    }
  }
  // Children tighten before parents. Repeated passes also contract cycles;
  // unresolved loops retain their full interval instead of a guessed value.
  // Retained ancestors must receive updates from children expanded in later slices.
  // Propagate only changed states, and retain unfinished propagation between
  // slices. Sweeping the entire graph made a 250ms slice grow into seconds.
  propagate(options.timeMs??1000);
  backup(root);
  (session.certificates??=new Map()).set(root.key,{lower:root.lower,upper:root.upper});
  return {lower:root.lower,upper:root.upper,partial_estimate:root.estimate,nodes:expanded,cache_hits:Math.max(0,seen.size-initialSeen-expanded),frontier_pending:heap.length,propagation_pending:dirty.queue.length-dirty.head,merged_branches:merged,pruned_actions:pruned,pruned_chance_branches:chancePruned,proof_threshold:root.proofThreshold,
    root_reused:reused,depth,max_depth:options.maxDepth??128,elapsed_ms:performance.now()-start,budget_exhausted:stopped,complete:resolved(root),threshold_answer:options.targetProbability===undefined?undefined:thresholdDecision(root.lower,root.upper,options.targetProbability)};
}

// Optional probability bisection uses the same retained certificates/frontier.
// A threshold answer is never reported as a fully solved numerical value.
export function searchProbabilityThresholds(adapter,initial,options={}){
 const start=performance.now(),budget=options.timeMs??1000,session=options.session||{};
 let lower=0,upper=1,last=null,queries=0,totalNodes=0;
 do{
  const remaining=Math.max(0,budget-(performance.now()-start));
  if(last&&!remaining)break;
  last=searchBattle(adapter,initial,{...options,session,thresholdSearch:false,timeMs:remaining,
   targetProbability:proofThreshold(lower,upper)});
  totalNodes+=last.nodes;queries++;
  lower=Math.max(lower,last.lower);upper=Math.min(upper,last.upper);
  if(last.complete||last.threshold_answer==='unresolved'||options.shouldStop?.())break;
 }while(upper-lower>(options.tolerance??(options.progressive?0.01:0.002))&&queries<32);
 return {...last,lower,upper,nodes:totalNodes,threshold_queries:queries,elapsed_ms:performance.now()-start};
}
