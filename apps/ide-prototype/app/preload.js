const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  invoke: async (ch, ...a) => { const r = await ipcRenderer.invoke(ch, ...a); if (r && r.__error) throw new Error(r.__error); return r; },
  send: (ch, p) => ipcRenderer.send(ch, p),
  on: (ch, cb) => { const f = (_e, p) => cb(p); ipcRenderer.on(ch, f); return () => ipcRenderer.removeListener(ch, f); },
});
