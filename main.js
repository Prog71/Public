const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const FAV_FILE = path.join(os.homedir(), '.config', 'launcher-favorites.json');
const TOOLS_DIR = path.join(os.homedir(), '.config', 'system-launcher', 'tools');
let win = null, isOpen = false, toolProc = null, isPickerOpen = false;
let hideTimer = null, blurTimer = null, dockCloseAt = 0; // deferred-hide plumbing + dock-click detection

function spawnSafe(cmd, args) {
  try { const p = spawn(cmd, args, { detached: true, stdio: 'ignore' }); p.on('error', () => {}); p.unref(); } catch (e) {}
}

function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 600, show: false,
    frame: false, transparent: true, backgroundColor: '#00000000',
    resizable: false, skipTaskbar: true, hasShadow: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile('index.html');
  win.on('closed', () => { win = null; });
  win.on('focus', () => {
    // A refocus right after a dock-cursor blur is the dock icon's own activate
    // (shell focuses our window instead of spawning a second instance) — keep
    // the close pending. A real refocus (alt-tab back) cancels it.
    if (!dockCloseAt || Date.now() - dockCloseAt > 400) {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    }
  });
  win.on('blur', () => {
    if (!isOpen || isPickerOpen) return;
    // Clicking our dock icon blurs us and the shell then re-activates (focuses)
    // the window instead of spawning a second instance. Detect "cursor on the
    // bottom dock strip" so that close-out runs through that refocus, unlike
    // a plain alt-tab back.
    try {
      const wa = screen.getPrimaryDisplay().workArea;
      const p = screen.getCursorScreenPoint();
      if (p.y >= wa.y + wa.height - 8) dockCloseAt = Date.now();
    } catch (e) {}
    // Defer focus-loss close 250ms: keyboard-shortcut clicks arrive as
    // 'second-instance' and toggle — within this window that toggle IS the close.
    if (blurTimer) clearTimeout(blurTimer);
    blurTimer = setTimeout(() => { blurTimer = null; hideWin(); }, 250);
  });
}

function positionWin() {
  // On Wayland, Mutter ignores client x/y (setBounds position is a no-op) and centers
  // any window, so the old 1000x600 window floated mid-screen. Instead, size the
  // transparent window to the whole work area — size IS honored on Wayland — so it
  // fills the screen and the CSS panel (left: 20px, bottom: 120px) lands at the true
  // bottom-left, above the dock (Windows Start-button position). The full-screen
  // backdrop then catches every click outside the panel (click-away-to-close), while
  // blur still closes the launcher when another window gets focus.
  if (!win) return;
  const wa = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: wa.x, y: wa.y, width: wa.width, height: wa.height });
}

function showWin() {
  if (!win) createWindow();
  dockCloseAt = 0;
  positionWin();
  isOpen = true;
  win.show();
  win.focus();
  win.webContents.send('animate-in');
}

function hideWin() {
  if (!win || !isOpen) return;
  isOpen = false;
  if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
  if (hideTimer) clearTimeout(hideTimer);
  win.webContents.send('animate-out');
  hideTimer = setTimeout(() => { hideTimer = null; if (win && !isOpen) win.hide(); }, 300); // let the slide-out finish
}

function toggleWin() {
  if (!win) { createWindow(); showWin(); return; }
  if (isOpen && win.isVisible()) {
    hideWin();
  } else {
    isOpen = true;
    isPickerOpen = false;
    positionWin();
    win.show();
    win.focus(); // Crucial for blur-to-close behavior
    win.webContents.send('animate-in');
  }
}

