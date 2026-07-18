import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendAuditEvent, createCleanupPlan, createHandoffReport, deleteSafeLocalBranch, fetchOpenAIUsage, getAccountSources, getDemoUsage, getOpenAIUsageStatus, listCodexSessionCandidates, listLocalBranchRecoveryManifests, listQuarantinedCodexSessions, quarantineCodexSession, restoreQuarantinedCodexSession, restoreSafeLocalBranch, scanCodexState, scanGitHubProfiles, scanRepository } from "../core/index.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

function recoveryManifestDirectory() {
  return path.join(app.getPath("userData"), "recovery-manifests");
}

function quarantineDirectory() {
  return path.join(app.getPath("userData"), "quarantine");
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(currentDirectory, "preload.cjs"),
    },
  });
  window.loadFile(path.join(currentDirectory, "../renderer/index.html"));
}

ipcMain.handle("repository:scan", (_event, repoPath, options) => scanRepository(repoPath, options));
ipcMain.handle("repository:choose", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle("repository:cleanup-plan", async (_event, repoPath, options) => {
  const scan = await scanRepository(repoPath, options);
  return createCleanupPlan(scan, options);
});
ipcMain.handle("repository:delete-local-branch", async (event, repoPath, branchName, options) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Delete local branch"],
    cancelId: 0,
    defaultId: 0,
    detail: "The app will rescan the repository first, use git branch -d, and will not delete any remote branch.",
    message: `Delete the local branch ${branchName}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true, deleted: false };
  return deleteSafeLocalBranch(repoPath, branchName, {
    ...options,
    auditPath: path.join(app.getPath("userData"), "audit", "events.jsonl"),
    manifestDirectory: recoveryManifestDirectory(),
  });
});
ipcMain.handle("repository:recovery-manifests", () => listLocalBranchRecoveryManifests(recoveryManifestDirectory()));
ipcMain.handle("repository:restore-local-branch", async (event, manifestId) => {
  const manifests = await listLocalBranchRecoveryManifests(recoveryManifestDirectory());
  const manifest = manifests.find((item) => item.id === manifestId);
  if (!manifest || manifest.status !== "deleted") throw new Error("Recovery manifest is not available for restore.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Restore local branch"],
    cancelId: 0,
    defaultId: 0,
    detail: "The app will recreate the branch at its recorded local commit. It will not overwrite an existing branch or change any remote branch.",
    message: `Restore the local branch ${manifest.branch}?`,
    type: "question",
  });
  if (confirmation.response !== 1) return { cancelled: true, restored: false };
  return restoreSafeLocalBranch(recoveryManifestDirectory(), manifestId, {
    auditPath: path.join(app.getPath("userData"), "audit", "events.jsonl"),
  });
});
ipcMain.handle("codex:scan", () => scanCodexState());
ipcMain.handle("codex:session-candidates", () => listCodexSessionCandidates());
ipcMain.handle("codex:quarantine-session", async (event, candidate) => {
  const candidates = await listCodexSessionCandidates();
  const freshCandidate = candidates.find((item) => item.category === candidate?.category && item.relativePath === candidate?.relativePath);
  if (!freshCandidate) throw new Error("The selected session file is no longer available for cleanup.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Quarantine session"],
    cancelId: 0,
    defaultId: 0,
    detail: "The app will move this one local session file into its private quarantine folder. It will not inspect the file contents, delete server-side history, or remove any credentials.",
    message: `Quarantine ${freshCandidate.relativePath}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true, quarantined: false };
  return quarantineCodexSession(undefined, freshCandidate, {
    auditPath: path.join(app.getPath("userData"), "audit", "events.jsonl"),
    manifestDirectory: recoveryManifestDirectory(),
    quarantineDirectory: quarantineDirectory(),
  });
});
ipcMain.handle("codex:quarantine-manifests", () => listQuarantinedCodexSessions(recoveryManifestDirectory()));
ipcMain.handle("codex:restore-session", async (event, manifestId) => {
  const manifests = await listQuarantinedCodexSessions(recoveryManifestDirectory());
  const manifest = manifests.find((item) => item.id === manifestId);
  if (!manifest || manifest.status !== "quarantined") throw new Error("Session quarantine is not available for restore.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Restore session"],
    cancelId: 0,
    defaultId: 0,
    detail: "The app will move the selected local session file back to its recorded Codex location. It will not overwrite an existing file.",
    message: `Restore ${manifest.relativePath}?`,
    type: "question",
  });
  if (confirmation.response !== 1) return { cancelled: true, restored: false };
  return restoreQuarantinedCodexSession(recoveryManifestDirectory(), quarantineDirectory(), manifestId, {
    auditPath: path.join(app.getPath("userData"), "audit", "events.jsonl"),
  });
});
ipcMain.handle("usage:demo", () => getDemoUsage());
ipcMain.handle("openai:usage-status", () => getOpenAIUsageStatus());
ipcMain.handle("openai:usage", (_event, options) => fetchOpenAIUsage(options));
ipcMain.handle("account:sources", () => getAccountSources());
ipcMain.handle("account:open-chatgpt", () => shell.openExternal("https://chatgpt.com/"));
ipcMain.handle("github:profiles", (_event, logins) => scanGitHubProfiles(logins));
ipcMain.handle("handoff:export", async (event, reportData) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const report = createHandoffReport(reportData);
  const saveResult = await dialog.showSaveDialog(parentWindow, {
    defaultPath: "codex-session-guard-handoff.md",
    filters: [{ extensions: ["md"], name: "Markdown" }],
    title: "Export sanitized handoff report",
  });
  if (saveResult.canceled || !saveResult.filePath) return { cancelled: true };
  await writeFile(saveResult.filePath, report, "utf8");
  await appendAuditEvent(path.join(app.getPath("userData"), "audit", "events.jsonl"), {
    reportName: path.basename(saveResult.filePath),
    type: "handoff-exported",
  });
  return { cancelled: false, filePath: saveResult.filePath };
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
