const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const score=n=>Number.isFinite(n)?`${Math.round(n)}%`:'Not recorded';
const status={slp:'Asleep',psn:'Poisoned',tox:'Badly poisoned',brn:'Burned',par:'Paralyzed',frz:'Frozen'};
const stat={atk:'Attack',def:'Defense',spa:'Sp. Attack',spd:'Sp. Defense',spe:'Speed',accuracy:'Accuracy',evasion:'Evasion'};
const moveLine=(label,moves)=>`${esc(label)}: ${moves.length?moves.map(m=>`${esc(m.move)} (${m.matches_last_move?'inferred move':'PP decreased'})`).join(', '):'Move not established'}`;
export function historyMarkup(history){
 if(!history.entries.length)return '<div class="empty"><h2>No recent battle decisions yet</h2><p>Keep PokéPulse running during a battle, then return here.</p></div>';
 return history.entries.slice().sort((a,b)=>Number(b.complete)-Number(a.complete)).map(e=>`<article class="entry ${e.review?'review':''}">
 <header><div><span class="eyebrow">BATTLE ${esc(e.battle)} · ${e.turn===null?'OBSERVATION':`TURN ${esc(e.turn+1)}`}</span><h2>${esc(e.player)} vs ${esc(e.opponent)}</h2></div><time>${esc(new Date(e.at).toLocaleTimeString())}</time></header>
 <p class="moves">${moveLine('You',e.player_moves)}<br>${moveLine('Opponent',e.opponent_moves)}</p>
 <p class="odds">Recorded outlook: <strong>${score(e.before_score)}</strong> → <strong>${score(e.after_score)}</strong></p>
 ${e.review?`<section class="finding"><h3>Review this decision: ${esc(e.review.move)}</h3><ul>${e.review.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>${e.review.alternatives?.length?`<p>Other available moves to compare: ${e.review.alternatives.map(esc).join(', ')}.</p>`:''}<p class="small">${esc(e.review.evidence)}</p></section>`:''}
 ${e.changes.length?`<details open><summary>What changed</summary><ul>${e.changes.map(c=>`<li>${c.side==='player'?'Your':'Opponent’s'} ${esc(stat[c.label]||c.label)}: ${esc(status[c.before]||c.before)} → ${esc(status[c.after]||c.after)}</li>`).join('')}</ul></details>`:''}
 ${e.notes.map(n=>`<p class="note">${esc(n)}</p>`).join('')}
 </article>`).join('');
}
export function historyDocument(history,{live=false}={}){
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PokéPulse · Recent battle history</title>
 <style>body{margin:0;background:#101813;color:#ecf3ed;font:16px/1.55 system-ui}main{max-width:850px;margin:auto;padding:28px 20px}h1{font-size:30px;margin:12px 0}h2{font-size:20px;margin:5px 0}h3{font-size:17px}a{color:#91e89a}button{background:#253d2b;border:1px solid #64976e;color:inherit;border-radius:8px;padding:9px 15px;font:inherit;cursor:pointer}.toolbar{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.eyebrow{font-size:12px;letter-spacing:.09em;color:#a8c3ad}.intro,.small,.note{color:#b8c9bd}.small,time{font-size:13px}.entry{background:#19251d;border:1px solid #344a3b;border-radius:12px;margin:18px 0;padding:20px}.entry header{display:flex;justify-content:space-between;gap:16px}.review{border-color:#c9a158}.finding{background:#332c1c;border-radius:8px;padding:12px 16px}.finding h3{margin-top:0}li{margin:5px 0}.odds{border-top:1px solid #344a3b;padding-top:12px}.empty{padding:30px 0}summary{cursor:pointer}.error{color:#ffc3a6}</style>
 <main><div class="toolbar"><strong class="eyebrow">POKÉPULSE</strong>${live?'<a href="/">Back to meter</a><button id="refresh" type="button">Refresh</button><button id="save" type="button">Save history</button>':'<span>Saved review</span>'}</div>
 <h1>Recent battle history</h1><p class="intro">Recent ${esc(Math.round(history.window_seconds/60))} minutes while the reader is running. Review decisions, observed effects and the outlook recorded at the time.</p>
 <p class="small">${esc(history.explanation)} Other available moves are suggestions to compare, not a claim that they would have won.</p><p id="coverage" class="small">${history.omitted_decisions?`Showing the latest ${esc(history.entries.length)} of ${esc(history.total_decisions)} recent decisions.`:''}</p><p id="status" role="status" class="small"></p><div id="entries">${historyMarkup(history)}</div></main>
 ${live?'<script type="module" src="/history-app.mjs"></script>':''}</html>`;
}
