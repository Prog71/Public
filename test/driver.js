// Injected into the harness page AFTER renderer.js — has access to the
// renderer's top-level bindings (items, sel, view, focusedColumn, refresh, setView).
(async () => {
  const out = [];
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const recRows = () => $$('#recommended-container .rec-row');
  const recNames = () => recRows().map(r => r.querySelector('span:last-child').textContent);
  const placeholder = () => $('#recommended-container .rec-placeholder')?.textContent || null;
  const key = (k, opts = {}) => document.dispatchEvent(
    new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts)));
  // Real browsers dispatch keydown on the focused element; `document` is only the
  // fallback when nothing is focused. Use this for input/modal focus tests.
  const keyOn = (el, k, opts = {}) => el.dispatchEvent(
    new KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, opts)));
  const reset = () => { window.__log = []; window.__cleared = 0; };

  // The launcher starts closed in CSS; open it so offsetParent checks are honest.
  $('#launcher').classList.add('open');
  $('#backdrop').classList.add('open');

  // ---- S1: no recent apps ----
  window.__recents = [];
  await refresh();
  out.push(['S1 placeholder', placeholder()]);
  out.push(['S1 rows', recRows().length]);

  // ---- S2: recents populated (app + tool) ----
  window.__recents = [
    { id: 'a2', name: 'Bravo App', icon: '', type: 'app' },
    { id: 't1', name: 'Zeta Tool', icon: 'T', type: 'tool' }
  ];
  await refresh();
  out.push(['S2 rows', recRows().length]);
  out.push(['S2 names', recNames().join('|')]);
  out.push(['S2 placeholder gone', placeholder() === null]);

  // ---- S3: search filters Recommended ----
  $('#search').value = 'bravo';
  $('#search').dispatchEvent(new Event('input', { bubbles: true }));
  out.push(['S3 filtered names', recNames().join('|')]);
  $('#search').value = 'zzz';
  $('#search').dispatchEvent(new Event('input', { bubbles: true }));
  out.push(['S3 no-match placeholder', placeholder()]);
  out.push(['S3 no-match grid', $$('#grid .card').length]);
  $('#search').value = '';
  $('#search').dispatchEvent(new Event('input', { bubbles: true }));

  // ---- S4: Recommended is Apps-view only ----
  setView('tools');
  out.push(['S4 tools rows', recRows().length]);
  out.push(['S4 tools display', $('#recommended-container').style.display]);
  out.push(['S4 tools zones', [...new Set(items.map(i => i.zone))].join('|')]);
  setView('apps');
  out.push(['S4 apps rows', recRows().length]);
  out.push(['S4 apps display', $('#recommended-container').style.display]);

  // ---- S5: clear recents ----
  reset();
  $('#rec-clear').click();
  out.push(['S5 clearRecent count', window.__cleared]);

  // ---- S6: click a recent APP row -> recordLaunch + launch ----
  window.__recents = [{ id: 'a2', name: 'Bravo App', icon: '', type: 'app' }];
  await refresh();
  reset();
  recRows()[0].click();
  out.push(['S6 app click log', JSON.stringify(window.__log)]);

  // ---- S7: click a recent TOOL row -> recordLaunch + runTool (with exec!) ----
  window.__recents = [{ id: 't1', name: 'Zeta Tool', icon: 'T', type: 'tool' }];
  await refresh();
  reset();
  recRows()[0].click();
  out.push(['S7 tool click log', JSON.stringify(window.__log)]);

  // ---- S8: Enter on a recent TOOL row -> runTool (keyboard path) ----
  window.__recents = [{ id: 't1', name: 'Zeta Tool', icon: 'T', type: 'tool' }];
  await refresh();
  reset();
  setSel(items.findIndex((i) => i.zone === 'rec'));
  key('Enter');
  out.push(['S8 enter on recent tool log', JSON.stringify(window.__log)]);

  // ---- S9: Enter on a recent APP row -> launch (keyboard path) ----
  window.__recents = [{ id: 'a2', name: 'Bravo App', icon: '', type: 'app' }];
  await refresh();
  reset();
  setSel(items.findIndex((i) => i.zone === 'rec'));
  key('Enter');
  out.push(['S9 enter on recent app log', JSON.stringify(window.__log)]);

  // ---- S10: stale recent entry (app uninstalled) -> no launch ----
  window.__recents = [{ id: 'GONE', name: 'Ghost App', icon: '', type: 'app' }];
  await refresh();
  reset();
  recRows()[0].click();
  out.push(['S10 stale entry launches nothing', JSON.stringify(window.__log)]);

  // ---- S11: switching views resets the selection ----
  setView('apps');
  setSel(0);
  const selBefore = sel;
  setView('tools');
  out.push(['S11 sel reset on view switch', selBefore + '->' + sel]);
  out.push(['S11 focusedColumn reset', String(focusedColumn)]);

  // ---- S12: arrow navigation across the three columns ----
  // Visual order is PINNED | RECOMMENDED | ALL APPS, so horizontal arrows
  // follow that adjacency while ArrowDown walks the All Apps grid.
  setView('apps');
  window.__recents = [
    { id: 'a2', name: 'Bravo App', icon: '', type: 'app' },
    { id: 'a3', name: 'Charlie App', icon: '', type: 'app' }
  ];
  await refresh();

  const zoneOf = () => items[sel]?.zone;

  // ArrowDown from Pinned drops into the All Apps grid and walks it.
  setSel(0);
  const downWalk = [];
  for (let i = 0; i < 4; i++) { downWalk.push(zoneOf()); key('ArrowDown'); }
  out.push(['S12 arrowdown walk', downWalk.join('>')]);

  // ArrowRight from Pinned lands on Recommended (next column to the right).
  setSel(0);
  key('ArrowRight');
  out.push(['S12 right from pinned -> zone', zoneOf()]);

  // ArrowLeft from the All Apps grid lands on Recommended (column to the left).
  setSel(items.findIndex((i) => i.zone === 'grid'));
  key('ArrowLeft');
  out.push(['S12 left from grid -> zone', zoneOf()]);

  // ArrowLeft from Recommended lands on Pinned.
  setSel(items.findIndex((i) => i.zone === 'rec'));
  key('ArrowLeft');
  out.push(['S12 left from rec -> zone', zoneOf()]);

  // ArrowRight from Recommended lands on the All Apps grid.
  setSel(items.findIndex((i) => i.zone === 'rec'));
  key('ArrowRight');
  out.push(['S12 right from rec -> zone', zoneOf()]);

  // ArrowUp from the first All Apps row lands on the last Pinned item.
  setSel(items.findIndex((i) => i.zone === 'grid'));
  key('ArrowUp');
  out.push(['S12 up from grid -> zone', zoneOf()]);

  // Focus a column container and press an arrow -> selects that column's first item.
  $('#recommended-container').focus();
  key('ArrowDown');
  out.push(['S12 focused column -> zone', zoneOf()]);
  out.push(['S12 focused column matches container', String(items[sel]?.zone === 'rec')]);

  // ---- S13: Tab / Shift+Tab ring only includes visible sections ----
  setView('apps');
  $('#search').focus();
  const fwd = [];
  for (let i = 0; i < 30; i++) { key('Tab'); fwd.push(document.activeElement.id); }
  out.push(['S13 apps tab ring', fwd.join('>')]);
  // Shift+Tab: focus a known element first, then step backwards.
  $('#all-apps-container').focus();
  const back = [];
  for (let i = 0; i < 3; i++) { key('Tab', { shiftKey: true }); back.push(document.activeElement.id); }
  out.push(['S13 shift-tab back', back.join('>')]);

  setView('tools');
  $('#search').focus();
  const fwdTools = [];
  for (let i = 0; i < 30; i++) { key('Tab'); fwdTools.push(document.activeElement.id); }
  out.push(['S13 tools tab ring', fwdTools.join('>')]);

  // ---- S14: regressions — empty column, modal Tab/arrow passthrough, Escape ----
  setView('apps');
  window.__recents = [];
  await refresh();

  // Focusing an EMPTY column must not claim the focused zone (it would make
  // navIndex() compute a negative index).
  // A) An EMPTY Pinned column: filter the search so nothing matches at all.
  $('#search').value = 'zzz-no-match';
  $('#search').dispatchEvent(new Event('input', { bubbles: true }));
  setSel(-1);
  $('#favs').focus();
  key('ArrowDown');
  out.push(['S14 empty pinned column -> sel', String(sel)]);
  out.push(['S14 empty pinned column -> focusedColumn', String(focusedColumn)]);

  // B) An EMPTY Recommended column (no recents) while other columns have items.
  $('#search').value = '';
  $('#search').dispatchEvent(new Event('input', { bubbles: true }));
  setSel(-1);
  $('#recommended-container').focus();
  key('ArrowDown');
  out.push(['S14 empty rec column -> sel', String(sel)]);
  out.push(['S14 empty rec column -> focusedColumn', String(focusedColumn)]);

  // Tab must NOT be hijacked while a modal is open.
  $('#add-tool-modal').classList.remove('hidden');
  $('#search').focus();
  const beforeTab = document.activeElement.id;
  key('Tab');
  out.push(['S14 modal tab not hijacked', document.activeElement.id === beforeTab ? 'native' : 'hijacked']);
  $('#add-tool-modal').classList.add('hidden');

  // Arrow keys must not be stolen from a text input.
  const arrowTarget = document.createElement('input');
  document.body.appendChild(arrowTarget);
  arrowTarget.focus();
  setSel(-1);
  keyOn(arrowTarget, 'ArrowDown');
  // The arrow must not move the launcher selection (it would launch the wrong app).
  out.push(['S14 arrow in input not hijacked', sel === -1 && document.activeElement === arrowTarget ? 'ok' : 'hijacked']);
  arrowTarget.remove();

  // Enter inside a text input must NOT launch an app.
  const enterTarget = document.createElement('input');
  document.body.appendChild(enterTarget);
  enterTarget.focus();
  reset();
  keyOn(enterTarget, 'Enter');
  out.push(['S14 enter in input launches nothing', JSON.stringify(window.__log)]);
  enterTarget.remove();

  // Escape must close the Add Tool / Delete modals (HEAD behaviour).
  $('#add-tool-modal').classList.remove('hidden');
  key('Escape');
  out.push(['S14 escape closes add-tool modal', $('#add-tool-modal').classList.contains('hidden') ? 'closed' : 'open']);
  $('#delete-modal').classList.remove('hidden');
  key('Escape');
  out.push(['S14 escape closes delete modal', $('#delete-modal').classList.contains('hidden') ? 'closed' : 'open']);

  // The MAIN search box keeps the launcher's keys: the launcher holds DOM focus
  // there on open, so Enter must launch and arrows must move the selection.
  // (Only the modal text fields keep their own keys.)
  setView('apps');
  await refresh();
  $('#search').focus();
  reset();
  keyOn($('#search'), 'Enter');
  out.push(['S15 enter in main search launches', JSON.stringify(window.__log)]);
  setSel(-1);
  keyOn($('#search'), 'ArrowDown');
  out.push(['S15 arrowdown in main search moves selection', String(sel)]);

  // The Recommended column must survive a re-render with its 🗑️ handler intact
  // (the header node is re-appended on every render — the handler must not be lost).
  window.__recents = [{id:'a2',name:'Bravo App',icon:'',type:'app'}];
  setView('apps');
  await refresh();
  out.push(['S16 recommended renders recents', document.querySelectorAll('.rec-row').length]);
  $('#rec-clear').click();
  out.push(['S16 rec-clear handler survives re-render', String(window.__cleared)]);

  // Switching to the Tools view must clear the Recommended column entirely.
  setView('tools');
  await refresh();
  out.push(['S16 recommended cleared in tools view', document.querySelectorAll('.rec-row').length]);
  out.push(['S16 recommended has no stale placeholder rows',
    document.querySelectorAll('#recommended-container .rec-row').length === 0 ? 'clean' : 'stale']);

  // ---- S17: SINGLE SOURCE OF TRUTH — panel FILLS the window (main.js owns geometry) ----
  // New invariant (P5-A FINAL): the window IS the anchor rectangle and the panel
  // fills it (inset:0), so for EVERY anchor:
  //   1. launcherRect == viewport rect   (±1px)  — panel == window == viewport
  //   2. barRect.bottom <= innerHeight - 2         — bottom bar never clipped
  //   3. #bottom-bar exists + display !== 'none'
  // This is independent of the anchor (the anchor only moves/sizes the WINDOW,
  // which main.js owns), so we assert the fill invariant once and loop over all
  // 7 anchors calling the real applyAnchor to prove it's geometry-blind.
  const ANCHORS = ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','screen-center'];
  const L = document.getElementById('launcher');
  const bb = document.getElementById('bottom-bar');
  const vp = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const results17 = [];
  for (const anchor of ANCHORS) {
    applyAnchor({ anchor, width: vp.w, height: vp.h }); // real (now geometry-blind) path
    const lr = L.getBoundingClientRect();
    const br = bb ? bb.getBoundingClientRect() : null;
    const display = bb ? getComputedStyle(bb).display : null;
    const fillMatch =
      Math.abs(lr.x - vp.x) <= 1 && Math.abs(lr.y - vp.y) <= 1 &&
      Math.abs(lr.width - vp.w) <= 1 && Math.abs(lr.height - vp.h) <= 1;
    results17.push({
      anchor,
      exists: !!bb,
      notHidden: display !== 'none',
      display,
      fillMatch,                       // launcherRect == viewport rect (±1px)
      barBottomOk: br ? (br.bottom <= vp.h - 2) : false,  // barRect.bottom <= innerHeight - 2
      barBottom: br ? Math.round(br.bottom) : null,
      innerH: vp.h,
      launcherRect: { x: Math.round(lr.x), y: Math.round(lr.y), w: Math.round(lr.width), h: Math.round(lr.height) }
    });
  }
  out.push(['S17 bottom-bar anchor matrix', JSON.stringify(results17)]);

  document.title = 'RESULTS:' + JSON.stringify(out);
})();
