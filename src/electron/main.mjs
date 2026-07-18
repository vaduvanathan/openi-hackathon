import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addApiSource, appendAuditEvent, createCleanupPlan, createHandoffReport, deleteSafeLocalBranch, fetchOpenAIUsage, getAccountSources, getDemoUsage, getEncryptedApiSource, getOpenAIUsageStatus, listApiSources, listCodexSessionCandidates, listLocalBranchRecoveryManifests, listQuarantinedCodexSessions, mergeOpenAIUsageReports, quarantineCodexSession, removeApiSource, restoreQuarantinedCodexSession, restoreSafeLocalBranch, scanCodexState, scanGitHubProfiles, scanRepository } from "../core/index.mjs";

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);

function recoveryManifestDirectory() {
  return path.join(app.getPath("userData"), "recovery-manifests");
}

function quarantineDirectory() {
  return path.join(app.getPath("userData"), "quarantine");
}

function apiSourceStorePath() {
  return path.join(app.getPath("userData"), "api-sources", "sources.json");
}

function handoffDirectory() {
  return path.join(app.getPath("userData"), "handoffs");
}

function handoffFileName() {
  return `codex-handoff-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
}

async function accountSources() {
  return getAccountSources({ environment: process.env, storedSources: await listApiSources(apiSourceStorePath()) });
}

async function openAIUsageStatus() {
  const sources = await accountSources();
  const configuredSources = sources.filter((source) => source.telemetry === "available");
  return {
    ...getOpenAIUsageStatus(),
    configured: configuredSources.length > 0,
    sourceCount: configuredSources.length,
  };
}

async function liveOpenAIUsage(options = {}) {
  const storedSources = await listApiSources(apiSourceStorePath());
  const entries = [];
  if (getOpenAIUsageStatus().configured) {
    entries.push({ id: "environment-admin-key", key: process.env.OPENAI_ADMIN_KEY, label: "Environment API source" });
  }
  for (const source of storedSources) {
    const stored = await getEncryptedApiSource(apiSourceStorePath(), source.id);
    entries.push({
      id: stored.id,
      key: safeStorage.decryptString(Buffer.from(stored.encryptedKey, "base64")),
      label: stored.label,
    });
  }
  if (!entries.length) throw new Error("No OpenAI API sources are configured.");

  const colors = ["cyan", "violet", "amber", "green"];
  const results = await Promise.allSettled(entries.map((entry, index) => fetchOpenAIUsage({
    ...options,
    apiKey: entry.key,
    sourceColor: colors[index % colors.length],
    sourceId: entry.id,
    sourceName: entry.label,
  })));
  const reports = results.filter((result) => result.status === "fulfilled").map((result) => result.value);
  if (!reports.length) throw new Error("None of the configured OpenAI API sources could be loaded.");
  const failedSources = results.flatMap((result, index) => result.status === "rejected" ? [entries[index].label] : []);
  return { ...mergeOpenAIUsageReports(reports), failedSources };
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
ipcMain.handle("openai:usage-status", () => openAIUsageStatus());
ipcMain.handle("openai:usage", (_event, options) => liveOpenAIUsage(options));
ipcMain.handle("account:sources", () => accountSources());
ipcMain.handle("account:storage-status", () => ({ available: safeStorage.isEncryptionAvailable(), provider: "Windows-protected storage" }));
ipcMain.handle("account:add-api-source", async (_event, source) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows-protected storage is unavailable.");
  if (typeof source?.apiKey !== "string" || source.apiKey.trim().length === 0) throw new Error("An OpenAI Admin key is required.");
  const saved = await addApiSource(apiSourceStorePath(), {
    encryptedKey: safeStorage.encryptString(source.apiKey.trim()).toString("base64"),
    label: source.label,
  });
  await appendAuditEvent(path.join(app.getPath("userData"), "audit", "events.jsonl"), {
    sourceId: saved.id,
    sourceLabel: saved.label,
    type: "api-source-added",
  });
  return saved;
});
ipcMain.handle("account:remove-api-source", async (event, sourceId) => {
  const source = (await listApiSources(apiSourceStorePath())).find((item) => item.id === sourceId);
  if (!source) throw new Error("The requested API source was not found.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Remove API source"],
    cancelId: 0,
    defaultId: 0,
    detail: "The encrypted key for this source will be removed from this Windows profile. This does not revoke the key at OpenAI.",
    message: `Remove ${source.label}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true };
  const removed = await removeApiSource(apiSourceStorePath(), sourceId);
  await appendAuditEvent(path.join(app.getPath("userData"), "audit", "events.jsonl"), {
    sourceId: removed.id,
    sourceLabel: removed.label,
    type: "api-source-removed",
  });
  return { cancelled: false, source: removed };
});
ipcMain.handle("account:open-chatgpt", () => shell.openExternal("https://chatgpt.com/"));
ipcMain.handle("github:profiles", (_event, logins) => scanGitHubProfiles(logins));
ipcMain.handle("handoff:export", async (_event, reportData) => {
  const report = createHandoffReport(reportData);
  const directory = handoffDirectory();
  const filePath = path.join(directory, handoffFileName());
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, report, "utf8");
  await appendAuditEvent(path.join(app.getPath("userData"), "audit", "events.jsonl"), {
    reportName: path.basename(filePath),
    type: "handoff-exported",
  });
  return { fileName: path.basename(filePath), filePath };
});
ipcMain.handle("handoff:import", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(parentWindow, {
    defaultPath: handoffDirectory(),
    filters: [{ extensions: ["md", "txt", "json"], name: "Handoff documents" }],
    properties: ["openFile"],
    title: "Choose a handoff document to copy into ChatGPT",
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  const filePath = result.filePaths[0];
  const fileInfo = await stat(filePath);
  if (fileInfo.size > 512_000) throw new Error("Handoff documents must be smaller than 500 KB.");
  const handoff = await readFile(filePath, "utf8");
  clipboard.writeText(handoff);
  await shell.openExternal("https://chatgpt.com/");
  await appendAuditEvent(path.join(app.getPath("userData"), "audit", "events.jsonl"), {
    reportName: path.basename(filePath),
    size: fileInfo.size,
    type: "handoff-import-prepared",
  });
  return { cancelled: false, fileName: path.basename(filePath) };
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
