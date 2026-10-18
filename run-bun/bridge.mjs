import {readFile,stat,mkdir} from 'node:fs/promises';
import {decodeCapture} from './memory.mjs';
export async function startBridge(directory,maps,catalog,onUpdate,{now=Date.now,interval=100,staleAfter=4000,acceptedRomCrc32=[]}={}) {
 await mkdir(directory,{recursive:true});
 const started=now();let lastRead=started,lastSeen=0,closed=false,busy=false,status='disconnected';
 const publish=value=>{status=value.status;onUpdate({...value,received_at:lastSeen||null});};
 async function poll(){
  if(closed||busy)return;busy=true;
  try {
   const candidates=await Promise.all([0,1].map(async slot=>{
    const path=`${directory}/capture-${slot}.bin`;
    try {const info=await stat(path);return info.mtimeMs>lastRead?{path,time:info.mtimeMs}:null;}catch{return null;}
   }));
   const latest=candidates.filter(Boolean).sort((a,b)=>b.time-a.time)[0];
   if(latest){
    try {
     const buffer=await readFile(latest.path);const decoded=decodeCapture(buffer,maps,catalog,{acceptedRomCrc32});
     lastRead=latest.time;lastSeen=now();publish(decoded);
    }catch(error){
     // Partial packets may be read during file replacement. Retry next poll.
     if(!/Incomplete/.test(error.message)){lastRead=latest.time;lastSeen=now();publish({status:'waiting',message:error.message});}
    }
   }
   if(lastSeen&&now()-lastSeen>staleAfter&&status!=='stale')publish({status:'stale',message:'Emulator paused or disconnected · waiting for fresh data'});
  }finally{busy=false;}
 }
 const timer=setInterval(()=>void poll(),interval);timer.unref();
 return {close(){closed=true;clearInterval(timer);},poll};
}
