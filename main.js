const { app, BrowserWindow, ipcMain, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const FAV_FILE = path.join(os.homedir(), '.config', 'launcher-favorites.json');
const TOOLS_DIR = path.join(os.homedir(), '.config', 'system-launcher', 'tools');
let win = null, isOpen = false, toolProc = null, isPickerOpen = false;

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
  win.on('blur', () => { if (isOpen && !isPickerOpen) hideWin(); });
}

function positionWin() {
  // Anchor the compact 1000x600 window to the bottom-left of the work area so the
  // CSS panel (left: 20px, bottom: 120px) lands above the dock, and clicks outside
  // the window fire blur (blur-to-close).
  if (!win) return;
  const workArea = screen.getPrimaryDisplay().workArea;
  win.setBounds({ x: workArea.x, y: workArea.y + workArea.height - 600, width: 1000, height: 600 });
}

function showWin() {
  if (!win) createWindow();
  positionWin();
  isOpen = true;
  win.show();
  win.focus();
  win.webContents.send('animate-in');
}

function hideWin() {
  if (!win || !isOpen) return;
  isOpen = false; 
  win.webContents.send('animate-out');
  setTimeout(() => { if (win && !isOpen) win.hide(); }, 240);
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
  const extraDirs = ['/var/lib/snapd/desktop/icons', '/var/lib/flatpak/exports/share/icons'];
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

function loadApps() {
  const dirs = ['/usr/share/applications', path.join(os.homedir(), '.local', 'share', 'applications')];
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
        map.set(f, { id: f, name: mN[1].trim(), icon: resolveIcon(mI ? mI[1].trim() : null), path: path.join(dir, f) });
      } catch (e) {}
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadToolApps() {
  const dirs = ['/usr/share/applications', path.join(os.homedir(), '.local', 'share', 'applications')];
  const map = new Map();
  const excludeCats = ['AudioVideo', 'Development', 'Education', 'Game', 'Graphics', 'Office', 'Science', 'Video', 'Audio', 'Calculator', 'Clock', 'CharacterMap', 'WebBrowser', 'WebDevelopment', 'Amusement'];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.desktop') || map.has(f)) continue;
      try {
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        if (/^NoDisplay=true/m.test(txt)) continue;
        const mC = txt.match(/^Categories=(.+)$/m);
        if (mC) {
          const cats = mC[1].split(';');
          if (cats.some(c => excludeCats.includes(c.trim()))) continue;
        }
        const mN = txt.match(/^Name=(.+)$/m), mI = txt.match(/^Icon=(.+)$/m), mE = txt.match(/^Exec=(.+)$/m);
        if (!mN || !mE) continue;
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
  app.on('second-instance', () => toggleWin());
  app.whenReady().then(() => { createWindow(); if (!process.env.LAUNCHER_HIDDEN) showWin(); });
}
