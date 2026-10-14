const { app, BrowserWindow, ipcMain, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, execSync } = require('child_process');

const FAV_FILE = path.join(os.homedir(), '.config', 'launcher-favorites.json');
let win = null, isOpen = false, toolProc = null, blurArmed = false;

/* ---------- PLUGIN: TOOL DISCOVERY ---------- */
const TOOL_DIRS = [
  '/usr/share/system-launcher/tools',
  path.join(os.homedir(), '.config', 'system-launcher', 'tools')
];
const BUILTIN_TOOLS = [
  { id: 'health', name: 'System Health', emoji: '🩺', exec: '/usr/local/bin/system-health-check.sh', mode: 'console', order: 10 },
  { id: 'suspend', name: 'Suspend System', emoji: '😴', exec: 'systemctl suspend', mode: 'exec', order: 20 },
  { id: 'update', name: 'Safe Update', emoji: '🔄', exec: '/usr/local/bin/safe-update.sh', mode: 'console', order: 30 }
];
function which(bin) {
  for (const p of (process.env.PATH || '').split(':')) {
    const f = path.join(p, bin);
    try { fs.accessSync(f, fs.constants.X_OK); return f; } catch (e) {}
  }
  return null;
}
function loadTools() {
  const map = new Map();
  for (const t of BUILTIN_TOOLS) map.set(t.id, t);
  for (const dir of TOOL_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (t && t.id && t.exec) map.set(t.id, t);
      } catch (e) { console.log('bad tool file:', f, e.message); }
    }
  }
  let list = [...map.values()];
  list = list.filter(t => !t.requires || t.requires.every(which));
  for (const t of list) t.iconPath = t.icon ? resolveIcon(t.icon) : null;
  return list.sort((a, b) => (a.order || 100) - (b.order || 100) || a.name.localeCompare(b.name));
}

function spawnSafe(cmd, args) {
  try { const p = spawn(cmd, args, { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); } catch (e) {}
}
function send(ch, payload) { if (win) win.webContents.send(ch, payload); }

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: wa.width, height: wa.height, x: wa.x, y: wa.y, show: false,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: true, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.webContents.once('did-finish-load', () => { if (isOpen) send('animate-in'); });
  win.on('closed', () => { win = null; });
  win.on('blur', () => { if (blurArmed) hideWin(); });
}
function showWin() {
  if (!win) createWindow();
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
  try { win.maximize(); } catch (e) {}
  win.show(); win.focus();
  isOpen = true; blurArmed = false;
  setTimeout(() => { blurArmed = true; }, 500);
  send('animate-in');
}
function hideWin() {
  if (!win || !isOpen) return;
  isOpen = false; blurArmed = false;
  send('animate-out');
  setTimeout(() => { if (win && !isOpen) win.hide(); }, 240);
}
function toggleWin() { isOpen ? hideWin() : showWin(); }

function resolveIcon(icon) {
  if (!icon) return null;
  if (icon.startsWith('/')) {
    if (fs.existsSync(icon)) return icon;
    for (const ext of ['.png', '.svg', '.xpm']) if (fs.existsSync(icon + ext)) return icon + ext;
    return null;
  }
  const quick = [
    `/usr/share/icons/hicolor/scalable/apps/${icon}.svg`,
    `/usr/share/icons/hicolor/48x48/apps/${icon}.png`,
    `/usr/share/icons/hicolor/128x128/apps/${icon}.png`,
    `/usr/share/icons/hicolor/256x256/apps/${icon}.png`,
    `/usr/share/icons/hicolor/512x512/apps/${icon}.png`,
    `/usr/share/pixmaps/${icon}.png`, `/usr/share/pixmaps/${icon}.svg`,
    `/usr/share/icons/Yaru/scalable/apps/${icon}.svg`,
    `/usr/share/icons/Yaru/48x48/apps/${icon}.png`
  ];
  for (const p of quick) if (fs.existsSync(p)) return p;
  for (const base of ['/usr/share/icons', '/usr/share/pixmaps']) {
    if (!fs.existsSync(base)) continue;
    const stack = [base]; let n = 0;
    while (stack.length && n < 5000) {
      const dir = stack.pop(); n++;
      try {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          if (ent.isDirectory()) stack.push(path.join(dir, ent.name));
          else if (ent.name === `${icon}.png` || ent.name === `${icon}.svg`) return path.join(dir, ent.name);
        }
      } catch (e) {}
    }
  }
  return null;
}

