'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cleanDownloader', {
  defaults: () => ipcRenderer.invoke('app:defaults'),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  openFolder: folder => ipcRenderer.invoke('folder:open', folder),
  loginTvcf: () => ipcRenderer.invoke('tvcf:login'),
  openUpdate: url => ipcRenderer.invoke('update:open', url),
  start: payload => ipcRenderer.invoke('download:start', payload),
  cancel: () => ipcRenderer.invoke('download:cancel'),
  onAddUrl: callback => ipcRenderer.on('url:add', (_event, value) => callback(value)),
  onLog: callback => ipcRenderer.on('download:log', (_event, value) => callback(value)),
  onProgress: callback => ipcRenderer.on('download:progress', (_event, value) => callback(value)),
  onState: callback => ipcRenderer.on('download:state', (_event, value) => callback(value)),
  onTvcfSession: callback => ipcRenderer.on('tvcf:session', (_event, value) => callback(value)),
  onUpdate: callback => ipcRenderer.on('update:available', (_event, value) => callback(value))
});
