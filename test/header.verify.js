// P5-A Closure Fix 2 verification — capture the live header outerHTML in BOTH
// states (full variant with "Launcher" text, and hidden-text) through the REAL
// applyPrefs() path, exactly like the DOM test harness.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TMP = path.join(__dirname, '.tmp2');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const apiStub = `
<script>
window.__log = []; window.__recents = []; window.__cleared = 0;
window.api = {
  getApps: async () => [{id:'a1',name:'Alpha App',icon:''}],
  getFavs: async () => ['a1'],
  getTools: async () => [],
  getToolApps: async () => [],
  getRecent: async () => [],
  recordLaunch: () => {}, removeFromRecent: () => {}, clearRecent: () => {},
  launch: () => {}, runTool: () => {},
  hide: () => {}, toolClose: () => {}, deleteTool: () => {}, updateTool: () => {}, addTool: () => {},
  importScript: async () => null,
  getPrefs: async () => ({layoutMode:'standard',showPinned:true,showSearch:true,showToolsTab:true,iconSize:'medium'}),
  savePrefs: () => {},
  openFiles: () => {}, suspend: () => {}, restart: () => {}, poweroff: () => {}, logout: () => {},
  getUser: async () => ({name:'Tester'}),
  onShow: () => {}, onHide: () => {}, onToolStart: () => {}, onToolOutput: () => {}, onToolEnd: () => {}
};
</script>
`;

const driver = `
<script>
(async () => {
  const L = document.getElementById('launcher');
  const title = document.querySelector('.title');
  const htc = document.getElementById('pref-show-header-text');
  const cap = () => ({ title_outerHTML: title.outerHTML, launcher_class: L.className, header_text_display: getComputedStyle(document.getElementById('header-text')).display });

  // State 1: default (key missing in getPrefs) -> full variant should be ON
  const state1 = cap();

  // State 2: toggle OFF through the REAL checkbox handler path (onchange -> applyPrefs)
  htc.checked = false;
  htc.dispatchEvent(new Event('change', { bubbles: true }));
  const state2 = cap();

  document.title = 'HEADERRESULTS:' + JSON.stringify([
    ['state1_default_full', state1],
    ['state2_text_hidden', state2]
  ]);
})();
</script>
`;

const page = html.replace(
  '<script src="renderer.js"></script>',
  apiStub + '\n<script src="renderer.js"></script>\n' + driver
);
fs.writeFileSync(path.join(TMP, 'harness.html'), page);
fs.copyFileSync(path.join(ROOT, 'renderer.js'), path.join(TMP, 'renderer.js'));
fs.copyFileSync(path.join(ROOT, 'styles.css'), path.join(TMP, 'styles.css'));

const dump = execFileSync('google-chrome', [
  '--headless', '--disable-gpu', '--no-sandbox',
  '--virtual-time-budget=10000', '--dump-dom',
  'file://' + path.join(TMP, 'harness.html')
], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });

const m = dump.match(/HEADERRESULTS:(.*?)<\/title>/s);
if (!m) { console.error('NO HEADERRESULTS'); process.exit(1); }
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
const rows = JSON.parse(dec(m[1]));
for (const [name, val] of rows) {
  console.log('\n' + name + ':');
  console.log('  launcher class      = ' + val.launcher_class);
  console.log('  .title outerHTML    = ' + val.title_outerHTML);
  console.log('  #header-text display= ' + val.header_text_display);
}