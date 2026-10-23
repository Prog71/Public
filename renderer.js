const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// P5-A Step 3: fuzzy search — every query char must appear in the name, in order
// (e.g. "ff" matches "Firefox"), case-insensitive, allowing letters to be
// interleaved with spaces/punctuation.
function fuzzyMatch(query, name) {
  if (!query) return true;
  const n = String(name || '').toLowerCase();
  const q = String(query).toLowerCase();
  let qi = 0;
  for (let i = 0; i < n.length && qi < q.length; i++) {
    if (n[i] === q[qi]) qi++;
  }
  return qi === q.length;
}
let apps = [], favs = [], tools = [], toolApps = [], view = 'apps', items = [], sel = -1, editingToolId = null, toolToDelete = null, recent = [], focusedColumn = null;
const COLS = 6;

// ---- P3: layout preferences (local JSON only, never gsettings) ----
let prefs = { layoutMode: 'standard', showPinned: true, showSearch: true, showToolsTab: true, iconSize: 'medium', windowAnchor: 'bottom-left', showHeaderText: true };
function applyPrefs(){
  const L = $('#launcher');
  L.classList.toggle('layout-compact', prefs.layoutMode === 'compact');
  L.classList.toggle('hide-pinned', !prefs.showPinned);
  L.classList.toggle('hide-search', !prefs.showSearch);
  L.classList.toggle('hide-tools', !prefs.showToolsTab);
  L.classList.toggle('no-header-text', !prefs.showHeaderText);
  const grid = $('#grid');
  L.classList.remove('icons-small', 'icons-medium', 'icons-large');
  L.classList.add('icons-' + (prefs.iconSize || 'medium'));
  const map = [['pref-show-pinned', prefs.showPinned], ['pref-show-search', prefs.showSearch], ['pref-show-tools', prefs.showToolsTab]];
  for (const [id, v] of map) { const c = document.getElementById(id); if (c) c.checked = !!v; }
  const ht = document.getElementById('pref-show-header-text'); if (ht) ht.checked = !!prefs.showHeaderText;
  document.querySelectorAll('#seg-layout button').forEach(b => b.classList.toggle('active', b.dataset.layout === prefs.layoutMode));
  document.querySelectorAll('#seg-icons button').forEach(b => b.classList.toggle('active', b.dataset.icons === prefs.iconSize));
  const ar = document.querySelector('input[name="window-anchor"][value="' + (prefs.windowAnchor || 'bottom-left') + '"]'); if (ar) ar.checked = true;
  if (!prefs.showToolsTab && view === 'tools') setView('apps'); // hidden tab can't stay active
}
// P5-A Step 1: apply the anchor geometry main.js computed (authoritative on Wayland).
function applyAnchor(g){
  if (!g) return;
  const L = $('#launcher');
  L.classList.add('anchored');
  L.style.setProperty('--panel-left', (g.dx || 0) + 'px');
  L.style.setProperty('--panel-top', (g.dy || 0) + 'px');
}
if (window.api && window.api.onAnchor) window.api.onAnchor(applyAnchor);
async function loadPrefs(){ try { const p = await window.api.getPrefs(); if (p) { delete p.showRecommended; prefs = { ...prefs, ...p }; } } catch (e) {} applyPrefs(); }
function persistPrefs(){ try { const clean = { ...prefs }; delete clean.showRecommended; window.api.savePrefs(clean); } catch (e) {} }
// P3 polish Fix 4: paint real avatar, or styled initial fallback
async function loadUser(){
  try {
    const u = await window.api.getUser();
    if (!u) return;
    const name = (u.user || 'User');
    $('#user-name').textContent = name.charAt(0).toUpperCase() + name.slice(1);
    if (u.avatar) { $('#user-avatar').innerHTML = `<img src="${u.avatar}" alt="">`; }
    else { $('#user-avatar').textContent = name.charAt(0).toUpperCase(); }
  } catch (e) {}
}

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
  recent = await window.api.getRecent(); 
  render(); 
  $('#search').focus(); 
}

