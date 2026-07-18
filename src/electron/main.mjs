import { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } from "electron";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { addApiSource, addGitHubProfileConnection, appendAuditEvent, checkoutGitHubCliRepository, clearDemoApiKey, createCleanupPlan, createDemoApiEvent, createHandoffReport, deleteSafeLocalBranch, deleteSafeLocalBranches, deleteVerifiedRemoteBranch, discoverLocalAgentWorktrees, discoverOpenAIDesktopClients, fetchOpenAIUsage, getAccountSources, getDemoApiKeyStatus, getDemoUsage, getEncryptedApiSource, getEncryptedDemoApiKey, getOpenAIUsageStatus, getPresentationGitHubWorkspace, getPresentationRepositoryScan, inspectCodexSession, listApiSources, listAuditEvents, listCodexSessionCandidates, listGitHubCliAccounts, listGitHubCliRepositories, listGitHubProfileConnections, listLocalBranchRecoveryManifests, listQuarantinedCodexSessions, mergeOpenAIUsageReports, quarantineCodexSession, quarantineCodexSessions, recordDemoApiEvent, removeApiSource, removeGitHubProfileConnection, restoreQuarantinedCodexSession, restoreSafeLocalBranch, saveDemoApiKey, scanCodexState, scanGitHubProfiles, scanRepository, switchGitHubCliAccount } from "../core/index.mjs";

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

function demoApiKeyStorePath() {
  return path.join(app.getPath("userData"), "demo-api", "source.json");
}

function handoffDirectory() {
  return path.join(app.getPath("userData"), "handoffs");
}

function githubProfileStorePath() {
  return path.join(app.getPath("userData"), "github", "profiles.json");
}

function githubRepositoryCacheDirectory() {
  return path.join(app.getPath("userData"), "repository-cache");
}

function auditPath() {
  return path.join(app.getPath("userData"), "audit", "events.jsonl");
}

function handoffFileName() {
  return `managex-handoff-${new Date().toISOString().replace(/[:.]/g, "-")}.md`;
}

function createCodexContextPrompt({ handoff, filePath, intent = "transfer" }) {
  const action = intent === "create"
    ? "Managex has created an initial local context package for a task."
    : "Managex is transferring a saved local context package to this task.";
  return [
    action,
    "",
    `Local Markdown location: ${filePath}`,
    "",
    "The local file is already saved. A cloud task cannot directly read or write this Windows path, so the complete sanitized context is included below.",
    "Use it as the source of truth. Review the goal, current state, and next steps; then continue the task. If you are in a local desktop task with access to this folder, you may also update the file.",
    "",
    "--- BEGIN MANAGEX CONTEXT ---",
    handoff,
    "--- END MANAGEX CONTEXT ---",
  ].join("\n");
}

async function prepareCodexContext({ handoff, filePath, intent }) {
  clipboard.writeText(createCodexContextPrompt({ handoff, filePath, intent }));
  await shell.openExternal("https://chatgpt.com/");
}

