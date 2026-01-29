const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("usageApi", {
  fetchUsage: () => ipcRenderer.invoke("usage:fetch"),
  connectAntigravity: () => ipcRenderer.invoke("antigravity:connect"),
  connectCodex: () => ipcRenderer.invoke("codex:connect")
});