function resolveIcon(icon) {
  if (!icon) return null;
  if (icon.startsWith('/')) return fs.existsSync(icon) ? icon : null;
  const sizes = ['scalable', '48x48', '64x64', '128x128', '256x256', '512x512'];
  const themes = ['hicolor', 'Yaru', 'Adwaita', 'ubuntu-mono-dark', 'ubuntu-mono-light'];
  const exts = ['.svg', '.png', '.xpm'];
  const dirs = ['/usr/share/icons', path.join(os.homedir(), '.local/share/icons')];
  // Every XDG data root's icons/ dir (system, /usr/local, Flatpak user+system exports) + Snap
  const extraDirs = [...xdgDataDirs().map((d) => path.join(d, 'icons')), '/var/lib/snapd/desktop/icons'];
  for (const dir of [...dirs, ...extraDirs]) {
    if (!fs.existsSync(dir)) continue;
    for (const theme of themes) {
      for (const size of sizes) {
        for (const ext of exts) {
          const p = path.join(dir, theme, size, 'apps', icon + ext);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }
  for (const ext of exts) {
    const p = `/usr/share/pixmaps/${icon}${ext}`;
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function xdgDataDirs() {
  // XDG data roots in GIO precedence order: XDG_DATA_HOME first (user overrides win),
  // then every XDG_DATA_DIRS entry (system, Flatpak exports, Snap exports).
  const home = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  const dirs = [home];
  for (const d of (process.env.XDG_DATA_DIRS || '/usr/local/share:/usr/share').split(':')) {
    if (d) dirs.push(d.trim());
  }
  return [...new Set(dirs)];
}

function appDataDirs() {
  return xdgDataDirs().map((d) => path.join(d, 'applications'));
}

function isShowable(txt) {
  // GIO GAppInfo should_show(): honor NoDisplay/Hidden, Type and desktop-environment restrictions
  if (/^NoDisplay=true/m.test(txt) || /^Hidden=true/m.test(txt)) return false;
  const mT = txt.match(/^Type=(.+)$/m);
  if (mT && mT[1].trim() !== 'Application') return false;
  const des = (process.env.XDG_CURRENT_DESKTOP || '').split(':').filter(Boolean);
  const mOnly = txt.match(/^OnlyShowIn=(.+)$/m);
  if (mOnly && !mOnly[1].split(';').some(x => des.includes(x.trim()))) return false;
  const mNot = txt.match(/^NotShowIn=(.+)$/m);
  if (mNot && mNot[1].split(';').some(x => des.includes(x.trim()))) return false;
  return true;
}

function loadApps() {
  const dirs = appDataDirs();
  const map = new Map();
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.desktop') || map.has(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        if (!isShowable(txt)) continue;
        const mN = txt.match(/^Name=(.+)$/m), mI = txt.match(/^Icon=(.+)$/m), mE = txt.match(/^Exec=(.+)$/m);
        if (!mN || !mE) continue;
        if (mE[1].includes('launcher-toggle')) continue; // never list the launcher's own dock-toggle entry in its own grid
        map.set(f, { id: f, name: mN[1].trim(), icon: resolveIcon(mI ? mI[1].trim() : null), path: path.join(dir, f) });
      } catch (e) {}
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadToolApps() {
  const dirs = appDataDirs();
  const map = new Map();
  const excludeCats = ['AudioVideo', 'Development', 'Education', 'Game', 'Graphics', 'Office', 'Science', 'Video', 'Audio', 'Calculator', 'Clock', 'CharacterMap', 'WebBrowser', 'WebDevelopment', 'Amusement'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.desktop') || map.has(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        if (!isShowable(txt)) continue;
        const mC = txt.match(/^Categories=(.+)$/m);
        if (mC) {
          const cats = mC[1].split(';');
          if (cats.some(c => excludeCats.includes(c.trim()))) continue;
        }
        const mN = txt.match(/^Name=(.+)$/m), mI = txt.match(/^Icon=(.+)$/m), mE = txt.match(/^Exec=(.+)$/m);
        if (!mN || !mE) continue;
        if (mE[1].includes('launcher-toggle')) continue; // same self-listing filter as loadApps
        map.set(f, { id: f, name: mN[1].trim(), icon: resolveIcon(mI ? mI[1].trim() : null), path: path.join(dir, f) });
      } catch (e) {}
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadTools() {
  if (!fs.existsSync(TOOLS_DIR)) return [];
  const tools = [];
  for (const f of fs.readdirSync(TOOLS_DIR).filter(x => x.endsWith('.json'))) {
    try { tools.push(JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, f), 'utf8'))); } catch (e) {}
  }
  return tools.sort((a, b) => (a.order || 100) - (b.order || 100));
}

ipcMain.handle('get-apps', () => loadApps());
ipcMain.handle('get-favs', () => { try { return JSON.parse(fs.readFileSync(FAV_FILE, 'utf8')); } catch (e) { return []; } });
ipcMain.handle('get-tools', () => loadTools());
ipcMain.handle('get-tool-apps', () => loadToolApps());

ipcMain.on('set-favs', (e, f) => fs.writeFileSync(FAV_FILE, JSON.stringify(f)));
ipcMain.on('hide', () => hideWin());
ipcMain.on('launch', (e, a) => { spawnSafe('gio', ['launch', a.path]); hideWin(); });

ipcMain.on('run-tool', (e, t) => {
  if (t.mode === 'launch') { spawnSafe('gio', ['launch', t.exec]); hideWin(); return; }
  if (t.mode === 'exec') { spawnSafe('bash', ['-c', t.exec]); hideWin(); return; }
  if (toolProc) { try { toolProc.kill('SIGTERM'); } catch (e) {} toolProc = null; }
  win.webContents.send('tool-start', t.name);
  const p = spawn('bash', ['-c', t.exec]);
  toolProc = p;
  p.stdout.on('data', d => win.webContents.send('tool-output', d.toString()));
  p.stderr.on('data', d => win.webContents.send('tool-output', d.toString()));
  p.on('close', code => { win.webContents.send('tool-end', code); toolProc = null; });
});
ipcMain.on('tool-close', () => { if (toolProc) { try { toolProc.kill('SIGTERM'); } catch (e) {} toolProc = null; } });

ipcMain.on('delete-tool', (e, id) => {
  const file = path.join(TOOLS_DIR, id + '.json');
  if (fs.existsSync(file)) fs.unlinkSync(file);
});
ipcMain.on('update-tool', (e, t) => {
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
  fs.writeFileSync(path.join(TOOLS_DIR, t.id + '.json'), JSON.stringify(t, null, 2));
});
ipcMain.on('add-tool', (e, t) => {
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const id = 'custom-' + Date.now();
  fs.writeFileSync(path.join(TOOLS_DIR, id + '.json'), JSON.stringify({ ...t, id, order: 999 }, null, 2));
});

ipcMain.handle('import-script', async () => {
  isPickerOpen = true;
  const res = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Scripts', extensions: ['sh', 'py', 'bash', 'txt'] }] });
  isPickerOpen = false;
  if (res.canceled || res.filePaths.length === 0) return null;
  const filePath = res.filePaths[0];
  const name = path.basename(filePath, path.extname(filePath)).replace(/[-_]/g, ' ');
  if (!fs.existsSync(TOOLS_DIR)) fs.mkdirSync(TOOLS_DIR, { recursive: true });
  const id = 'custom-' + Date.now();
  const tool = { id, name, emoji: '', exec: `bash "${filePath}"`, mode: 'console', order: 999 };
  fs.writeFileSync(path.join(TOOLS_DIR, id + '.json'), JSON.stringify(tool, null, 2));
  return tool;
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', () => {
    if (dockCloseAt && Date.now() - dockCloseAt < 700) return; // dock re-launched us right after its own toggle-close — swallow
    toggleWin();
  });
  app.whenReady().then(() => { createWindow(); if (!process.env.LAUNCHER_HIDDEN) showWin(); });
}
