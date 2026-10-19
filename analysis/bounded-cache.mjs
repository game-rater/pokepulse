// FIFO lookup caches with Map compatibility. Graphs with linked edges keep
// their own eviction lifecycle; this class never owns native battle objects.
let nextId=0;
export class BoundedCache extends Map{
 constructor({name,owner,limit,keyVersion=1}){
  super();
  if(!name||!owner||!Number.isInteger(limit)||limit<1)throw Error('Cache needs a name, owner and positive integer limit');
  this.id=++nextId;this.name=name;this.owner=owner;this.limit=limit;this.keyVersion=keyVersion;
  this.metrics={hits:0,misses:0,writes:0,evictions:0,deletes:0,clears:0};
  this.lastInvalidation=null;
 }
 get(key){
  this.metrics[super.has(key)?'hits':'misses']++;
  return super.get(key);
 }
 set(key,value){
  this.metrics.writes++;super.set(key,value);
  while(this.size>this.limit)this.evict(this.keys().next().value);
  return this;
 }
 evict(key){const removed=super.delete(key);if(removed)this.metrics.evictions++;return removed;}
 delete(key){const removed=super.delete(key);if(removed)this.metrics.deletes++;return removed;}
 clear(reason='explicit-clear'){super.clear();this.metrics.clears++;this.lastInvalidation=reason;}
 snapshot(){return {id:this.id,name:this.name,owner:this.owner,key_version:this.keyVersion,limit:this.limit,size:this.size,
  policy:'fifo',...this.metrics,last_invalidation:this.lastInvalidation};}
}
// External callers may still supply ordinary Maps (e.g. continuation policies).
export function putCached(cache,key,value,limit){
 cache.set(key,value);
 while(cache.size>limit){const oldest=cache.keys().next().value;if(cache.evict)cache.evict(oldest);else cache.delete(oldest);}
 return value;
}
