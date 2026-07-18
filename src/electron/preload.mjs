import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("codexGuard", {
  scanRepository: (repoPath, options) => ipcRenderer.invoke("repository:scan", repoPath, options),
  chooseRepository: () => ipcRenderer.invoke("repository:choose"),
  createCleanupPlan: (repoPath, options) => ipcRenderer.invoke("repository:cleanup-plan", repoPath, options),
  deleteLocalBranch: (repoPath, branchName, options) => ipcRenderer.invoke("repository:delete-local-branch", repoPath, branchName, options),
  scanCodexState: (codexHome) => ipcRenderer.invoke("codex:scan", codexHome),
  getDemoUsage: () => ipcRenderer.invoke("usage:demo"),
  getOpenAIUsageStatus: () => ipcRenderer.invoke("openai:usage-status"),
  loadOpenAIUsage: (options) => ipcRenderer.invoke("openai:usage", options),
  scanGitHubProfiles: (logins) => ipcRenderer.invoke("github:profiles", logins),
  exportHandoff: (reportData) => ipcRenderer.invoke("handoff:export", reportData),
});
