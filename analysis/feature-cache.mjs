// Evaluation-session ownership is explicit. Direct legacy callers without an
// owner retain the old worker-local sharing behavior through a named default.
import {BoundedCache} from './bounded-cache.mjs';
let nextOwner=0;
export function createFeatureCaches({owner=`feature-session-${++nextOwner}`}={}){
 return {owner,
  values:new BoundedCache({name:'temporal-values',owner,limit:1024}),
  profiles:new BoundedCache({name:'native-probe-work',owner,limit:1024}),
  damageProbes:new BoundedCache({name:'native-capability-probes',owner,limit:1024})};
}
const workerDefault=createFeatureCaches({owner:'worker-default-direct-callers'});
export function featureCachesFor(options={}){
 if(options.featureCaches)return options.featureCaches;
 if(options.session)return options.session.featureCaches??=createFeatureCaches();
 return workerDefault;
}
export function featureCacheStats(caches){
 return {owner:caches.owner,caches:Object.fromEntries(['values','profiles','damageProbes'].map(name=>[name,caches[name].snapshot()]))};
}
export function clearFeatureCaches(caches,reason='explicit-feature-invalidation'){
 for(const name of ['values','profiles','damageProbes'])caches[name].clear(reason);
}
