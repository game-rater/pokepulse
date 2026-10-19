import test from 'node:test';
import assert from 'node:assert/strict';
import {BoundedCache,putCached} from '../analysis/bounded-cache.mjs';
import {createFeatureCaches,featureCachesFor,featureCacheStats,clearFeatureCaches} from '../analysis/feature-cache.mjs';
import {createCompleteBattle} from '../analysis/native-battle.mjs';
import {nativePositionFeatures} from '../analysis/position-features.mjs';
import {mon} from '../scripts/search-benchmark-fixtures.mjs';
const snapshot=()=>({player:mon(['Tackle','Recover','Swords Dance']),opponent:mon(['Tackle'],{spe:30}),field:{}});

test('Bounded lookup cache preserves Map semantics and FIFO eviction with accurate metrics',()=>{
 const c=new BoundedCache({name:'test',owner:'unit',limit:2,keyVersion:3});
 assert.ok(c instanceof Map);assert.equal(c.set('a',false),c);c.set('b',null);
 assert.equal(c.get('a'),false);assert.equal(c.get('b'),null);assert.equal(c.get('missing'),undefined);
 c.set('b',1);c.set('c',2);
 assert.deepEqual([...c],[['b',1],['c',2]],'reads and updates do not promote a FIFO entry');
 const stats=c.snapshot();assert.equal(stats.hits,2);assert.equal(stats.misses,1);assert.equal(stats.writes,4);
 assert.equal(stats.evictions,1);assert.equal(stats.key_version,3);assert.equal(stats.size,2);
 assert.equal(c.delete('b'),true);assert.equal(c.delete('absent'),false);assert.equal(c.snapshot().deletes,1);
 c.clear('mechanics-reloaded');assert.equal(c.size,0);assert.equal(c.snapshot().last_invalidation,'mechanics-reloaded');
 stats.hits=900;assert.equal(c.snapshot().hits,2,'diagnostic snapshots are detached');
});
test('Cache insertion bounds external Maps and validates owned-cache limits',()=>{
 const map=new Map();putCached(map,'a',1,1);assert.equal(putCached(map,'b',2,1),2);assert.deepEqual([...map],[['b',2]]);
 for(const limit of [0,-1,1.5,Infinity])assert.throws(()=>new BoundedCache({name:'bad',owner:'unit',limit}));
});
test('Feature cache owners isolate values and work while repeated observations reuse results',()=>{
 const state=createCompleteBattle(snapshot()),a=createFeatureCaches({owner:'a'}),b=createFeatureCaches({owner:'b'});
 const first=nativePositionFeatures(state,{featureCaches:a});
 assert.equal(nativePositionFeatures(state,{featureCaches:a}),first);
 assert.equal(b.values.size,0);assert.equal(b.profiles.size,0);
 const independent=nativePositionFeatures(state,{featureCaches:b});assert.notEqual(independent,first);assert.deepEqual(independent,first);
 const stats=featureCacheStats(a);assert.equal(stats.caches.values.hits,1);assert.equal(stats.caches.values.misses,1);
 assert.equal(stats.caches.values.owner,'a');assert.equal(stats.caches.profiles.limit,1024);
});
test('Explicit owners override session ownership; direct callers keep a named worker default',()=>{
 const a={},b={},explicit=createFeatureCaches({owner:'explicit'});
 assert.equal(featureCachesFor({session:a}),featureCachesFor({session:a}));
 assert.notEqual(featureCachesFor({session:a}),featureCachesFor({session:b}));
 assert.equal(featureCachesFor({session:a,featureCaches:explicit}),explicit);
 assert.equal(featureCachesFor(),featureCachesFor());assert.equal(featureCachesFor().owner,'worker-default-direct-callers');
});
test('Changed mechanics miss completed values and explicit invalidation clears resumable work',()=>{
 const caches=createFeatureCaches({owner:'changes'}),s=snapshot();
 s.player.build.moves=['Tackle'];
 const first=nativePositionFeatures(createCompleteBattle(s),{featureCaches:caches});
 s.player.current_hp=47;
 const state=createCompleteBattle(s),changed=nativePositionFeatures(state,{featureCaches:caches});
 assert.notEqual(changed.value,first.value);assert.equal(caches.values.snapshot().misses,2);
 assert.ok(caches.damageProbes.snapshot().hits>0,'only eligible capabilities are reused across HP changes');
 clearFeatureCaches(caches,'new-rules');
 for(const name of ['values','profiles','damageProbes']){assert.equal(caches[name].size,0);assert.equal(caches[name].snapshot().last_invalidation,'new-rules');}
 const rebuilt=nativePositionFeatures(state,{featureCaches:caches});assert.notEqual(rebuilt,changed);assert.deepEqual(rebuilt,changed);
});
test('Partial probe work belongs to its owner and resumes without leaking into another owner',()=>{
 const state=createCompleteBattle(snapshot()),a=createFeatureCaches({owner:'sliced'}),b=createFeatureCaches({owner:'fresh'});
 let checks=0;
 assert.equal(nativePositionFeatures(state,{featureCaches:a,shouldStop:()=>++checks>3}),null);
 assert.ok(a.profiles.size>0);assert.equal(a.values.size,0);assert.equal(b.profiles.size,0);
 assert.deepEqual(nativePositionFeatures(state,{featureCaches:a}),nativePositionFeatures(state,{featureCaches:b}));
});
test('Cached and uncached probe modes retain separate value and work keys within one owner',()=>{
 const caches=createFeatureCaches({owner:'mode-check'}),state=createCompleteBattle(snapshot());
 const on=nativePositionFeatures(state,{featureCaches:caches}),off=nativePositionFeatures(state,{featureCaches:caches,featureProbeReuse:false});
 assert.equal(caches.values.size,2);assert.equal(on.value,off.value);assert.deepEqual(on.actions,off.actions);assert.deepEqual(on.lifetime,off.lifetime);
});
