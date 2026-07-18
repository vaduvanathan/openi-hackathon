const path = require("node:path");
const { app, BrowserWindow } = require("electron");

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "../src/electron/preload.cjs"),
      sandbox: true,
    },
  });
  await window.loadURL("data:text/html,<title>Bridge check</title>");
  const bridgeReady = await window.webContents.executeJavaScript("typeof window.codexGuard === 'object' && typeof window.codexGuard.chooseRepository === 'function'");
  console.log(bridgeReady ? "Electron bridge is available." : "Electron bridge is unavailable.");
  app.exit(bridgeReady ? 0 : 1);
});
