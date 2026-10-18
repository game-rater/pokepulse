import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export class BattleRecorder {
 constructor({directory,now=Date.now,maxAgeMs=600000,maxBytes=16*1024*1024,maxEvents=15000,metadata={}}){
  Object.assign(this,{directory,now,maxAgeMs,maxBytes,maxEvents,metadata});
  this.events=[];this.bytes=0;this.stateId=0;this.eventId=0;this.previous=null;this.previousResult=null;this.lastReport=null;
  this.stateContexts=new Map();
 }
 append(kind,data){
  const event={id:++this.eventId,at:this.now(),state_id:this.stateId,kind,...structuredClone(data)};
  const bytes=Buffer.byteLength(JSON.stringify(event));
  if(bytes>this.maxBytes)return;
  this.events.push({event,bytes});this.bytes+=bytes;this.prune();return event;
 }
 prune(){
  const cutoff=this.now()-this.maxAgeMs;
  while(this.events.length&&(this.bytes>this.maxBytes||this.events.length>this.maxEvents||this.events[0].event.at<cutoff))this.bytes-=this.events.shift().bytes;
  const referenced=new Set(this.events.map(e=>e.event.state_id));referenced.add(this.stateId);
  for(const id of this.stateContexts.keys())if(!referenced.has(id))this.stateContexts.delete(id);
 }
 recordState(snapshot){
  const changes=[];
  const diff=(a,b,path='')=>{
   if(JSON.stringify(a)===JSON.stringify(b))return;
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],path?`${path}.${key}`:key);
   }else changes.push({path,before:a??null,after:b??null});
  };
  if(this.previous)diff(this.previous,snapshot);
  this.stateId++;this.previous=structuredClone(snapshot);this.previousResult=null;
  const event=this.append('battle-state',{snapshot,changes});
  if(event)this.stateContexts.set(this.stateId,event);
 }
 recordResult(result,stateId=this.stateId){
  const estimate={victory:result.victory,display_score:result.display_score,display_score_kind:result.display_score_kind,
   pending:!!result.pending,refining:!!result.refining,outlook:result.outlook,warnings:result.warnings};
  const old=this.previousResult;
  if(old&&Number.isFinite(old.display_score)&&Number.isFinite(estimate.display_score)&&Math.abs(old.display_score-estimate.display_score)>=20){
   this.append('review-flag',{reason:'Large estimate change for the same observed state; may be normal refinement.',before:old.display_score,after:estimate.display_score});
  }
  this.append('estimate',{state_id:stateId,estimate});this.previousResult=structuredClone(estimate);
 }
 recordDisplay(display){this.append('display',{state_id:Number.isInteger(display.state_id)&&display.state_id>=0&&display.state_id<=this.stateId?display.state_id:this.stateId,display});}
 status(){this.prune();return {retained_events:this.events.length,retained_bytes:this.bytes,window_seconds:this.maxAgeMs/1000,current_state_id:this.stateId,last_report:this.lastReport};}
 async save({note='',source='api'}={}){
  this.prune();
  const events=this.events.map(e=>structuredClone(e.event));
  const states=new Set(events.filter(e=>e.kind==='battle-state').map(e=>e.state_id));
  const referenced=new Set(events.map(e=>e.state_id));referenced.add(this.stateId);
  for(const id of referenced){const context=this.stateContexts.get(id);if(context&&!states.has(id))events.push({...structuredClone(context),context_only:true});}
  events.sort((a,b)=>a.id-b.id);
  const id=new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8);
  const directory=join(this.directory,id);await mkdir(directory,{recursive:true});
  const report={schema_version:1,saved_at:this.now(),source,note,metadata:this.metadata,
   limitations:['Observed state changes are not confirmed turn boundaries or a record of every selected move.','Estimate jumps are review candidates, not proof of a bug.','No video, keyboard recording, ROM, save file, or raw emulator RAM is included.'],
   retention:{max_age_ms:this.maxAgeMs,max_bytes:this.maxBytes},events};
  const reportPath=join(directory,'report.json');
  await writeFile(reportPath,JSON.stringify(report,null,2),{flag:'wx'});
  await writeFile(join(directory,'note.txt'),note||'Describe what looked wrong here.\n');
  const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows=events.filter(e=>e.kind!=='display').map(e=>{
   const text=e.kind==='battle-state'?e.changes.map(c=>`${c.path}: ${JSON.stringify(c.before)} → ${JSON.stringify(c.after)}`).join('; '):e.kind==='estimate'?`Display ${e.estimate.display_score??'--'}%; bounds ${e.estimate.outlook?.lower_bound??'--'}–${e.estimate.outlook?.upper_bound??'--'}%; pass ${e.estimate.outlook?.refinement_pass??'--'}`:e.reason||JSON.stringify(e.tracking||{});
   return `<tr><td>${escape(new Date(e.at).toISOString())}</td><td>${e.state_id}</td><td>${escape(e.kind)}</td><td>${escape(text)}</td></tr>`;
  }).join('');
  await writeFile(join(directory,'timeline.html'),`<!doctype html><meta charset="utf-8"><title>PokéPulse bug report</title><style>body{font:15px system-ui;background:#17211c;color:#e7eee9;padding:24px}table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid #405246;vertical-align:top}td:last-child{overflow-wrap:anywhere}</style><h1>PokéPulse bug report</h1><p>${escape(note)}</p><p>Observed states, not confirmed turns. Flagged changes may be normal search refinement. UTC timestamps. Exact display samples are in report.json.</p><table><tr><th>Time</th><th>State</th><th>Event</th><th>Details</th></tr>${rows}</table>`);
  this.lastReport={directory,report_path:reportPath,event_count:events.length,state_count:new Set(events.filter(e=>e.kind==='battle-state').map(e=>e.state_id)).size};
  return this.lastReport;
 }
}
