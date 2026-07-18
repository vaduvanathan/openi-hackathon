import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codexGuard", {
  scanRepository: (repoPath, options) => ipcRenderer.invoke("repository:scan", repoPath, options),
  createCleanupPlan: (repoPath, options) => ipcRenderer.invoke("repository:cleanup-plan", repoPath, options),
  scanCodexState: (codexHome) => ipcRenderer.invoke("codex:scan", codexHome),
});
