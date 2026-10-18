import {historyMarkup,historyDocument} from './history-view.mjs';
const entries=document.getElementById('entries'),status=document.getElementById('status'),button=document.getElementById('refresh');
let busy=false,last='',latestHistory=null;
async function refresh(){
 if(busy)return;busy=true;button.disabled=true;
 try{
  const response=await fetch('/api/history',{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error('The reader is unavailable.');
  const history=await response.json(),key=JSON.stringify(history.entries);latestHistory=history;
  if(key!==last){entries.innerHTML=historyMarkup(history);last=key;}
  document.getElementById('coverage').textContent=history.omitted_decisions?`Showing the latest ${history.entries.length} of ${history.total_decisions} recent decisions.`:'';
  status.className='small';status.textContent=`Updated ${new Date().toLocaleTimeString()}`;
 }catch{status.className='error';status.textContent='Could not refresh. The history already shown is retained; keep the reader running and try Refresh.';}
 finally{busy=false;button.disabled=false;}
}
button.addEventListener('click',refresh);
document.getElementById('save').addEventListener('click',()=>{
 if(!latestHistory){status.textContent='Refresh the history first.';return;}
 const url=URL.createObjectURL(new Blob([historyDocument(latestHistory)],{type:'text/html;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download=`Pokepulse-battle-history-${new Date().toISOString().replace(/[:.]/g,'-')}.html`;link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
});
setInterval(()=>{if(!document.hidden)refresh();},5000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
refresh();
