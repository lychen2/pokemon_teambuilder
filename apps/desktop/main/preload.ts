import {contextBridge, ipcRenderer} from 'electron';
import type {DesktopApi} from '../../../packages/core/types';
const api: DesktopApi = {
  call: (method, input) => ipcRenderer.invoke('poke:call', method, input),
  onProgress: listener => {const handle = (_: unknown, job: any) => listener(job); ipcRenderer.on('poke:progress', handle); return () => ipcRenderer.removeListener('poke:progress', handle);},
  onBeforeClose: listener => {
    const handle = () => {void listener().then(() => ipcRenderer.send('poke:close-ready', {}), error => ipcRenderer.send('poke:close-ready', {error: error instanceof Error ? error.message : String(error)}));};
    ipcRenderer.on('poke:before-close', handle); ipcRenderer.send('poke:close-listener');
    return () => ipcRenderer.removeListener('poke:before-close', handle);
  },
  openExternal: url => ipcRenderer.invoke('poke:external', url),
  chooseDirectory: () => ipcRenderer.invoke('poke:directory'),
  saveText: (name, text) => ipcRenderer.invoke('poke:save-text', name, text),
};
contextBridge.exposeInMainWorld('poke', api);
