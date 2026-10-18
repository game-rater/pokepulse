import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {historyMarkup,historyDocument} from '../run-bun/history-view.mjs';

// Execute the browser controller with real renderers and controlled browser I/O.
// This tests requests, events, retries and downloads; it does not measure layout.
const source=readFileSync(new URL('../run-bun/history-app.mjs',import.meta.url),'utf8').replace(/^import .+\r?\n/,'');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function history(player='Wooper'){
 return {window_seconds:600,explanation:'Observed effects',entries:[{battle:1,turn:0,at:0,player,opponent:'Rattata',complete:true,
  player_moves:[],opponent_moves:[],before_score:90,after_score:0,notes:[],changes:[],battle_events:[{text:'Hyper Fang critically hit.',unfavorable:true}]}]};
}
function browser(){
 const nodes=Object.fromEntries(['entries','status','refresh','coverage','save'].map(id=>[id,{listeners:{},writes:0,addEventListener(type,fn){this.listeners[type]=fn;},set innerHTML(value){this.html=value;this.writes++;},get innerHTML(){return this.html;}}]));
 const requests=[],intervals=[],timeouts=[],downloads=[],blobs=[],revoked=[];
 const document={hidden:false,listeners:{},getElementById:id=>nodes[id],addEventListener(type,fn){this.listeners[type]=fn;},createElement(){return {click(){downloads.push({href:this.href,download:this.download});}};}};
 runInNewContext(source,{document,historyMarkup,historyDocument,AbortSignal,Blob,Date,
  fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,resolve,reject})),
  URL:{createObjectURL(blob){blobs.push(blob);return 'blob:test';},revokeObjectURL(url){revoked.push(url);}},
  setInterval(fn,ms){intervals.push({fn,ms});},setTimeout(fn,ms){timeouts.push({fn,ms});}});
 const reply=async(data,ok=true)=>{requests.at(-1).resolve({ok,json:async()=>data});await tick();};
 return {nodes,document,requests,intervals,timeouts,downloads,blobs,revoked,reply};
}

test('History fetch prevents overlapping requests, updates coverage and avoids rewriting unchanged entries',async()=>{
 const b=browser();assert.equal(b.nodes.refresh.disabled,true);assert.equal(b.requests[0].url,'/api/history');assert.equal(b.requests[0].options.cache,'no-store');
 b.nodes.refresh.listeners.click();assert.equal(b.requests.length,1);
 await b.reply(history());assert.equal(b.nodes.refresh.disabled,false);assert.match(b.nodes.entries.html,/Hyper Fang critically hit/);
 const writes=b.nodes.entries.writes;b.nodes.refresh.listeners.click();await b.reply({...history(),omitted_decisions:4,total_decisions:5});
 assert.equal(b.nodes.entries.writes,writes);assert.match(b.nodes.coverage.textContent,/latest 1 of 5/);
 b.nodes.refresh.listeners.click();await b.reply(history('Mew'));assert.equal(b.nodes.entries.writes,writes+1);assert.match(b.nodes.entries.html,/Mew/);
});

test('Failed history refresh retains the displayed review, re-enables Refresh and can recover',async()=>{
 const b=browser();await b.reply(history());const displayed=b.nodes.entries.html;
 for(const fail of [()=>b.requests.at(-1).reject(Error('offline')),()=>b.requests.at(-1).resolve({ok:false}),()=>b.requests.at(-1).resolve({ok:true,json:async()=>{throw Error('partial JSON');}})]){
  b.nodes.refresh.listeners.click();fail();await tick();
  assert.equal(b.nodes.entries.html,displayed);assert.equal(b.nodes.refresh.disabled,false);assert.equal(b.nodes.status.className,'error');
 }
 b.nodes.refresh.listeners.click();await b.reply(history('Mew'));assert.equal(b.nodes.status.className,'small');assert.match(b.nodes.entries.html,/Mew/);
});

test('Hidden pages pause polling, visibility resumes it, and Save exports the latest escaped review',async()=>{
 const b=browser();b.nodes.save.listeners.click();assert.match(b.nodes.status.textContent,/Refresh/);assert.equal(b.downloads.length,0);
 await b.reply(history('<script>unsafe</script>'));assert.equal(b.intervals[0].ms,5000);
 b.document.hidden=true;b.intervals[0].fn();assert.equal(b.requests.length,1);
 b.document.hidden=false;b.document.listeners.visibilitychange();assert.equal(b.requests.length,2);await b.reply(history('<script>latest</script>'));
 b.nodes.save.listeners.click();assert.equal(b.downloads.length,1);assert.match(b.downloads[0].download,/^Pokepulse-battle-history-.*\.html$/);
 const saved=await b.blobs[0].text();assert.match(saved,/&lt;script&gt;latest/);assert.ok(!saved.includes('<script>latest'));assert.ok(!saved.includes('src="/history-app.mjs"'));
 assert.equal(b.timeouts[0].ms,1000);b.timeouts[0].fn();assert.deepEqual(b.revoked,['blob:test']);
});
