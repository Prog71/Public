const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let apps = [], favs = [], tools = [], toolApps = [], view = 'apps', items = [], sel = -1, editingToolId = null, toolToDelete = null;
const COLS = 6;

// ---- P3: layout preferences (local JSON only, never gsettings) ----
let prefs = { layoutMode: 'standard', showPinned: true, showRecommended: true, showSearch: true, showToolsTab: true, iconSize: 'medium' };
function applyPrefs(){
  const L = $('#launcher');
  L.classList.toggle('layout-compact', prefs.layoutMode === 'compact');
  L.classList.toggle('hide-pinned', !prefs.showPinned);
  L.classList.toggle('hide-recommended', !prefs.showRecommended);
  L.classList.toggle('hide-search', !prefs.showSearch);
  L.classList.toggle('hide-tools', !prefs.showToolsTab);
  const grid = $('#grid');
  grid.classList.remove('icons-small', 'icons-medium', 'icons-large');
  grid.classList.add('icons-' + (prefs.iconSize || 'medium'));
  const map = [['pref-show-pinned', prefs.showPinned], ['pref-show-recommended', prefs.showRecommended], ['pref-show-search', prefs.showSearch], ['pref-show-tools', prefs.showToolsTab]];
  for (const [id, v] of map) { const c = document.getElementById(id); if (c) c.checked = !!v; }
  document.querySelectorAll('#seg-layout button').forEach(b => b.classList.toggle('active', b.dataset.layout === prefs.layoutMode));
  document.querySelectorAll('#seg-icons button').forEach(b => b.classList.toggle('active', b.dataset.icons === prefs.iconSize));
  if (!prefs.showToolsTab && view === 'tools') setView('apps'); // hidden tab can't stay active
}
async function loadPrefs(){ try { const p = await window.api.getPrefs(); if (p) prefs = { ...prefs, ...p }; } catch (e) {} applyPrefs(); }
function persistPrefs(){ try { window.api.savePrefs(prefs); } catch (e) {} }

window.api.onShow(() => {
  // Persist tasks (tab + console session), reset entry (stale search, leftover modals):
  $('#search').value = '';
  $('#add-tool-modal').classList.add('hidden');
  $('#delete-modal').classList.add('hidden');
  $('#ctx').classList.add('hidden');
  editingToolId = null; toolToDelete = null;
  $('#backdrop').classList.add('open'); $('#launcher').classList.add('open'); refresh();
});
window.api.onHide(() => { $('#backdrop').classList.remove('open'); $('#launcher').classList.remove('open'); });

$('#backdrop').onclick = () => window.api.hide();

let outLines = [], outCur = '', consoleOpen = false, consoleRunning = false;
function paintConsole(){ const pre = $('#console-out'); pre.textContent = outLines.join('\n') + (outCur ? (outLines.length ? '\n' : '') + outCur : ''); pre.scrollTop = pre.scrollHeight; }
function syncConsoleTab(){
  $('#console').classList.toggle('tab-hidden', view !== 'tools'); // tuck away outside Tools; tool keeps running
  if (view !== 'tools') { $('#console').classList.remove('expanded'); $('#console-expand').textContent = '⤢'; } // leaving Tools restores original size
  const dot = $('#tab-tools-dot');
  dot.classList.toggle('hidden', !consoleOpen);
  dot.classList.toggle('running', consoleRunning);
}
window.api.onToolStart(n => { consoleOpen = true; consoleRunning = true; outLines = []; outCur = ''; $('#console').classList.add('open'); $('#console-out').textContent = ''; $('#console-title').textContent = n; $('#console-status').textContent = 'running…'; syncConsoleTab(); });
window.api.onToolOutput(t => { for (const c of t){ if (c === '\n'){ outLines.push(outCur); outCur = ''; } else if (c === '\r'){ outCur = ''; } else outCur += c; } paintConsole(); });
window.api.onToolEnd(c => { consoleRunning = false; $('#console-status').textContent = (c === 0 ? '✓ finished' : ' exit ' + c); syncConsoleTab(); });
$('#console-close').onclick = () => { window.api.toolClose(); consoleOpen = false; $('#console').classList.remove('open'); syncConsoleTab(); };
$('#console-clear').onclick = () => { outLines = []; outCur = ''; paintConsole(); };
$('#console-expand').onclick = () => { const on = $('#console').classList.toggle('expanded'); $('#console-expand').textContent = on ? '⤡' : '⤢'; };

async function refresh(){ 
  apps = await window.api.getApps(); 
  favs = await window.api.getFavs(); 
  tools = await window.api.getTools(); 
  toolApps = await window.api.getToolApps(); 
  render(); 
  $('#search').focus(); 
}

