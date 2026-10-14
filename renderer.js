const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let apps = [], favs = [], tools = [], view = 'apps', items = [], sel = -1;
const COLS = 6;

window.api.onShow(() => { $('#backdrop').classList.add('open'); $('#launcher').classList.add('open'); refresh(); });
window.api.onHide(() => { $('#backdrop').classList.remove('open'); $('#launcher').classList.remove('open'); });
$('#backdrop').onclick = () => window.api.hide();

let outLines = [], outCur = '';
function paintConsole(){ const pre = $('#console-out'); pre.textContent = outLines.join('\n') + (outCur ? (outLines.length ? '\n' : '') + outCur : ''); pre.scrollTop = pre.scrollHeight; }
window.api.onToolStart(n => { $('#console').classList.add('open'); outLines = []; outCur = ''; paintConsole(); $('#console-title').textContent = n; $('#console-status').textContent = 'running…'; });
window.api.onToolOutput(t => { for (const c of t){ if (c === '\n'){ outLines.push(outCur); outCur = ''; } else if (c === '\r'){ outCur = ''; } else outCur += c; } paintConsole(); });
window.api.onToolEnd(c => { $('#console-status').textContent = (c === 0 ? '✓ finished' : '✗ exit ' + c); });
$('#console-close').onclick = () => { window.api.toolClose(); $('#console').classList.remove('open'); };
$('#console-clear').onclick = () => { outLines = []; outCur = ''; paintConsole(); };

async function refresh(){
  apps = await window.api.getApps();
  favs = await window.api.getFavs();
  tools = await window.api.getTools();
  render(); $('#search').focus();
}

function setView(v){
  view = v;
  document.body.classList.toggle('tools', v === 'tools');
  $('#grid').classList.toggle('tools', v === 'tools');
  $('#tab-apps').classList.toggle('active', v === 'apps');
  $('#tab-tools').classList.toggle('active', v === 'tools');
  render();
}

function render(){
  const q = $('#search').value.trim().toLowerCase();
  const favList = $('#fav-list'), grid = $('#grid');
  favList.innerHTML = ''; grid.innerHTML = ''; items = [];
  if (view === 'apps'){
    $('#grid-title').innerHTML = 'All Applications <span class="hint">(right-click to favorite)</span>';
    apps.filter(a => favs.includes(a.id) && (!q || a.name.toLowerCase().includes(q))).forEach(a => {
      const row = document.createElement('div'); row.className = 'fav-row';
      row.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<span>📦</span>') + `<span>${esc(a.name)}</span>`;
      row.onclick = () => window.api.launch(a);
      row.oncontextmenu = e => ctxMenu(e, a);
      favList.appendChild(row); items.push({el:row, app:a, zone:'fav'});
    });
    apps.filter(a => !favs.includes(a.id) && (!q || a.name.toLowerCase().includes(q))).forEach(a => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = (a.icon ? `<img src="file://${esc(a.icon)}">` : '<div class="ph">📦</div>') + `<span title="${esc(a.name)}">${esc(a.name)}</span>`;
      card.onclick = () => window.api.launch(a);
      card.oncontextmenu = e => ctxMenu(e, a);
      grid.appendChild(card); items.push({el:card, app:a, zone:'grid'});
    });
  } else {
    $('#grid-title').textContent = 'System Tools';
    tools.forEach(t => {
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = (t.iconPath ? `<img src="file://${esc(t.iconPath)}">` : `<div class="ph">${t.emoji || '🧰'}</div>`) + `<span>${t.name}</span>`;
      card.onclick = () => window.api.runTool(t);
      grid.appendChild(card); items.push({el:card, app:t, zone:'grid', tool:true});
    });
  }
  setSel(-1);
}

function setSel(i){
  if (sel >= 0 && items[sel]) items[sel].el.classList.remove('sel');
  sel = i;
  if (sel >= 0 && items[sel]) { items[sel].el.classList.add('sel'); items[sel].el.scrollIntoView({block:'nearest'}); }
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape'){ window.api.hide(); e.preventDefault(); return; }
  if (['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)){
    e.preventDefault();
    if (!items.length) return;
    if (sel < 0){ setSel(0); return; }
    const favCount = items.filter(x => x.zone === 'fav').length;
    let i = sel; const inFav = items[i].zone === 'fav';
    if (e.key === 'ArrowDown') i = inFav ? Math.min(i+1, favCount-1) : Math.min(i+COLS, items.length-1);
    if (e.key === 'ArrowUp')   i = inFav ? Math.max(i-1, 0) : (i-COLS < favCount ? Math.max(favCount-1,0) : i-COLS);
    if (e.key === 'ArrowRight')i = inFav ? favCount : Math.min(i+1, items.length-1);
    if (e.key === 'ArrowLeft') i = inFav ? i : (i-1 < favCount ? Math.max(favCount-1,0) : i-1);
    setSel(i); return;
  }
  if (e.key === 'Enter'){ e.preventDefault(); const it = sel >= 0 ? items[sel] : items[0]; if (it) { it.tool ? window.api.runTool(it.app) : window.api.launch(it.app); } }
});

function ctxMenu(e, app){
  e.preventDefault();
  const ctx = $('#ctx'); const isFav = favs.includes(app.id);
  ctx.innerHTML = `<div>${isFav ? 'Remove from Favorites' : '★ Add to Favorites'}</div>`;
  ctx.classList.remove('hidden');
  ctx.style.left = Math.min(e.clientX, innerWidth - 210) + 'px';
  ctx.style.top = Math.min(e.clientY, innerHeight - 60) + 'px';
  ctx.firstChild.onclick = () => { favs = isFav ? favs.filter(f => f !== app.id) : [...favs, app.id]; window.api.setFavs(favs); ctx.classList.add('hidden'); render(); };
}
window.addEventListener('click', e => { if (!e.target.closest('#ctx')) $('#ctx').classList.add('hidden'); });

$('#tab-apps').onclick = () => setView('apps');
$('#tab-tools').onclick = () => setView('tools');
$('#close').onclick = () => window.api.hide();
$('#search').addEventListener('input', () => render());

(async () => { await refresh(); })();
