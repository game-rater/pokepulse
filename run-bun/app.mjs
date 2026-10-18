const $ = id => document.getElementById(id);
const overlay = new URLSearchParams(location.search).get('overlay') === '1';
if (overlay) document.body.classList.add('overlay');
const privacyKey = 'pokethreat.run-bun.hide-analysis';
function setPrivacy(hidden) {
  // Viewer overlays are independent of the streamer's local visibility preference.
  document.body.classList.toggle('streamer-blind',!overlay && hidden);
  $('hide-analysis').checked = hidden;
  $('privacy-status').textContent = hidden ? 'Analysis hidden here · audience overlay stays on' : 'Analysis visible here';
}
let privacyPreference = false;
try {privacyPreference = localStorage.getItem(privacyKey) === 'true';} catch {}
setPrivacy(privacyPreference);
$('hide-analysis').onchange = event=> {
  setPrivacy(event.target.checked);
  try {localStorage.setItem(privacyKey,String(event.target.checked));} catch {}
};
addEventListener('storage',event=>{if (event.key === privacyKey) setPrivacy(event.newValue === 'true');});
let current;
let busy = false;
let queued = null;
let optionsKey = '';
let displayed = null, animation;
function animateDifficulty(target) {
  cancelAnimationFrame(animation);
  const from = displayed ?? target, start = performance.now();
  const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 650;
  function frame(now) {
    const t = duration ? Math.min(1,(now - start) / duration) : 1;
    displayed = from + (target - from) * (1 - Math.pow(1 - t,3));
    $('difficulty-number').textContent = `${displayed.toFixed(1)} / 100`;
    $('meter-fill').style.width = `${displayed}%`;
    $('threat-card').style.setProperty('--threat',`hsl(${115 * displayed / 100} 78% 63%)`);
    if (t < 1) animation = requestAnimationFrame(frame);
  }
  animation = requestAnimationFrame(frame);
}
function render(state) {
  current = state;
  const {pack,rules,result} = state;
  const player = pack.species.find(p => p.id === state.player), opponent = pack.species.find(p => p.id === state.opponent);
  $('player').value = player.name;$('opponent').value = opponent.name;
  const key = pack.species.map(p => `${p.id}:${p.name}:${p.types.join(',')}`).join('|') + rules.available_types.join(',');
  if (key !== optionsKey) {
    optionsKey = key;
    const options = pack.species.filter(p => p.types.every(t => rules.available_types.includes(t))).sort((a,b) => a.name.localeCompare(b.name));
    $('species').replaceChildren(...options.map(p => {const option = document.createElement('option');option.value = p.name;return option;}));
  }
  for (const [id,p] of [['player-info',player],['opponent-info',opponent]]) {
    $(id).replaceChildren(...p.types.map(t => {const span = document.createElement('span');span.className = 'type';span.textContent = t;return span;}));
    const stats = document.createElement('span');stats.className = 'stat-summary';stats.textContent = ['hp','atk','def','spa','spd','spe'].map(k => `${k.toUpperCase()} ${p.base_stats[k]}`).join(' · ');$(id).append(stats);
  }
  $('matchup').textContent = `${player.name.toUpperCase()}  vs  ${opponent.name.toUpperCase()}`;
  const victory = result.victory ?? 100 - result.difficulty;
  animateDifficulty(victory);
  $('meter').setAttribute('aria-valuenow',victory.toFixed(1));
  $('meter').setAttribute('aria-valuetext',`${victory.toFixed(1)} out of 100 victory outlook; higher is better`);
  for (const side of ['player','opponent']) {
    const id = `${side}-hp`, value = state.battle?.[`${side}_hp`] ?? 100;
    if (document.activeElement !== $(id) && !queued?.battle?.hasOwnProperty(`${side}_hp`)) {
      $(id).value = value;$(`${id}-value`).textContent = `${value}%`;
    }
  }
  $('explanations').replaceChildren(...result.explanations.map(s => {const li = document.createElement('li');li.textContent = s;return li;}));
  $('pack-name').textContent = `${pack.name} · ${pack.species.length} species / forms`;
  $('mechanics').querySelector('option[value="custom"]')?.remove();
  const known = ['classic','modern','gen4','gen5','gen6','gen7','gen8'];
  if (!known.includes(rules.id)) {const option = document.createElement('option');option.value = 'custom';option.textContent = `Custom rules · generation ${rules.generation}`;$('mechanics').append(option);}
  $('mechanics').value = known.includes(rules.id) ? rules.id : 'custom';
  renderBattleControls(state);
}
async function update(input) {
  if (busy) {queued = mergePatch(queued || {},input);return;}
  busy = true;$('error').textContent = '';
  try {
    const response = await fetch('/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
    const data = await response.json();if (!response.ok) throw Error(data.error);render(data);
  } catch(error) {$('error').textContent = error.message;if (current) render(current);}
  finally {busy = false;if (queued) {const next = queued;queued = null;update(next);}}
}
function mergePatch(a,b) {
  const out = {...a};
  for (const [key,value] of Object.entries(b)) out[key] = value && typeof value === 'object' && !Array.isArray(value) ? mergePatch(a[key] || {},value) : value;
  return out;
}
let editorGeneration;
function renderBattleControls(state) {
  if (!state.builds) return;
  if (editorGeneration !== state.rules.generation) {
    editorGeneration = state.rules.generation;
    makeBattleControls(state);
  }
  for (const side of ['player','opponent']) {
    const build = state.builds[side];
    for (const key of ['level','nature','ability','item','status','critical']) {
      const node = $(`${side}-${key}`);
      if (document.activeElement !== node) {if (key === 'critical') node.checked = build[key];else node.value = build[key];}
    }
    for (let i = 0;i < 4;i++) {const node = $(`${side}-move-${i}`);if (document.activeElement !== node) node.value = build.moves[i] || '';}
    for (const stat of ['hp','atk','def','spa','spd','spe']) {
      for (const kind of ['evs','ivs','boosts']) {const node = $(`${side}-${kind}-${stat}`);if (node && document.activeElement !== node) node.value = build[kind][stat];}
      $(`${side}-actual-${stat}`).textContent = state.result.stats?.[side]?.[stat] ?? '—';
    }
    for(const stat of ['accuracy','evasion']){const node=$(`${side}-boosts-${stat}`);if(node&&document.activeElement!==node)node.value=build.boosts[stat]??0;}
    for (const key of ['reflect','light_screen','tailwind']) $(`${side}-field-${key}`).checked = state.field[side][key];
  }
  for (const key of ['weather','terrain','trick_room']) {const node = $(`field-${key}`);if (key === 'trick_room') node.checked = state.field[key];else node.value = state.field[key];}
  $('model-name').textContent = `${state.result.model} · generation ${state.rules.generation} · outlook index, not win %`;
  $('warnings').replaceChildren(...(state.result.warnings || []).map(text=>{const li = document.createElement('li');li.textContent = text;return li;}));
  const report = $('damage-report');report.replaceChildren();
  for (const [heading,rows] of [['Your attacks',state.result.outgoing_moves],['Opponent attacks',state.result.incoming_moves]]) {
    if (!rows) continue;
    const h = document.createElement('h3');h.textContent = heading;report.append(h);
    const table = document.createElement('table');
    const head = document.createElement('tr');for (const title of ['Move','Damage / max HP','Hit chance','KO on hit']) {const th = document.createElement('th');th.textContent = title;head.append(th);}table.append(head);
    for (const row of rows) {const tr = document.createElement('tr');for (const text of [row.name,row.note ? row.note : row.status_move ? 'Status effect unmodeled' : `${row.min_percent.toFixed(1)}–${row.max_percent.toFixed(1)}%`,Number.isFinite(row.effective_accuracy)?`${row.effective_accuracy}%`:'—',row.guaranteed_ko_on_hit ? 'All damage rolls' : row.possible_ko_on_hit ? 'Some rolls' : 'No']) {const td = document.createElement('td');td.textContent = text;tr.append(td);}table.append(tr);}
    report.append(table);
  }
}
function makeBattleControls(state) {
  // Build fixed controls with DOM methods; imported names are always text, never HTML.
  function control(parent,labelText,controlId,options,change) {
    const label = document.createElement('label');label.htmlFor = controlId;label.textContent = labelText;
    const input = document.createElement(options ? 'select' : 'input');input.id = controlId;
    if (options) for (const [value,text] of options) {const option = document.createElement('option');option.value = value;option.textContent = text;input.append(option);}
    input.onchange = ()=>change(input);parent.append(label,input);return input;
  }
  function liveNumber(input) {
    const change = input.onchange;let timer;
    input.onchange = ()=>{clearTimeout(timer);change();};
    input.oninput = ()=>{clearTimeout(timer);if (input.value !== '') timer = setTimeout(()=>{if (input.isConnected) change();},180);};
  }
  const moves = document.createElement('datalist');moves.id = 'battle-moves';
  const ability = document.createElement('datalist');ability.id = 'battle-abilities';
  const items = document.createElement('datalist');items.id = 'battle-items';
  for (const [list,values] of [[moves,state.catalog.moves.map(m=>m.name)],[ability,state.catalog.abilities],[items,state.catalog.items]]) {
    for (const value of values) {const option = document.createElement('option');option.value = value;list.append(option);}
    $(list.id)?.remove();document.body.append(list);
  }
  const gen = state.rules.generation;
  for (const side of ['player','opponent']) {
    const root = $(`${side}-build`);root.replaceChildren();
    const submit = patch=>update({builds:{[side]:patch}});
    const grid = document.createElement('div');grid.className = 'editor-grid';root.append(grid);
    const level = control(grid,'Level',`${side}-level`,null,n=>submit({level:Number(n.value)}));level.type = 'number';level.min = 1;level.max = 100;liveNumber(level);
    control(grid,'Nature',`${side}-nature`,state.catalog.natures.map(n=>[n,n]),n=>submit({nature:n.value}));
    for (const [key,list] of [['ability','battle-abilities'],['item','battle-items']]) {const node = control(grid,key === 'item' ? 'Held item (optional)' : 'Ability (optional)',`${side}-${key}`,null,n=>submit({[key]:n.value.trim()}));node.setAttribute('list',list);node.placeholder = 'None / unknown';}
    control(grid,'Status',`${side}-status`,[['','Healthy'],['brn','Burned'],['par','Paralyzed'],['psn','Poisoned'],['tox','Badly poisoned'],['slp','Asleep'],['frz','Frozen']],n=>submit({status:n.value}));
    const critical = control(grid,'Force critical damage',`${side}-critical`,null,n=>submit({critical:n.checked}));critical.type = 'checkbox';
    const h = document.createElement('h3');h.textContent = 'Moves · up to four';root.append(h);
    for (let i = 0;i < 4;i++) {const node = control(root,`Move ${i + 1}`,`${side}-move-${i}`,null,()=>submit({moves:Array.from({length:4},(_,j)=>$(`${side}-move-${j}`).value.trim()).filter(Boolean)}));node.setAttribute('list','battle-moves');node.placeholder = 'Search a move';}
    const table = document.createElement('table');table.className = 'stat-editor';
    const header = document.createElement('tr');for (const title of ['Stat','Actual¹','EV','IV','Stage']) {const th = document.createElement('th');th.textContent = title;header.append(th);}table.append(header);
    for (const stat of ['hp','atk','def','spa','spd','spe']) {
      const tr = document.createElement('tr');const name = document.createElement('th');name.textContent = stat.toUpperCase();tr.append(name);
      const actual = document.createElement('td');actual.id = `${side}-actual-${stat}`;tr.append(actual);
      for (const kind of ['evs','ivs','boosts']) {
        const td = document.createElement('td');tr.append(td);if (stat === 'hp' && kind === 'boosts') {td.textContent = '—';continue;}
        const input = document.createElement('input');input.type = 'number';input.id = `${side}-${kind}-${stat}`;input.setAttribute('aria-label',`${side} ${stat} ${kind}`);input.min = kind === 'boosts' ? -6 : 0;input.max = kind === 'boosts' ? 6 : kind === 'evs' ? 252 : 31;input.onchange = ()=>submit({[kind]:{[stat]:Number(input.value)}});liveNumber(input);td.append(input);
      }
      table.append(tr);
    }
    for(const stat of ['accuracy','evasion']){const tr=document.createElement('tr'),name=document.createElement('th');name.textContent=stat.toUpperCase();tr.append(name);tr.append(document.createElement('td'),document.createElement('td'),document.createElement('td'));const td=document.createElement('td'),input=document.createElement('input');input.type='number';input.id=`${side}-boosts-${stat}`;input.setAttribute('aria-label',`${side} ${stat} stage`);input.min=-6;input.max=6;input.value=0;input.onchange=()=>submit({boosts:{[stat]:Number(input.value)}});liveNumber(input);td.append(input);tr.append(td);table.append(tr);}
    root.append(table);const note = document.createElement('p');note.className = 'small muted';note.textContent = '¹ Stats before battle boosts. EV total ≤ 510. Accuracy/Evasion stages alter the chance to hit.';root.append(note);
  }
  const field = $('field-editor');field.replaceChildren();
  control(field,'Weather','field-weather',[['','None'],...['Sun','Rain','Sand','Hail','Snow','Harsh Sunshine','Heavy Rain','Strong Winds'].filter(w=>!(w === 'Snow' && gen < 9 || ['Harsh Sunshine','Heavy Rain','Strong Winds'].includes(w) && gen < 6)).map(w=>[w,w])],n=>update({field:{weather:n.value}}));
  const terrain = control(field,'Terrain','field-terrain',[['','None'],...['Electric','Grassy','Psychic','Misty'].map(t=>[t,t])],n=>update({field:{terrain:n.value}}));terrain.disabled = gen < 6;
  const trick = control(field,'Trick Room','field-trick_room',null,n=>update({field:{trick_room:n.checked}}));trick.type = 'checkbox';trick.disabled = gen < 4;
  for (const side of ['player','opponent']) for (const [key,text] of [['reflect','Reflect'],['light_screen','Light Screen'],['tailwind','Tailwind']]) {const node = control(field,`${side === 'player' ? 'Your side' : 'Opponent side'} · ${text}`,`${side}-field-${key}`,null,n=>update({field:{[side]:{[key]:n.checked}}}));node.type = 'checkbox';node.disabled = key === 'tailwind' && gen < 4;}
}
for (const side of ['player','opponent']) $(`${side}-hp`).addEventListener('input',event => {
  const value = Number(event.target.value);
  $(`${side}-hp-value`).textContent = `${value}%`;
  update({battle:{[`${side}_hp`]:value}});
});
$('new-battle').onclick = () => update({battle:{player_hp:100,opponent_hp:100}});
for (const id of ['player','opponent']) $(id).addEventListener('change',() => {
  if (!current) return;
  const p = current.pack.species.find(p => p.name.toLowerCase() === $(id).value.trim().toLowerCase() || p.id === $(id).value.trim().toLowerCase());
  if (!p) {$('error').textContent = 'Select a Pokémon from the search suggestions.';return;}
  update({[id]:p.id});
});
$('swap').onclick = () => current && update({player:current.opponent,opponent:current.player,battle:{player_hp:current.battle.opponent_hp,opponent_hp:current.battle.player_hp},builds:{player:current.builds.opponent,opponent:current.builds.player},field:{...current.field,player:current.field.opponent,opponent:current.field.player}});
$('mechanics').onchange = () => {
  if (!current || $('mechanics').value === 'custom') return;
  const preset = $('mechanics').value;
  const valid = current.pack.species.filter(p => !['classic','gen4','gen5'].includes(preset) || !p.types.includes('Fairy'));
  if (!valid.length) {$('error').textContent = 'No species in this pack support these mechanics.';render(current);return;}
  update({preset,player:valid.some(p => p.id === current.player) ? current.player : valid[0].id,opponent:valid.some(p => p.id === current.opponent) ? current.opponent : valid[0].id});
};
$('copy').onclick = async () => {
  const url = `${location.origin}/?overlay=1`;
  try {await navigator.clipboard.writeText(url);$('copy-status').textContent = 'Overlay URL copied.';}
  catch {$('copy-status').textContent = `Overlay URL: ${url}`;}
};
$('import').onchange = async event => {
  const file = event.target.files[0];if (!file || !current) return;
  try {
    if (file.size > 2500000) throw Error('Import exceeds 2.5 MB.');
    const pack = JSON.parse(await file.text());
    const rules = pack.rules ? {...pack.rules,id:'custom'} : current.rules;
    const first = pack.species?.find(p => p.types?.every(t => rules.available_types.includes(t)));
    if (!first) throw Error('No compatible species found in the pack.');
    await update({pack,rules,player:first.id,opponent:first.id});
  } catch(error) {$('error').textContent = error.message;}
  event.target.value = '';
};
$('reset').onclick = () => update({reset:true,preset:'modern',player:'garchomp',opponent:'weavile'});
const events = new EventSource('/api/events');
events.onmessage = event => {render(JSON.parse(event.data));$('error').textContent = '';$('connection-status').hidden = true;$('threat-card').classList.remove('disconnected');};
events.onerror = () => {$('error').textContent = 'Connection lost. Keep the local server running; reconnecting…';$('connection-status').hidden = false;$('threat-card').classList.add('disconnected');};

