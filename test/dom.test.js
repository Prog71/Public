// ---- DOM-level tests for P4 (Recommended) + P5 (keyboard nav) ----
// Runs the REAL renderer.js inside headless Chrome against a stubbed window.api.
// Usage: node test/dom.test.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(__dirname, '.tmp');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const apiStub = `
<script>
window.__log = [];
window.__recents = [];
window.__cleared = 0;
window.api = {
  getApps: async () => [
    {id:'a1',name:'Alpha App',icon:''},{id:'a2',name:'Bravo App',icon:''},
    {id:'a3',name:'Charlie App',icon:''},{id:'a4',name:'Delta App',icon:''}
  ],
  getFavs: async () => ['a1'],
  getTools: async () => [{id:'t1',name:'Zeta Tool',emoji:'T',exec:'echo hi',mode:'bash'}],
  getToolApps: async () => [],
  getRecent: async () => window.__recents,
  recordLaunch: (i) => { window.__log.push(['recordLaunch', i.id, i.type]); },
  removeFromRecent: (id) => { window.__log.push(['removeFromRecent', id]); },
  clearRecent: () => { window.__cleared++; window.__log.push(['clearRecent']); },
  launch: (a) => { window.__log.push(['launch', a.id]); },
  runTool: (t) => { window.__log.push(['runTool', t.id, t.exec]); },
  hide: () => {}, toolClose: () => {}, deleteTool: () => {}, updateTool: () => {}, addTool: () => {},
  importScript: async () => null,
  getPrefs: async () => ({layoutMode:'standard',showPinned:true,showSearch:true,showToolsTab:true,iconSize:'medium'}),
  savePrefs: () => {},
  openFiles: () => {}, suspend: () => {}, restart: () => {}, poweroff: () => {}, logout: () => {},
  getUser: async () => ({name:'Tester'}),
  onShow: () => {}, onHide: () => {},
  onToolStart: () => {}, onToolOutput: () => {}, onToolEnd: () => {}
};
</script>
`;

// The driver is a SEPARATE file loaded after renderer.js so it can reach the
// renderer's top-level bindings (items, sel, view, refresh, setView, ...).
const page = html.replace(
  '<script src="renderer.js"></script>',
  apiStub + '\n<script src="renderer.js"></script>\n<script src="driver.js"></script>'
);
fs.writeFileSync(path.join(TMP, 'harness.html'), page);
fs.copyFileSync(path.join(ROOT, 'renderer.js'), path.join(TMP, 'renderer.js'));
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(TMP, 'styles.css'));
fs.copyFileSync(path.join(__dirname, 'driver.js'), path.join(TMP, 'driver.js'));

console.log('Running DOM harness (headless Chrome)...');
const dump = execFileSync('google-chrome', [
  '--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=10000', '--dump-dom',
  'file://' + path.join(TMP, 'harness.html')
], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });

const m = dump.match(/RESULTS:(.*?)<\/title>/s);
if (!m) {
  console.error('NO RESULTS — driver failed. DOM tail:\n' + dump.slice(-2000));
  process.exit(1);
}
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
const results = JSON.parse(dec(m[1]));

let pass = 0, fail = 0;
const expect = (name, actual, wanted) => {
  const ok = JSON.stringify(actual) === JSON.stringify(wanted);
  if (ok) { pass++; console.log('  ok   ' + name); }
  else {
    fail++;
    console.log('  FAIL ' + name + '\n        got:  ' + JSON.stringify(actual) +
                '\n        want: ' + JSON.stringify(wanted));
  }
};
const get = (label) => {
  const r = results.find((r) => r[0] === label);
  return r ? r[1] : '<missing:' + label + '>';
};

console.log('\nP4 — Recommended column');
expect('S1 placeholder when empty', get('S1 placeholder'), 'No recent apps yet');
expect('S1 no rows when empty', get('S1 rows'), 0);
expect('S2 two rows', get('S2 rows'), 2);
expect('S2 names', get('S2 names'), 'Bravo App|Zeta Tool');
expect('S2 placeholder removed', get('S2 placeholder gone'), true);
expect('S3 query filters recents', get('S3 filtered names'), 'Bravo App');
expect('S3 no-match placeholder', get('S3 no-match placeholder'), 'No matching recent apps');
expect('S3 no-match empties grid', get('S3 no-match grid'), 0);

console.log('\nP4 — view scoping');
expect('S4 tools view hides recents', get('S4 tools rows'), 0);
expect('S4 tools display none', get('S4 tools display'), 'none');
expect('S4 tools items are grid only', get('S4 tools zones'), 'grid');
expect('S4 apps view restores recents', get('S4 apps rows'), 2);
expect('S4 apps display flex', get('S4 apps display'), 'flex');

console.log('\nP4/P5 — activation paths');
expect('S5 clearRecent called', get('S5 clearRecent count'), 1);
expect('S6 app click -> recordLaunch+launch',
  get('S6 app click log'), '[["recordLaunch","a2","app"],["launch","a2"]]');
expect('S7 tool click -> recordLaunch+runTool(exec)',
  get('S7 tool click log'), '[["recordLaunch","t1","tool"],["runTool","t1","echo hi"]]');

console.log('\nP5 — keyboard');
expect('S8 Enter on recent tool -> runTool(exec)',
  get('S8 enter on recent tool log'), '[["recordLaunch","t1","tool"],["runTool","t1","echo hi"]]');
expect('S9 Enter on recent app -> launch',
  get('S9 enter on recent app log'), '[["recordLaunch","a2","app"],["launch","a2"]]');
expect('S10 stale recent entry is ignored', get('S10 stale entry launches nothing'), '[]');
expect('S11 selection reset on view switch', get('S11 sel reset on view switch'), '0->-1');
expect('S11 focusedColumn reset', get('S11 focusedColumn reset'), 'null');

console.log('\nP5 — arrow navigation (visual order: PINNED | RECOMMENDED | ALL APPS)');
expect('S12 ArrowDown from Pinned enters All Apps grid',
  get('S12 arrowdown walk'), 'fav>grid>grid>grid');
expect('S12 ArrowRight from Pinned -> Recommended',
  get('S12 right from pinned -> zone'), 'rec');
expect('S12 ArrowLeft from All Apps -> Recommended',
  get('S12 left from grid -> zone'), 'rec');
expect('S12 ArrowLeft from Recommended -> Pinned',
  get('S12 left from rec -> zone'), 'fav');
expect('S12 ArrowRight from Recommended -> All Apps',
  get('S12 right from rec -> zone'), 'grid');
expect('S12 ArrowUp from All Apps -> Pinned',
  get('S12 up from grid -> zone'), 'fav');
expect('S12 focused column selects its first item',
  get('S12 focused column matches container'), 'true');

console.log('\nP5 — Tab ring');
const APPS_RING = ['search', 'tab-tools', 'tab-apps', 'close', 'favs',
  'recommended-container', 'all-apps-container', 'btn-files', 'btn-settings',
  'btn-suspend', 'btn-restart', 'btn-poweroff', 'btn-logout'];
const TOOLS_RING = ['search', 'tab-tools', 'tab-apps', 'close',
  'all-apps-container', 'btn-files', 'btn-settings', 'btn-suspend',
  'btn-restart', 'btn-poweroff', 'btn-logout'];
const ring = (s) => String(s).split('>');
// The observed ring is a rotation of the expected one (it starts on the
// element after the initially-focused one), so compare in cyclic order.
const isRotation = (observed, expected) => {
  const n = expected.length;
  if (observed.length < n) return false;
  const start = observed.indexOf(expected[0]);
  if (start < 0) return false;
  for (let i = 0; i < n; i++) {
    if (observed[start + i] !== expected[i]) return false;
  }
  // the cycle must repeat: the element after the cycle is the first one again
  return observed[start + n] === expected[0];
};
const appsRing = ring(get('S13 apps tab ring'));
const toolsRing = ring(get('S13 tools tab ring'));
expect('S13 apps ring is the visible sections in cyclic order',
  isRotation(appsRing, APPS_RING), true);
expect('S13 apps ring covers every visible section exactly once per cycle',
  new Set(appsRing.slice(0, APPS_RING.length)).size, APPS_RING.length);
expect('S13 tools ring is the visible sections in cyclic order',
  isRotation(toolsRing, TOOLS_RING), true);
expect('S13 tools ring excludes Pinned', toolsRing.includes('favs'), false);
expect('S13 tools ring excludes Recommended',
  toolsRing.includes('recommended-container'), false);
expect('S13 Shift+Tab walks the ring backwards',
  get('S13 shift-tab back'), 'recommended-container>favs>close');

console.log('\nP5 — regression guards');
expect('S14 empty Pinned column leaves selection untouched',
  get('S14 empty pinned column -> sel'), '-1');
expect('S14 empty Pinned column does not claim the focused zone',
  get('S14 empty pinned column -> focusedColumn'), 'null');
expect('S14 empty Recommended column leaves selection untouched',
  get('S14 empty rec column -> sel'), '-1');
expect('S14 empty Recommended column does not claim the focused zone',
  get('S14 empty rec column -> focusedColumn'), 'null');
expect('S14 Tab is not hijacked while a modal is open',
  get('S14 modal tab not hijacked'), 'native');
expect('S14 arrow keys are not stolen from a text input',
  get('S14 arrow in input not hijacked'), 'ok');
expect('S14 Enter in a text input launches nothing',
  get('S14 enter in input launches nothing'), '[]');
expect('S14 Escape closes the Add Tool modal',
  get('S14 escape closes add-tool modal'), 'closed');
expect('S14 Escape closes the Delete modal',
  get('S14 escape closes delete modal'), 'closed');

console.log('\nP5 — the MAIN search box keeps the launcher keys');
expect('S15 Enter in the main search box launches',
  get('S15 enter in main search launches'), '[["recordLaunch","a1","app"],["launch","a1"]]');
expect('S15 ArrowDown in the main search box moves the selection',
  get('S15 arrowdown in main search moves selection'), '0');

console.log('\nP4 — Recommended column');
expect('S16 the Recommended column renders the recents',
  get('S16 recommended renders recents'), 1);
expect('S16 the 🗑️ clear handler survives a re-render',
  get('S16 rec-clear handler survives re-render'), '1');
expect('S16 the Recommended column is cleared in the Tools view',
  get('S16 recommended cleared in tools view'), 0);
expect('S16 the Recommended column leaves no stale rows in the Tools view',
  get('S16 recommended has no stale placeholder rows'), 'clean');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail) {
  console.log('\nDebug output:');
  for (const r of results) console.log('  ' + r[0] + ' = ' + JSON.stringify(r[1]));
}
process.exit(fail ? 1 : 0);