async function readSavedHandoff(fileName) {
  if (typeof fileName !== "string" || path.basename(fileName) !== fileName || !/\.(md|txt|json)$/i.test(fileName)) {
    throw new Error("That handoff document is not available.");
  }
  const directory = path.resolve(handoffDirectory());
  const filePath = path.resolve(directory, fileName);
  if (path.dirname(filePath) !== directory) throw new Error("That handoff document is outside the Managex handoff folder.");
  const fileInfo = await stat(filePath);
  if (!fileInfo.isFile() || fileInfo.size > 512_000) throw new Error("Handoff documents must be smaller than 500 KB.");
  return { filePath, handoff: await readFile(filePath, "utf8"), size: fileInfo.size };
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

ipcMain.handle("repository:scan", (_event, repoPath, options) => scanRepository(repoPath, { ...options, refreshRemote: true }));
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
    auditPath: auditPath(),
    manifestDirectory: recoveryManifestDirectory(),
  });
});
ipcMain.handle("repository:delete-local-branches", async (event, repoPath, branchNames, options) => {
  const names = [...new Set((branchNames || []).filter((name) => typeof name === "string" && name.trim()))];
  if (!names.length) throw new Error("Select at least one local branch.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", `Delete ${names.length} local branch${names.length === 1 ? "" : "es"}`],
    cancelId: 0,
    defaultId: 0,
    detail: "Each branch is rescanned before deletion, removed only with git branch -d, and recorded for local restore. Remote branches will not change.",
    message: `Delete ${names.length} selected local cleanup candidate${names.length === 1 ? "" : "s"}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true, results: [] };
  const results = await deleteSafeLocalBranches(repoPath, names, {
    ...options,
    auditPath: auditPath(),
    manifestDirectory: recoveryManifestDirectory(),
  });
  const scan = await scanRepository(repoPath, { ...options, refreshRemote: true });
  return { cancelled: false, results, scan };
});
ipcMain.handle("repository:delete-remote-branch", async (event, repoPath, branchName, options) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Verify and delete remote branch"],
    cancelId: 0,
    defaultId: 0,
    detail: "The app fetches origin, verifies the branch is merged and stale, requires GitHub CLI open-PR verification, then runs git push origin --delete. Remote deletion cannot be restored automatically.",
    message: `Verify and delete remote branch ${branchName}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true, deleted: false };
  return deleteVerifiedRemoteBranch(repoPath, branchName, {
    ...options,
    auditPath: auditPath(),
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
    auditPath: auditPath(),
  });
});
ipcMain.handle("codex:scan", () => scanCodexState());
ipcMain.handle("codex:session-candidates", () => listCodexSessionCandidates());
ipcMain.handle("codex:inspect-session", async (_event, candidate) => {
  const candidates = await listCodexSessionCandidates();
  const freshCandidate = candidates.find((item) => item.category === candidate?.category && item.relativePath === candidate?.relativePath);
  if (!freshCandidate) throw new Error("The selected session file is no longer available for inspection.");
  return inspectCodexSession(freshCandidate);
});
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
    auditPath: auditPath(),
    manifestDirectory: recoveryManifestDirectory(),
    quarantineDirectory: quarantineDirectory(),
  });
});
ipcMain.handle("codex:quarantine-sessions", async (event, selectedCandidates) => {
  const candidates = await listCodexSessionCandidates();
  const requested = (selectedCandidates || [])
    .map((candidate) => candidates.find((item) => item.category === candidate?.category && item.relativePath === candidate?.relativePath))
    .filter(Boolean);
  if (!requested.length) throw new Error("Select local session files that are still available for quarantine.");
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", `Quarantine ${requested.length} session file${requested.length === 1 ? "" : "s"}`],
    cancelId: 0,
    defaultId: 0,
    detail: "Selected files move to the private app quarantine folder and remain restorable. This does not delete ChatGPT/Codex server history or credentials.",
    message: `Quarantine ${requested.length} local session file${requested.length === 1 ? "" : "s"}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true, results: [] };
  const results = await quarantineCodexSessions(undefined, requested, {
    auditPath: auditPath(),
    manifestDirectory: recoveryManifestDirectory(),
    quarantineDirectory: quarantineDirectory(),
  });
  return { cancelled: false, results };
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
    auditPath: auditPath(),
  });
});
ipcMain.handle("usage:demo", () => getDemoUsage());
ipcMain.handle("openai:usage-status", () => openAIUsageStatus());
ipcMain.handle("openai:usage", (_event, options) => liveOpenAIUsage(options));
ipcMain.handle("account:sources", () => accountSources());
ipcMain.handle("account:storage-status", () => ({ available: safeStorage.isEncryptionAvailable(), provider: "Windows-protected storage" }));
ipcMain.handle("demo-api:status", () => getDemoApiKeyStatus(demoApiKeyStorePath()));
ipcMain.handle("demo-api:save-key", async (_event, source) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows-protected storage is unavailable.");
  if (typeof source?.apiKey !== "string" || !source.apiKey.trim().startsWith("sk-")) throw new Error("A project API key is required.");
  const saved = await saveDemoApiKey(demoApiKeyStorePath(), {
    encryptedKey: safeStorage.encryptString(source.apiKey.trim()).toString("base64"),
    label: source.label,
    model: source.model,
  });
  await appendAuditEvent(auditPath(), { label: saved.label, model: saved.model, type: "demo-api-key-connected" });
  return saved;
});
ipcMain.handle("demo-api:clear-key", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Remove project key"],
    cancelId: 0,
    defaultId: 0,
    detail: "The encrypted project API key will be removed from this Windows profile. This does not revoke the key at OpenAI.",
    message: "Remove the demo project API key?",
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true };
  const status = await clearDemoApiKey(demoApiKeyStorePath());
  await appendAuditEvent(auditPath(), { type: "demo-api-key-removed" });
  return { cancelled: false, status };
});
ipcMain.handle("demo-api:run", async (event) => {
  const configured = await getEncryptedDemoApiKey(demoApiKeyStorePath());
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Run live demo event"],
    cancelId: 0,
    defaultId: 0,
    detail: `This sends one short request to ${configured.model}, asks for DEMO_OK, and caps output at 8 tokens. It can incur a small API charge.`,
    message: "Create a real OpenAI API usage event?",
    type: "question",
  });
  if (confirmation.response !== 1) return { cancelled: true };
  const apiKey = safeStorage.decryptString(Buffer.from(configured.encryptedKey, "base64"));
  const result = await createDemoApiEvent({ apiKey, model: configured.model });
  const status = await recordDemoApiEvent(demoApiKeyStorePath(), result);
  await appendAuditEvent(auditPath(), { model: result.model, totalTokens: result.totalTokens, type: "demo-api-event-run" });
  return { cancelled: false, event: result, status };
});
ipcMain.handle("account:add-api-source", async (_event, source) => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("Windows-protected storage is unavailable.");
  if (typeof source?.apiKey !== "string" || source.apiKey.trim().length === 0) throw new Error("An OpenAI Admin key is required.");
  const saved = await addApiSource(apiSourceStorePath(), {
    encryptedKey: safeStorage.encryptString(source.apiKey.trim()).toString("base64"),
    label: source.label,
  });
  await appendAuditEvent(auditPath(), {
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
  await appendAuditEvent(auditPath(), {
    sourceId: removed.id,
    sourceLabel: removed.label,
    type: "api-source-removed",
  });
  return { cancelled: false, source: removed };
});
ipcMain.handle("account:open-chatgpt", () => shell.openExternal("https://chatgpt.com/"));
ipcMain.handle("github:profiles", (_event, logins) => scanGitHubProfiles(logins));
ipcMain.handle("github:cli-accounts", () => listGitHubCliAccounts());
ipcMain.handle("github:cli-switch-account", async (_event, login) => switchGitHubCliAccount(login));
ipcMain.handle("github:cli-repositories", (_event, login) => listGitHubCliRepositories(login));
ipcMain.handle("github:cli-checkout", async (_event, repository) => {
  const checkout = await checkoutGitHubCliRepository(repository, githubRepositoryCacheDirectory());
  await appendAuditEvent(auditPath(), { repository: checkout.repository, type: checkout.cached ? "github-repository-refreshed" : "github-repository-cloned" });
  return checkout;
});
ipcMain.handle("github:presentation-workspace", () => getPresentationGitHubWorkspace());
ipcMain.handle("github:presentation-scan", (_event, repository) => getPresentationRepositoryScan(repository));
ipcMain.handle("github:connections", () => listGitHubProfileConnections(githubProfileStorePath()));
ipcMain.handle("github:add-connection", async (_event, login) => {
  const profile = await addGitHubProfileConnection(githubProfileStorePath(), login);
  await appendAuditEvent(auditPath(), { login: profile.login, type: "github-profile-added" });
  return profile;
});
ipcMain.handle("github:remove-connection", async (event, login) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const confirmation = await dialog.showMessageBox(parentWindow, {
    buttons: ["Cancel", "Remove profile"],
    cancelId: 0,
    defaultId: 0,
    message: `Remove public GitHub profile ${login}?`,
    type: "warning",
  });
  if (confirmation.response !== 1) return { cancelled: true };
  const profile = await removeGitHubProfileConnection(githubProfileStorePath(), login);
  await appendAuditEvent(auditPath(), { login: profile.login, type: "github-profile-removed" });
  return { cancelled: false, profile };
});
ipcMain.handle("local:agent-worktrees", async () => {
  const discovery = await discoverLocalAgentWorktrees();
  const repositories = await Promise.allSettled(discovery.repositories.map(async (repositoryPath) => scanRepository(repositoryPath)));
  return {
    ...discovery,
    scans: repositories.flatMap((result) => result.status === "fulfilled" ? [result.value] : []),
  };
});
ipcMain.handle("desktop:clients", () => discoverOpenAIDesktopClients());
ipcMain.handle("audit:list", () => listAuditEvents(auditPath()));
ipcMain.handle("audit:export", async () => {
  const events = await listAuditEvents(auditPath(), { limit: 200 });
  const directory = handoffDirectory();
  const fileName = `managex-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filePath = path.join(directory, fileName);
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ exportedAt: new Date().toISOString(), events }, null, 2)}\n`, "utf8");
  await appendAuditEvent(auditPath(), { reportName: fileName, type: "audit-exported" });
  return { fileName, filePath };
});
ipcMain.handle("handoff:export", async (_event, reportData) => {
  const report = createHandoffReport(reportData);
  const directory = handoffDirectory();
  const filePath = path.join(directory, handoffFileName());
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, report, "utf8");
  await appendAuditEvent(auditPath(), {
    reportName: path.basename(filePath),
    type: "handoff-exported",
  });
  if (reportData?.openChatGpt) await prepareCodexContext({ filePath, handoff: report, intent: "create" });
  return { contextPrepared: Boolean(reportData?.openChatGpt), fileName: path.basename(filePath), filePath };
});
ipcMain.handle("handoff:list", async () => {
  const directory = handoffDirectory();
  try {
    const files = await readdir(directory, { withFileTypes: true });
    const handoffs = await Promise.all(files
      .filter((entry) => entry.isFile() && /\.(md|txt|json)$/i.test(entry.name))
      .map(async (entry) => {
        const filePath = path.join(directory, entry.name);
        const info = await stat(filePath);
        return { createdAt: info.birthtime.toISOString(), fileName: entry.name, size: info.size };
      }));
    return handoffs.sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 20);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
});
ipcMain.handle("handoff:open-directory", async () => {
  const directory = handoffDirectory();
  await mkdir(directory, { recursive: true });
  const error = await shell.openPath(directory);
  if (error) throw new Error(error);
  return { directory };
});
ipcMain.handle("handoff:import", async (event) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined;
  const result = await dialog.showOpenDialog(parentWindow, {
    defaultPath: handoffDirectory(),
    filters: [{ extensions: ["md", "txt", "json"], name: "Handoff documents" }],
    properties: ["openFile"],
    title: "Choose a handoff document to transfer to Codex",
  });
  if (result.canceled || !result.filePaths[0]) return { cancelled: true };
  const filePath = result.filePaths[0];
  const fileInfo = await stat(filePath);
  if (fileInfo.size > 512_000) throw new Error("Handoff documents must be smaller than 500 KB.");
  const handoff = await readFile(filePath, "utf8");
  await prepareCodexContext({ filePath, handoff, intent: "transfer" });
  await appendAuditEvent(auditPath(), {
    reportName: path.basename(filePath),
    size: fileInfo.size,
    type: "handoff-transfer-prepared",
  });
  return { cancelled: false, fileName: path.basename(filePath) };
});
ipcMain.handle("handoff:transfer", async (_event, fileName) => {
  const { filePath, handoff, size } = await readSavedHandoff(fileName);
  await prepareCodexContext({ filePath, handoff, intent: "transfer" });
  await appendAuditEvent(auditPath(), {
    reportName: path.basename(filePath),
    size,
    type: "handoff-transfer-prepared",
  });
  return { fileName: path.basename(filePath) };
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
