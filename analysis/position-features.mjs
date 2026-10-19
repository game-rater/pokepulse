// Public temporal evaluation facade: collect native facts, then score them.
// Approximate features never create search certificates.
import {observationKey} from './observation-key.mjs';
import {featureCachesFor} from './feature-cache.mjs';
import {probeNativePosition} from './native-feature-probes.mjs';
import {scoreTemporalFeatures} from './temporal-feature-model.mjs';
export function nativePositionFeatures(state,options={}){
 const caches=featureCachesFor(options),{values}=caches;
 const observed=observationKey(state),key=observed+'|probe-reuse:'+Number(options.featureProbeReuse!==false),cached=values.get(key);if(cached!==undefined)return cached;
 if(options.shouldStop?.()||performance.now()>(options.deadline??Infinity))return null;
 const facts=probeNativePosition(state,options,key,observed,caches);if(!facts)return null;
 const result=scoreTemporalFeatures(facts);values.set(key,result);return result;
}
export function nativePositionValue(b,options={}){
 const [p,q]=b.sides.map(s=>s.active[0]);if(p.hp<=0)return 0;if(q.hp<=0)return 1;if(b.ended)return b.winner==='Player'?1:0;
 return nativePositionFeatures({saved:b.toJSON()},options)?.value??null;
}
