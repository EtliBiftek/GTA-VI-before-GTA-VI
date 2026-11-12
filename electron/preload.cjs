const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('neonDesktop', {
  quit: () => ipcRenderer.send('neon:quit'),
  toggleFullscreen: () => ipcRenderer.send('neon:fullscreen'),
});