function setView(v){
  if (v === 'tools' && !prefs.showToolsTab) v = 'apps'; // hidden Tools tab can't activate
  view = v; sel = -1; focusedColumn = null; // fresh selection per view — avoids stale index launching the wrong entry
  $('#tab-apps').classList.toggle('active', v === 'apps');
  $('#tab-tools').classList.toggle('active', v === 'tools');
  $('#launcher').classList.toggle('tools-mode', v === 'tools');
  // P3 prefs win over view defaults: hidden-by-pref stays hidden
  $('#favs').style.display = (v === 'apps' && prefs.showPinned) ? 'flex' : 'none'; // PINNED column: Apps view only
  $('#recommended-container').style.display = v === 'apps' ? 'flex' : 'none'; // RECOMMENDED: Apps only, Standard mode only (Compact hides via CSS)
  syncConsoleTab(); // tuck the console drawer away outside the Tools tab
  render();
  $('#search').focus(); // keep DOM focus in search so Enter always means "launch", never "re-click tab"
}

function render(){
  const q = $('#search').value.trim().toLowerCase();
  const favList = $('#fav-list'), grid = $('#grid');
  favList.innerHTML = ''; grid.innerHTML = ''; items = [];
  if (view === 'apps'){
    $('#grid-title').innerHTML = 'All Applications <span style="color:#5c5c63;font-weight:400;text-transform:none;letter-spacing:0">(right-click to pin)</span>';
    apps.filter(a => favs.includes(a.id) && fuzzyMatch(q, a.name)).forEach(a => {
      const row = document.createElement('div'); row.className = 'fav-row'; row.tabIndex = 0;
      row.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<span></span>') + `<span>${esc(a.name)}</span>`;
      row.onclick = () => activateEntry({ app: a });
      row.oncontextmenu = (e) => ctxMenuApp(e, a);
      favList.appendChild(row); items.push({el:row, app:a, zone:'fav'});
    });
    apps.filter(a => !favs.includes(a.id) && fuzzyMatch(q, a.name)).forEach(a => {
      const card = document.createElement('div'); card.className = 'card'; card.tabIndex = 0;
      card.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<div class="ph">📦</div>') + `<span title="${esc(a.name)}">${esc(a.name)}</span>`;
      card.onclick = () => activateEntry({ app: a });
      card.oncontextmenu = (e) => ctxMenuApp(e, a);
      card.dataset.letter = (a.name || '?').trim().charAt(0).toUpperCase(); // P2 Step 4: letter-group anchor
      grid.appendChild(card); items.push({el:card, app:a, zone:'grid'});
    });
    renderRecommended(q); // P4: Recommended column (Apps view only)
  } else {
    clearRecommended(); // P4: Recommended is Apps-only — drop its rows so no stale recents linger in the DOM
    $('#grid-title').textContent = 'System Tools';
    tools.forEach(t => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<div class="ph">${t.emoji || '🛠️'}</div><span>${t.name}</span>
        <div class="tool-actions">
          <button class="action-btn btn-edit" title="Edit">✏️</button>
          <button class="action-btn btn-del" title="Delete">🗑️</button>
        </div>`;
      card.onclick = (e) => { if (!e.target.closest('.action-btn')) { activateEntry({ app: t, tool: true }); } }; // Click to run
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

// ---- P4: Recommended column (recent launches) ----
// Rendered only in the Apps view; filtered by the same query as the other columns.
// Empties the Recommended column without leaving stale rows behind (used by the Tools view).
function clearRecommended(){
  const recBox = document.getElementById('recommended-container');
  const recTitle = recBox.querySelector('.side-title');
  recBox.innerHTML = '';
  recBox.appendChild(recTitle);
}

function renderRecommended(q){
  const recBox = document.getElementById('recommended-container');
  const recTitle = recBox.querySelector('.side-title');
  recBox.innerHTML = '';
  recBox.appendChild(recTitle);
  $('#rec-clear').onclick = (e) => { e.stopPropagation(); window.api.clearRecent(); refresh(); };
  const shown = recent.filter(it => fuzzyMatch(q, String(it.name || '')));
  if (shown.length === 0) {
    const ph = document.createElement('div');
    ph.className = 'rec-placeholder';
    ph.textContent = q ? 'No matching recent apps' : 'No recent apps yet';
    recBox.appendChild(ph);
    return;
  }
  shown.forEach(function(item) {
      var row = document.createElement('div');
      row.className = 'rec-row';
      row.tabIndex = 0;
      var imgEl;
      if (item.type === 'tool') {
        imgEl = document.createElement('div');
        imgEl.className = 'ph';
        imgEl.textContent = esc(item.icon);
      } else if (item.icon) {
        imgEl = document.createElement('img');
        imgEl.src = 'file://' + item.icon;
        imgEl.alt = '';
      } else {
        imgEl = document.createElement('div');
        imgEl.className = 'ph';
        imgEl.textContent = '📦';
      }
      row.appendChild(imgEl);
      var nameEl = document.createElement('span');
      nameEl.textContent = item.name;
      row.appendChild(nameEl);
      row.onclick = (function(it) {
        return function() {
          activateEntry({ app: it, tool: it.type === 'tool' });
        };
      })(item);
      row.oncontextmenu = (function(it) {
        return function(e) { ctxMenuRec(e, it); };
      })(item);
      recBox.appendChild(row);
      items.push({el: row, app: item, zone: 'rec', tool: item.type === 'tool'});
    });
}

// P5: one activation path for every entry (Pinned / All Apps / Recommended).
// Recent items only carry {id,name,icon,type} — resolve the live app/tool record
// first, otherwise a recent tool would be run as `bash -c undefined`.
function activateEntry(entry){
  if (!entry) return;
  if (entry.addCard) { entry.addCard.onclick(); return; }
  const it = entry.app;
  if (!it) return;
  if (entry.tool){
    const tool = tools.find(t => t.id === it.id);
    if (!tool) return;
    window.api.recordLaunch({ id: tool.id, name: tool.name, icon: tool.emoji, type: 'tool' });
    window.api.runTool(tool);
  } else {
    const app = apps.find(a => a.id === it.id);
    if (!app) return; // stale recent entry (app uninstalled) — nothing to launch
    window.api.recordLaunch({ id: app.id, name: app.name, icon: app.icon, type: 'app' });
    window.api.launch(app);
  }
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
    ? '<div id="ctx-rm-fav" style="color:#ff6b6b">★ Unpin from Launcher</div>' 
    : '<div id="ctx-add-fav">☆ Pin to Launcher</div>';
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

function ctxMenuRec(e, item) {
  e.preventDefault();
  const ctx = document.getElementById('ctx');
  ctx.innerHTML = '<div id="ctx-rm-rec" style="color:#ff6b6b">Remove from list</div>';
  ctx.classList.remove('hidden');
  ctx.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  ctx.style.top = Math.min(e.clientY, window.innerHeight - 50) + 'px';
  document.getElementById('ctx-rm-rec').onclick = () => {
    window.api.removeFromRecent(item.id);
    ctx.classList.add('hidden');
    refresh();
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
  toolApps.filter(a => fuzzyMatch(q, a.name)).forEach(a => {
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

// P5: pure arrow-navigation math over the 3-column `items` array.
// Layout: fav [0..favEnd) | grid [favEnd..gridEnd) | rec [gridEnd..end)
// Returns the new selection index, or -1 to stay put.
function navIndex(key, sel, zone, favCount, gridCount, recCount){
  const favEnd = favCount;
  const gridEnd = favCount + gridCount;
  const recEnd = favCount + gridCount + recCount;
  let i = sel;
  if (key === 'ArrowDown'){
    if (zone === 'fav'){
      if (sel + 1 < favEnd) return sel + 1;                                       // next pinned
      if (gridCount > 0) return favEnd;                                           // first of All Apps
      if (recCount > 0) return favEnd;                                            // first of Recommended
      return sel;                                                                 // nothing else to move to
    }
    if (zone === 'rec') return (sel + 1 < recEnd) ? sel + 1 : recEnd - 1;      // next recommended
    if (gridCount === 0) return sel;                                           // no All Apps column
    return Math.min(sel + COLS, gridEnd - 1);                                   // down in All Apps
  }
  if (key === 'ArrowUp'){
    if (zone === 'fav') return Math.max(sel - 1, 0);                            // up in pinned
    if (zone === 'rec'){
      if (gridCount > 0) return (sel - 1 < gridEnd) ? gridEnd - 1 : sel - 1;   // up in recommended, else last All Apps
      if (favCount > 0) return favEnd - 1;                                     // no All Apps — last pinned
      return sel;                                                             // only Recommended exists
    }
    if (gridCount === 0) return sel;                                            // no All Apps column
    if (sel - COLS < favEnd) return favCount > 0 ? favEnd - 1 : sel;           // up in All Apps, else last pinned
    return sel - COLS;
  }
  if (key === 'ArrowRight'){
    if (zone === 'fav'){
      if (recCount === 0) return sel;                                           // no Recommended — stay put
      return gridEnd + Math.min(sel, recCount - 1);                             // same row in Recommended
    }
    if (zone === 'rec'){
      if (gridCount === 0) return sel;
      const recRow = sel - gridEnd;                                             // row within Recommended (0-based)
      return favEnd + Math.min(recRow * COLS, gridCount - 1);                    // same row in All Apps
    }
    return Math.min(sel + 1, gridEnd - 1);                                      // right in All Apps
  }
  if (key === 'ArrowLeft'){
    if (zone === 'fav') return Math.max(sel - 1, 0);                            // left in pinned
    if (zone === 'rec'){
      if (favCount === 0) return sel;
      const recRow = sel - gridEnd;                                             // row within Recommended (0-based)
      return Math.min(recRow, favCount - 1);                                    // same row in Pinned
    }
    if (recCount === 0) return Math.max(sel - 1, favEnd);                      // no Recommended — step left
    const gridRow = Math.floor((sel - favEnd) / COLS);                          // row within All Apps grid
    return gridEnd + Math.min(gridRow, recCount - 1);                           // same row in Recommended
  }
  return i;
}

// A text field owns its own keys — but the MAIN search box is the exception:
// the launcher keeps DOM focus there on open, so ArrowUp/Down must still drive
// the grid selection and Enter must still launch it. Every other text field
// lives inside a modal (modal search, tool name/exec/emoji) and keeps its keys.
function isTypingField(t){
  if (!t) return false;
  if (t.id === 'search') return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

window.addEventListener('keydown', e => {
  // Escape: close the topmost open modal, otherwise hide the launcher
  if (e.key === 'Escape') {
    const sm = $('#settings-modal');
    if (sm && !sm.classList.contains('hidden')) { toggleSettings(false); return; }
    const dm = $('#delete-modal');
    if (dm && !dm.classList.contains('hidden')) { toolToDelete = null; dm.classList.add('hidden'); return; }
    const am = $('#add-tool-modal');
    if (am && !am.classList.contains('hidden')) { am.classList.add('hidden'); return; }
    window.api.hide();
    return;
  }

  if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)) {
    // Never steal arrow keys from a text field (modal search / tool name / exec / emoji)
    if (isTypingField(e.target)) return;
    e.preventDefault();

    const active = document.activeElement;
    const colEls = [$('#favs'), $('#recommended-container'), $('#all-apps-container')];

    // If a column container has focus, reset selection to first item in that column.
    // An empty column must NOT claim the focused zone — navIndex() would then be
    // called with a zone that has no items and compute a negative index.
    if (colEls.includes(active)) {
      const zone = active.id === 'favs' ? 'fav' : active.id === 'recommended-container' ? 'rec' : 'grid';
      const zoneItems = items.filter(it => it.zone === zone);
      if (zoneItems.length === 0) { focusedColumn = null; return; } // empty column — nothing to move to
      focusedColumn = zone;
      const idx = items.indexOf(zoneItems[0]);
      setSel(idx);
      items[idx].el.focus();
      return;
    }
    focusedColumn = null;

    if (!items.length) return;
    if (sel < 0) { setSel(0); return; }

    const favCount = items.filter(x => x.zone === 'fav').length;
    const gridCount = items.filter(x => x.zone === 'grid').length;
    const recCount = items.filter(x => x.zone === 'rec').length;
    const curZone = focusedColumn || items[sel].zone;
    setSel(navIndex(e.key, sel, curZone, favCount, gridCount, recCount));
    return;
  }

  if (e.key === 'Tab') {
    // Modals own their own focus order — never hijack Tab while one is open,
    // otherwise their buttons/inputs become unreachable by keyboard.
    if (document.querySelector('#add-tool-modal:not(.hidden), #delete-modal:not(.hidden), #settings-modal:not(.hidden)')) {
      return; // let the browser move focus natively inside the modal
    }
    e.preventDefault();
    const active = document.activeElement;
    const sections = [
      $('#search'),
      $('#tab-tools'),
      $('#tab-apps'),
      $('#close'),
      $('#favs'),
      $('#recommended-container'),
      $('#all-apps-container'),
      $('#btn-files'),
      $('#btn-settings'),
      $('#btn-suspend'),
      $('#btn-restart'),
      $('#btn-poweroff'),
      $('#btn-logout')
    ].filter(Boolean);
    // Only visible sections take part in the tab ring
    const visible = sections.filter(s => s.offsetParent !== null);
    if (!visible.length) return;
    let curIdx = visible.indexOf(active);
    if (curIdx < 0) {
      // Focus is on a card/row inside a section — fall back to that section's own position
      const owner = active && active.closest ? active.closest('#favs,#recommended-container,#all-apps-container') : null;
      if (owner) curIdx = visible.indexOf(owner);
    }
    let nextIdx;
    if (e.shiftKey) nextIdx = (curIdx <= 0) ? visible.length - 1 : curIdx - 1;
    else nextIdx = (curIdx < 0 || curIdx === visible.length - 1) ? 0 : curIdx + 1;
    visible[nextIdx].focus();
    return;
  }

  if (e.key === 'Enter') {
    // Enter inside a text field belongs to the field (submit the modal form),
    // not to the launcher — never launch an app while the user is typing.
    if (isTypingField(e.target)) return;
    e.preventDefault();
    if (sel >= 0 && items[sel]) {
      activateEntry(items[sel]);
      return;
    }
    const active = document.activeElement;
    // If focused element is a button, trigger its click (handles tabs, bottom bar, close, settings, etc.)
    if (active && active.tagName === 'BUTTON') { active.click(); return; }
    // Fallback: launch first item
    activateEntry(items[0]);
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
// P5-A Step 1: Window Position radios — instant reposition + persist
document.querySelectorAll('input[name="window-anchor"]').forEach(r => r.onchange = () => { prefs.windowAnchor = r.value; applyPrefs(); persistPrefs(); if (window.api.setAnchor) window.api.setAnchor(r.value); });
// P5-A Step 2: Show Header Text checkbox
const htc = document.getElementById('pref-show-header-text'); if (htc) htc.onchange = () => { prefs.showHeaderText = htc.checked; applyPrefs(); persistPrefs(); };
for (const [id, key] of [['pref-show-pinned','showPinned'],['pref-show-search','showSearch'],['pref-show-tools','showToolsTab']]){
  const c = document.getElementById(id);
  if (c) c.onchange = () => { prefs[key] = c.checked; applyPrefs(); setView(view); persistPrefs(); };
}
document.addEventListener('click', (e) => { const m = $('#settings-modal'); if (m && !m.classList.contains('hidden') && !e.target.closest('#settings-modal') && !e.target.closest('#btn-settings')) m.classList.add('hidden'); });

(async () => { await loadPrefs(); await loadUser(); await refresh(); })();
