const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chromeBridge', {
  profiles: () => ipcRenderer.invoke('profiles'),
  command: (profile, action) => ipcRenderer.invoke('command', profile, action),
  settings: update => ipcRenderer.invoke('settings', update),
  history: () => ipcRenderer.invoke('history'),
  recover: (id, uncertain) => ipcRenderer.invoke('recover', id, uncertain),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  setup: action => ipcRenderer.invoke('setup', action),
  subscribe: callback => { const listener = (_event, profiles) => callback(profiles); ipcRenderer.on('profiles', listener); return () => ipcRenderer.removeListener('profiles', listener); }
});
