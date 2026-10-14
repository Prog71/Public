const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getApps: () => ipcRenderer.invoke('get-apps'),
  getFavs: () => ipcRenderer.invoke('get-favs'),
  getTools: () => ipcRenderer.invoke('get-tools'),
  setFavs: f => ipcRenderer.send('set-favs', f),
  launch: a => ipcRenderer.send('launch', a),
  runTool: t => ipcRenderer.send('run-tool', t),
  hide: () => ipcRenderer.send('hide'),
  toolClose: () => ipcRenderer.send('tool-close'),
  onShow: cb => ipcRenderer.on('animate-in', cb),
  onHide: cb => ipcRenderer.on('animate-out', cb),
  onToolStart: cb => ipcRenderer.on('tool-start', (e, n) => cb(n)),
  onToolOutput: cb => ipcRenderer.on('tool-output', (e, t) => cb(t)),
  onToolEnd: cb => ipcRenderer.on('tool-end', (e, c) => cb(c))
});