let gtkCache = null;
function resolveViaGtk(names) {
  if (gtkCache) return gtkCache;
  gtkCache = {};
  const script = path.join(os.tmpdir(), 'iconresolve.py');
  fs.writeFileSync(script, `
import gi, sys
gi.require_version("Gtk", "3.0")
from gi.repository import Gtk
Gtk.init_check()
t = Gtk.IconTheme.get_default()
for line in sys.stdin:
    n = line.strip()
    if not n: print(""); continue
    try:
        i = t.lookup_icon(n, 64, Gtk.IconLookupFlags.FORCE_SIZE)
        print(i.get_filename() if i else "")
    except Exception:
        print("")
`);
  try {
    const out = execSync(`python3 ${script}`, { input: names.join('\n'), timeout: 10000 });
    const lines = out.toString().split('\n');
    names.forEach((n, i) => { if (lines[i] && lines[i].trim()) gtkCache[n] = lines[i].trim(); });
  } catch (e) {}
  return gtkCache;
}

function loadApps() {
  const dirs = ['/usr/share/applications',
    path.join(os.homedir(), '.local', 'share', 'applications'),
    '/var/lib/flatpak/exports/share/applications',
    path.join(os.homedir(), '.local', 'share', 'flatpak', 'exports', 'share', 'applications'),
    '/var/lib/snapd/desktop/applications'];
  const map = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.desktop') || map.has(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        if (/^NoDisplay=true/m.test(txt)) continue;
        const mN = txt.match(/^Name=(.+)$/m), mI = txt.match(/^Icon=(.+)$/m), mE = txt.match(/^Exec=(.+)$/m);
        if (!mN || !mE) continue;
        map.set(f, { id: f, name: mN[1].trim(), iconRaw: mI ? mI[1].trim() : null, icon: null, path: path.join(dir, f) });
      } catch (e) {}
    }
  }
  const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  for (const a of list) a.icon = resolveIcon(a.iconRaw);
  const missing = list.filter(a => !a.icon && a.iconRaw).map(a => a.iconRaw);
  if (missing.length) {
    const cache = resolveViaGtk(missing);
    for (const a of list) if (!a.icon && cache[a.iconRaw]) a.icon = cache[a.iconRaw];
  }
  return list;
}

ipcMain.handle('get-apps', () => loadApps());
ipcMain.handle('get-tools', () => loadTools());
ipcMain.handle('get-favs', () => { try { return JSON.parse(fs.readFileSync(FAV_FILE, 'utf8')); } catch (e) { return []; } });
ipcMain.on('set-favs', (e, f) => fs.writeFileSync(FAV_FILE, JSON.stringify(f)));
ipcMain.on('hide', () => hideWin());
ipcMain.on('launch', (e, a) => { spawnSafe('gio', ['launch', a.path]); hideWin(); });
ipcMain.on('run-tool', (e, t) => {
  if (t.mode === 'suspend') { hideWin(); spawnSafe('systemctl', ['suspend']); return; }
  if (t.mode === 'exec') { spawnSafe('bash', ['-c', t.exec]); hideWin(); return; }
  if (toolProc) { try { toolProc.kill('SIGTERM'); } catch (e) {} toolProc = null; }
  send('tool-start', t.name);
  const p = spawn('bash', ['-c', t.exec]);
  toolProc = p;
  p.stdout.on('data', d => send('tool-output', d.toString()));
  p.stderr.on('data', d => send('tool-output', d.toString()));
  p.on('error', err => send('tool-output', '\nERROR: ' + err.message + '\n'));
  p.on('close', code => { send('tool-end', code); toolProc = null; });
});
ipcMain.on('tool-close', () => { if (toolProc) { try { toolProc.kill('SIGTERM'); } catch (e) {} toolProc = null; } });

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => toggleWin());
  app.whenReady().then(() => {
    createWindow();
    if (!process.env.LAUNCHER_HIDDEN) showWin();
  });
}
