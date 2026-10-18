const $=id=>document.getElementById(id);
const overlay=new URLSearchParams(location.search).get('overlay')==='1';
if(overlay)document.body.classList.add('overlay');
const key='pokethreat.run-bun.hide-analysis';
let hidden=true;
try{hidden=localStorage.getItem(key)!=='false';}catch{}
function privacy(value){hidden=value;$('hide-analysis').checked=value;$('analysis').classList.toggle('analysis-hidden',!overlay&&value);$('privacy-status').textContent=value?'Analysis hidden here · audience overlay stays on':'Analysis visible here';}
privacy(hidden);
$('hide-analysis').onchange=e=>{privacy(e.target.checked);try{localStorage.setItem(key,String(hidden));}catch{}};
addEventListener('storage',e=>{if(e.key===key)privacy(e.newValue!=='false');});
const obs=`${location.origin}/?overlay=1`;$('obs-url').textContent=obs;
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText(obs);$('copy-status').textContent='Copied.';}catch{$('copy-status').textContent=`Copy this URL: ${obs}`;}};
let displayed=null,lastTarget=null,animation,lastEvent=Date.now(),hasLiveData=false;
function clear(message){cancelAnimationFrame(animation);displayed=null;lastTarget=null;hasLiveData=false;$('difficulty-number').textContent='—';$('meter-fill').style.width='0%';$('meter').removeAttribute('aria-valuenow');$('meter').setAttribute('aria-valuetext',message);$('connection-status').textContent=message;$('threat-card').classList.add('paused');$('matchup').textContent='';$('explanations').replaceChildren();$('damage-report').replaceChildren();$('warnings').replaceChildren();}
function animate(target,range=''){
 if(lastTarget!==null&&Math.abs(lastTarget-target)<0.01){$('difficulty-number').textContent=range||`${target.toFixed(1)} / 100`;return;}
 cancelAnimationFrame(animation);const from=displayed??0,start=performance.now();const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:650;lastTarget=target;
 const frame=now=>{const t=duration?Math.min(1,(now-start)/duration):1;displayed=from+(target-from)*(1-(1-t)**3);$('difficulty-number').textContent=range||`${displayed.toFixed(1)} / 100`;$('meter-fill').style.width=`${displayed}%`;$('threat-card').style.setProperty('--threat',`hsl(${115*displayed/100} 78% 63%)`);if(t<1)animation=requestAnimationFrame(frame);};animation=requestAnimationFrame(frame);
}
function list(element,rows){element.replaceChildren(...rows.map(value=>{const li=document.createElement('li');li.textContent=value;return li;}));}
function render(s){
 const t=s.tracking;$('tracking-status').dataset.status=t.status;$('tracking-status').textContent=t.message;
 $('last-update').textContent=t.received_at?`Last memory update: ${new Date(t.received_at).toLocaleTimeString()}`:'No emulator data received yet.';
 if(!s.result||t.status!=='battle'){clear(t.message);return;}
 const score=Object.hasOwn(s.result,'display_score')?s.result.display_score:s.result.victory;
 if(score===null){clear('Outlook unresolved');list($('warnings'),s.result.warnings);return;}
 hasLiveData=true;$('threat-card').classList.remove('paused');$('connection-status').textContent='';
 const label=`${Math.round(score)}%`;
 animate(score,label);$('meter').setAttribute('aria-valuenow',String(Math.round(score)));$('meter').setAttribute('aria-valuetext',label);
 const name=id=>s.pack.species.find(p=>p.id===id)?.name||id;
 $('matchup').textContent=`${name(s.player)} · ${s.live.player?.current_hp??'?'} HP  vs  ${name(s.opponent)} · ${s.live.opponent?.current_hp??'?'} HP`;
 list($('explanations'),s.result.explanations);list($('warnings'),s.result.warnings);
 const sections=[];
 for(const [label,rows] of [['Your moves',s.result.outgoing_moves],['Opponent moves',s.result.incoming_moves]]){const block=document.createElement('div');const heading=document.createElement('h3');heading.textContent=label;const ul=document.createElement('ul');list(ul,rows.map(m=>{if(!m.available)return `${m.name}: ${m.reason}`;if(m.status_move)return `${m.name}: ${s.result.outlook.omitted_moves.includes(m.name)?"not modeled":"included in search"}`;const details=[m.action_note,m.accuracy_note].filter(Boolean).join(' · '),hit=Number.isFinite(m.effective_accuracy)?`${m.effective_accuracy}% hit`:'hit chance unavailable';return `${m.name}: ${m.min}–${m.max} HP · ${hit}${details?` · ${details}`:''}`;}));block.append(heading,ul);sections.push(block);}
 $('damage-report').replaceChildren(...sections);
}
const events=new EventSource('/api/events');
events.onmessage=e=>{try{lastEvent=Date.now();render(JSON.parse(e.data));}catch{clear('Invalid update · waiting for fresh data');}};
events.onerror=()=>{clear('Meter disconnected · reconnecting');$('tracking-status').textContent='Meter disconnected · reconnecting';};
setInterval(()=>{if(hasLiveData&&Date.now()-lastEvent>5000){clear('No fresh update · reconnecting');$('tracking-status').textContent='No fresh update · reconnecting';}},1000);