function setView(v){
  if (v === 'tools' && !prefs.showToolsTab) v = 'apps'; // hidden Tools tab can't activate
  view = v; sel = -1; // fresh selection per view — avoids stale index launching the wrong entry
  $('#tab-apps').classList.toggle('active', v === 'apps');
  $('#tab-tools').classList.toggle('active', v === 'tools');
  $('#launcher').classList.toggle('tools-mode', v === 'tools');
  // P3 prefs win over view defaults: hidden-by-pref stays hidden
  $('#favs').style.display = (v === 'apps' && prefs.showPinned) ? 'flex' : 'none'; // PINNED column: Apps view only
  $('#recommended-container').style.display = (v === 'apps' && prefs.showRecommended) ? 'flex' : 'none'; // RECOMMENDED: Apps only — Tools gets the full panel width
  syncConsoleTab(); // tuck the console drawer away outside the Tools tab
  render();
  $('#search').focus(); // keep DOM focus in search so Enter always means "launch", never "re-click tab"
}

function render(){
  const q = $('#search').value.trim().toLowerCase();
  const favList = $('#fav-list'), grid = $('#grid');
  favList.innerHTML = ''; grid.innerHTML = ''; items = [];
  if (view === 'apps'){
    $('#grid-title').innerHTML = 'All Applications <span style="color:#5c5c63;font-weight:400;text-transform:none;letter-spacing:0">(right-click to favorite)</span>';
    apps.filter(a => favs.includes(a.id) && (!q || a.name.toLowerCase().includes(q))).forEach(a => {
      const row = document.createElement('div'); row.className = 'fav-row';
      row.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<span></span>') + `<span>${esc(a.name)}</span>`;
      row.onclick = () => window.api.launch(a);
      row.oncontextmenu = (e) => ctxMenuApp(e, a);
      favList.appendChild(row); items.push({el:row, app:a, zone:'fav'});
    });
    apps.filter(a => !favs.includes(a.id) && (!q || a.name.toLowerCase().includes(q))).forEach(a => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<div class="ph">📦</div>') + `<span title="${esc(a.name)}">${esc(a.name)}</span>`;
      card.onclick = () => window.api.launch(a);
      card.oncontextmenu = (e) => ctxMenuApp(e, a);
      card.dataset.letter = (a.name || '?').trim().charAt(0).toUpperCase(); // P2 Step 4: letter-group anchor
      grid.appendChild(card); items.push({el:card, app:a, zone:'grid'});
    });
  } else {
    $('#grid-title').textContent = 'System Tools';
    tools.forEach(t => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<div class="ph">${t.emoji || '🛠️'}</div><span>${t.name}</span>
        <div class="tool-actions">
          <button class="action-btn btn-edit" title="Edit">✏️</button>
          <button class="action-btn btn-del" title="Delete">🗑️</button>
        </div>`;
      card.onclick = (e) => { if (!e.target.closest('.action-btn')) window.api.runTool(t); }; // Click to run
      card.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); openEditModal(t); };
      card.querySelector('.btn-del').onclick = (e) => { 
        e.stopPropagation(); 
        toolToDelete = t; 
        $('#delete-msg').textContent = 'Delete ' + t.name + '?'; 
        $('#delete-modal').classList.remove('hidden'); 
      };
      grid.appendChild(card); items.push({el:card, app:t, zone:'grid', tool:true});
    });
    const addCard = document.createElement('div'); addCard.className = 'card add-tool-card';
    addCard.innerHTML = `<div class="ph" style="font-size:30px">➕</div><span>Add Tool</span>`;
    addCard.onclick = () => openAddModal();
    grid.appendChild(addCard); items.push({el:addCard, app:null, addCard:addCard, zone:'grid'});
  }
  if (sel >= items.length) sel = -1; // search/shrink can orphan the index — drop it so Enter falls back to items[0]
  paintJumpers();
  setSel(-1);
}

// ---- P2 Step 4: A-Z letter jumpers (Apps view only; hidden in Tools view) ----
function paintJumpers(){
  const bar = document.querySelector('#jumpers');
  if (!bar) return;
  if (view !== 'apps') { bar.innerHTML = ''; bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const present = new Set([...document.querySelectorAll('#grid .card')].map(c => c.dataset.letter).filter(Boolean));
  bar.innerHTML = '';
  for (let c = 65; c <= 90; c++) {
    const L = String.fromCharCode(c);
    const s = document.createElement('span');
    s.textContent = L;
    if (!present.has(L)) { s.classList.add('dim'); }
    else { s.onclick = () => jumpToLetter(L); }
    bar.appendChild(s);
  }
  highlightJumper();
}

function jumpToLetter(L){
  const target = [...document.querySelectorAll('#grid .card')].find(c => c.dataset.letter === L);
  if (target) { target.scrollIntoView({block:'start'}); highlightJumper(L); }
}

function highlightJumper(force){
  const bar = document.querySelector('#jumpers');
  if (!bar || !bar.children.length) return;
  let cur = force;
  if (!cur) {
    const grid = document.querySelector('#grid');
    const top = grid.scrollTop;
    cur = [...document.querySelectorAll('#grid .card')].reverse().find(c => c.offsetTop - grid.offsetTop <= top + 8)?.dataset.letter;
  }
  [...bar.children].forEach(s => s.classList.toggle('lit', s.textContent === cur));
}

document.querySelector('#grid')?.addEventListener('scroll', () => requestAnimationFrame(() => highlightJumper()), {passive:true});

function ctxMenuApp(e, app) {
  e.preventDefault();
  const ctx = document.getElementById('ctx');
  const isFav = favs.includes(app.id);
  ctx.innerHTML = isFav 
    ? '<div id="ctx-rm-fav" style="color:#ff6b6b">★ Remove from Favorites</div>' 
    : '<div id="ctx-add-fav">☆ Add to Favorites</div>';
  ctx.classList.remove('hidden');
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  ctx.style.top = Math.min(e.clientY, window.innerHeight - 50) + 'px';
  const action = isFav ? document.getElementById('ctx-rm-fav') : document.getElementById('ctx-add-fav');
  action.onclick = () => {
    if (isFav) favs = favs.filter(id => id !== app.id);
    else favs.push(app.id);
    window.api.setFavs(favs);
    ctx.classList.add('hidden');
    render();
  };
}

function openEditModal(t) {
  editingToolId = t ? t.id : null;
  $('#tool-name').value = t ? t.name : ''; 
  $('#tool-exec').value = t ? t.exec : ''; 
  $('#tool-emoji').value = t ? (t.emoji || '🛠️') : '🛠️';
  $('#edit-inputs').classList.remove('hidden');
  $('#modal-apps-view').classList.add('hidden'); 
  $('#modal-script-view').classList.add('hidden');
  $('#add-tool-modal').classList.remove('hidden');
}

function openAddModal() {
  editingToolId = null;
  $('#edit-inputs').classList.add('hidden');
  $('#add-tool-modal').classList.remove('hidden');
  $('#mode-app').click(); 
  renderModalApps('');
}

function renderModalApps(query) {
  const grid = $('#modal-apps-grid');
  grid.innerHTML = '';
  const q = query.toLowerCase();
  toolApps.filter(a => !q || a.name.toLowerCase().includes(q)).forEach(a => {
    const card = document.createElement('div'); card.className = 'modal-app-card';
    card.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<div style="font-size:30px"></div>') + `<span>${esc(a.name)}</span>`;
    card.onclick = () => {
      window.api.addTool({ name: a.name, exec: a.path, emoji: '️', mode: 'launch' });
      $('#add-tool-modal').classList.add('hidden');
      refresh();
    };
    grid.appendChild(card);
  });
}

$('#mode-app').onclick = () => {
  $('#mode-app').classList.add('active'); $('#mode-script').classList.remove('active');
  $('#modal-apps-view').classList.remove('hidden'); $('#modal-script-view').classList.add('hidden');
  renderModalApps($('#modal-search').value);
};
$('#mode-script').onclick = () => {
  $('#mode-script').classList.add('active'); $('#mode-app').classList.remove('active');
  $('#modal-script-view').classList.remove('hidden'); $('#modal-apps-view').classList.add('hidden');
};
$('#modal-search').addEventListener('input', (e) => renderModalApps(e.target.value));

$('#btn-browse').onclick = async () => {
  const t = await window.api.importScript();
  if (t) { $('#add-tool-modal').classList.add('hidden'); refresh(); }
};
$('#close-modal').onclick = () => $('#add-tool-modal').classList.add('hidden');

$('#save-tool').onclick = () => {
  if (editingToolId) {
    const t = tools.find(x => x.id === editingToolId);
    if(t) { t.name = $('#tool-name').value; t.exec = $('#tool-exec').value; t.emoji = $('#tool-emoji').value; window.api.updateTool(t); }
    $('#edit-inputs').classList.add('hidden');
    $('#add-tool-modal').classList.add('hidden');
    refresh();
  }
};

$('#confirm-delete').onclick = () => {
  if (toolToDelete) { window.api.deleteTool(toolToDelete.id); toolToDelete = null; $('#delete-modal').classList.add('hidden'); refresh(); }
};
$('#cancel-delete').onclick = () => { toolToDelete = null; $('#delete-modal').classList.add('hidden'); };

function setSel(i){
  if (sel >= 0 && items[sel]) items[sel].el.classList.remove('sel');
  sel = i;
  if (sel >= 0 && items[sel]) { items[sel].el.classList.add('sel'); items[sel].el.scrollIntoView({block:'nearest'}); }
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ $('#add-tool-modal').classList.add('hidden'); $('#delete-modal').classList.add('hidden'); const sm = $('#settings-modal'); if (sm) sm.classList.add('hidden'); window.api.hide(); e.preventDefault(); return; }
  if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();
    if (!items.length) return;
    if (sel < 0) { setSel(0); return; }

    const favCount = items.filter(x => x.zone === 'fav').length;
    let i = sel;
    const inFav = i < favCount;

    if (e.key === 'ArrowDown') {
      if (inFav) { i = (i + 1 < favCount) ? i + 1 : favCount; } // Down in fav, or jump to grid
      else { i = Math.min(i + COLS, items.length - 1); } // Down in grid
    }
    else if (e.key === 'ArrowUp') {
      if (inFav) { i = Math.max(i - 1, 0); } // Up in fav
      else { i = (i - COLS < favCount) ? favCount - 1 : i - COLS; } // Up in grid, or jump to last fav
    }
    else if (e.key === 'ArrowRight') {
      if (inFav) { i = favCount; } // Jump to start of grid
      else { i = Math.min(i + 1, items.length - 1); } // Right in grid
    }
    else if (e.key === 'ArrowLeft') {
      if (inFav) { i = Math.max(i - 1, 0); } // Left in fav
      else { i = (i % COLS === 0) ? favCount - 1 : i - 1; } // Left in grid, or jump to last fav
    }
    setSel(i);
    return;
  }
  if (e.key === 'Enter'){
    e.preventDefault();
    if (sel >= 0 && items[sel]) {
      const it = items[sel];
      if (it.addCard) { it.addCard.onclick(); return; } // ➕ card: open Add Tool modal
      if (it.tool) { window.api.runTool(it.app); } else { window.api.launch(it.app); }
      return;
    }
    const active = document.activeElement;
    if (active && (active.id === 'tab-apps' || active.id === 'tab-tools')) { active.click(); return; }
    const it = items[0];
    if (it) { it.tool ? window.api.runTool(it.app) : window.api.launch(it.app); }
  }
});

document.addEventListener('click', (e) => { if(!e.target.closest('#ctx')) document.getElementById('ctx').classList.add('hidden'); });

$('#tab-apps').tabIndex = 0;
$('#tab-apps').onclick = () => setView('apps');
$('#tab-tools').tabIndex = 0;
$('#tab-tools').onclick = () => setView('tools');
$('#close').onclick = () => window.api.hide();
$('#search').addEventListener('input', () => render());

// ---- P3: bottom bar + layout control wiring ----
function toggleSettings(force){
  const m = $('#settings-modal');
  const show = force !== undefined ? force : m.classList.contains('hidden');
  m.classList.toggle('hidden', !show);
  if (show) applyPrefs(); // re-sync control states on open
}
$('#btn-settings').onclick = (e) => { e.stopPropagation(); toggleSettings(); };
$('#settings-close').onclick = () => toggleSettings(false);
$('#btn-files').onclick = () => window.api.openFiles();
$('#btn-suspend').onclick = () => window.api.suspend();
$('#btn-restart').onclick = () => window.api.restart();
$('#btn-poweroff').onclick = () => window.api.poweroff();
$('#btn-logout').onclick = () => window.api.logout();
document.querySelectorAll('#seg-layout button').forEach(b => b.onclick = () => { prefs.layoutMode = b.dataset.layout; applyPrefs(); persistPrefs(); });
document.querySelectorAll('#seg-icons button').forEach(b => b.onclick = () => { prefs.iconSize = b.dataset.icons; applyPrefs(); persistPrefs(); });
for (const [id, key] of [['pref-show-pinned','showPinned'],['pref-show-recommended','showRecommended'],['pref-show-search','showSearch'],['pref-show-tools','showToolsTab']]){
  const c = document.getElementById(id);
  if (c) c.onchange = () => { prefs[key] = c.checked; applyPrefs(); setView(view); persistPrefs(); };
}
document.addEventListener('click', (e) => { const m = $('#settings-modal'); if (m && !m.classList.contains('hidden') && !e.target.closest('#settings-modal') && !e.target.closest('#btn-settings')) m.classList.add('hidden'); });

(async () => { await loadPrefs(); await refresh(); })();
