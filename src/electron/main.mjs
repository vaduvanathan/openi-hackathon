import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCleanupPlan, scanCodexState, scanRepository } from "../core/index.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDirectory, "preload.mjs"),
    },
  });
  window.loadFile(path.join(currentDirectory, "../renderer/index.html"));
}

ipcMain.handle("repository:scan", (_event, repoPath, options) => scanRepository(repoPath, options));
ipcMain.handle("repository:cleanup-plan", async (_event, repoPath, options) => {
  const scan = await scanRepository(repoPath, options);
  return createCleanupPlan(scan, options);
});
ipcMain.handle("codex:scan", (_event, codexHome) => scanCodexState(codexHome));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
