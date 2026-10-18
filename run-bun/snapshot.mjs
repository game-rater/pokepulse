const overlay=new URLSearchParams(location.search).get('overlay')==='1';
if(!overlay){
  const section=document.createElement('section');section.className='privacy-controls controls battle-input';
  section.innerHTML='<h2>Run &amp; Bun battle input</h2><p class="small muted">Load a complete snapshot, or paste one below. An emulator adapter can submit the same JSON to POST /api/snapshot. Nothing here modifies your ROM or save.</p><div class="actions"><button id="load-snapshot">Load current battle</button><button id="apply-snapshot">Apply snapshot</button></div><label for="battle-json">Battle snapshot JSON</label><textarea id="battle-json" rows="12" style="width:100%;background:#101610;color:#edf4ed"></textarea><p id="snapshot-status" role="status"></p>';
  document.querySelector('.tools').before(section);
  document.getElementById('mechanics').disabled=true;
  document.getElementById('import').disabled=true;
  const textarea=document.getElementById('battle-json'),status=document.getElementById('snapshot-status');
  document.getElementById('load-snapshot').onclick=async()=>{const s=await(await fetch('/api/state')).json();textarea.value=JSON.stringify({schema_version:1,game:'run-bun',player:{species:s.player,hp_percent:s.battle.player_hp,build:s.builds.player,effects:s.effects.player},opponent:{species:s.opponent,hp_percent:s.battle.opponent_hp,build:s.builds.opponent,effects:s.effects.opponent},field:s.field},null,2);status.textContent='Current battle loaded. Add taunted, disabled_moves, encore_move, or locked_move under effects.';};
  document.getElementById('apply-snapshot').onclick=async()=>{try{const body=JSON.stringify(JSON.parse(textarea.value));const r=await fetch('/api/snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body});const result=await r.json();if(!r.ok)throw Error(result.error);status.textContent='Snapshot applied. Audience overlay updated.';}catch(e){status.textContent=e.message;}};
}
