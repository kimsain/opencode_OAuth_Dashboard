const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("usageApi", {
  fetchUsage: () => ipcRenderer.invoke("usage:fetch"),
  connectAntigravity: () => ipcRenderer.invoke("antigravity:connect"),
  connectCodex: () => ipcRenderer.invoke("codex:connect"),
  getConstants: () => ipcRenderer.invoke("app:get-constants"),
  loadOhMyOpencode: (path) => ipcRenderer.invoke("ohmyopencode:load", { path }),
  saveOhMyOpencode: (payload) => ipcRenderer.invoke("ohmyopencode:save", payload)
});
