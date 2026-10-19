import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {spawnSync} from 'node:child_process';

function browser(){
 const nodes=new Map(),frames=new Map();let now=0,next=0,event;
 const element=()=>({textContent:'',dataset:{},attributes:{},style:{setProperty(){}},classList:{add(){},remove(){},toggle(){}},replaceChildren(){},append(){},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];}});
 const document={body:element(),getElementById(id){if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);},createElement:element};
 document.getElementById('difficulty-number').textContent='—';
 runInNewContext(readFileSync(new URL('../run-bun/live-app.mjs',import.meta.url),'utf8'),{document,location:{search:'',origin:'http://test'},URLSearchParams,
  localStorage:{getItem(){return null;}},addEventListener(){},navigator:{},Date,performance:{now:()=>now},
  EventSource:class{constructor(){event=this;}},setInterval(){},requestAnimationFrame(fn){frames.set(++next,fn);return next;},cancelAnimationFrame(id){frames.delete(id);}});
 const step=time=>{now=time;const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(time);};
 const update=score=>event.onmessage({data:JSON.stringify({tracking:{status:'battle',message:'Connected'},result:{display_score:score,explanations:[],warnings:[],outgoing_moves:[],incoming_moves:[],outlook:{omitted_moves:[]}},pack:{species:[]},live:{}})});
 return {nodes,frames,step,update,disconnect:()=>event.onerror()};
}
const number=b=>b.nodes.get('difficulty-number').textContent;
const fill=b=>parseFloat(b.nodes.get('meter-fill').style.width);

test('Browser first prediction animates its whole-number label and bar together',()=>{
 const b=browser();b.update(80);assert.equal(number(b),'—');
 b.step(0);assert.equal(number(b),'0%');assert.equal(fill(b),0);
 b.step(325);assert.equal(number(b),'70%');assert.equal(fill(b),70);
 assert.equal(b.nodes.get('meter').attributes['aria-valuenow'],'70');
 assert.equal(b.nodes.get('meter').attributes['aria-valuetext'],'70%');
 b.step(650);assert.equal(number(b),'80%');assert.equal(fill(b),80);assert.equal(b.frames.size,0);
});

test('Browser updates retarget the current visible value; repeated targets cannot snap or restart it',()=>{
 const b=browser();b.update(80);b.step(325);const before=fill(b);b.update(80);
 assert.equal(number(b),'70%');assert.equal(b.frames.size,1);
 b.update(20);b.step(325);assert.equal(fill(b),before);assert.equal(number(b),'70%');
 b.step(650);assert.equal(number(b),'26%');assert.ok(fill(b)>20&&fill(b)<before);
 b.step(975);assert.equal(number(b),'20%');assert.equal(fill(b),20);assert.equal(b.frames.size,0);
});

test('Browser resets cancel old animation frames and the next battle starts smoothly',()=>{
 const b=browser();b.update(100);b.step(100);b.disconnect();assert.equal(number(b),'—');assert.equal(b.frames.size,0);
 b.update(60);b.step(100);assert.equal(number(b),'0%');b.step(425);assert.equal(number(b),'53%');b.step(750);assert.equal(number(b),'60%');
 b.update(null);assert.equal(number(b),'—');assert.equal(b.frames.size,0);
});

test('Desktop percentage labels and rails animate through real PowerShell update functions',{skip:process.platform!=='win32'},()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File','test-ground/check-meter-animation.ps1'],{encoding:'utf8',timeout:15000,windowsHide:true});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);assert.match(result.stdout,/PASS: desktop/);
});
