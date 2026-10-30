const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  listeners.set(callback, { channel, handler });
  return () => {
    ipcRenderer.removeListener(channel, handler);
    listeners.delete(callback);
  };
}

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveFavorites: (favorites) => ipcRenderer.invoke('favorites:save', favorites),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  setActive: (id) => ipcRenderer.invoke('state:active', id),
  openSettings: (options) => ipcRenderer.invoke('settings:open', options || {}),
  openPage: (id) => ipcRenderer.invoke('page:open', id),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  setWindowTitle: (title) => ipcRenderer.invoke('window:title', title),
  setSettingsOpen: (open) => ipcRenderer.invoke('settings:state', open),
  captureThumb: (guestId) => ipcRenderer.invoke('page:thumb', guestId),
  normalizeUrl: (input) => ipcRenderer.invoke('url:normalize', input),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  clearData: () => ipcRenderer.invoke('data:clear'),
  exportFavorites: () => ipcRenderer.invoke('favorites:export'),
  importFavorites: () => ipcRenderer.invoke('favorites:import'),

  onConfigChanged: (callback) => subscribe('config:changed', callback),
  onCommand: (callback) => subscribe('command', callback),
  onWindowShown: (callback) => subscribe('window:shown', callback),
  onDataCleared: (callback) => subscribe('data:cleared', callback),
});
