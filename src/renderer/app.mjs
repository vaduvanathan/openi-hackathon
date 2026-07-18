const profiles = ["vaduvanathan", "nathan-build"];
const state = { accountSources: [], accountStorage: null, branchRecoveries: [], codex: null, githubProfiles: [], repository: null, sessionCandidates: null, sessionRecoveries: [], usage: null, usageStatus: null };

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function formatTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unknown time";
}

function formatBytes(value) {
  if (value >= 1_048_576) return `${(value / 1_048_576).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value} B`;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function renderUsageStatus() {
  const live = state.usage?.source === "openai-api-platform";
  const demo = state.usage?.source === "demo";
  const configured = state.usageStatus?.configured;
  const badge = $("#data-source-badge");
  const title = $("#usage-notice-title");
  const body = $("#usage-notice-body");
  const loadButton = $("#load-live-usage");

  if (live) {
    badge.textContent = "Live API Platform data";
    title.textContent = "Live organization API usage is loaded.";
    body.textContent = "This source reports API Platform usage and costs only. It does not report ChatGPT or Codex personal quota.";
    loadButton.textContent = "Refresh API usage";
    return;
  }
  if (demo) {
    badge.textContent = "Demo preview";
    title.textContent = "You are viewing illustrative demo data.";
    body.textContent = "It is not associated with an OpenAI, Codex, ChatGPT, or GitHub account.";
    loadButton.textContent = configured ? "Load API usage" : "API key needed";
    return;
  }
  badge.textContent = configured ? "API source ready" : "No live source";
  title.textContent = configured ? "Live organization API sources are ready." : "No live OpenAI API source is connected.";
  body.textContent = configured
    ? `Load 14 days of usage across ${state.usageStatus.sourceCount || 1} saved organization source${state.usageStatus.sourceCount === 1 ? "" : "s"}.`
    : "Connect an OpenAI API organization to load live usage and costs. Personal ChatGPT and Codex quota stays in ChatGPT.";
  loadButton.textContent = configured ? "Load live usage" : "Connect data";
}

function renderAccounts() {
  const accounts = state.usage?.accounts || [];
  const live = state.usage?.source === "openai-api-platform";
  $("#metric-tokens").textContent = accounts.length ? formatTokens(accounts.reduce((sum, account) => sum + account.tokens, 0)) : "--";
  $("#metric-tokens-detail").textContent = live ? `Last ${state.usage.rangeDays} days` : state.usage?.source === "demo" ? "Illustrative sample" : "Load an API source";
  $("#metric-accounts").textContent = live ? String(accounts.length) : "0";
  $("#metric-accounts-detail").textContent = live ? "OpenAI API Platform" : "No live sources";

  if (!accounts.length) {
    $("#account-list").innerHTML = `<div class="empty-state">No live usage source is connected. This app supports OpenAI API Platform organization metrics, not personal ChatGPT or Codex quota.</div>`;
    return;
  }

  $("#account-list").innerHTML = accounts.map((account) => {
    const progress = Number.isFinite(account.usagePercent)
      ? `<div class="progress"><i class="bar-${escapeHtml(account.color)}" style="width:${account.usagePercent}%"></i></div>`
      : "";
    const leftDetail = Number.isFinite(account.usagePercent) ? `${account.usagePercent}% used` : escapeHtml(account.detail || "Usage loaded");
    const rightDetail = escapeHtml(account.footer || (account.reset ? `${account.reset} reset` : ""));
    return `
      <div class="account-row">
        <div class="account-top"><div><div class="account-name">${escapeHtml(account.name)}</div><div class="account-kind">${escapeHtml(account.kind)}</div></div><span class="pill">${escapeHtml(account.status)}</span></div>
        ${progress}
        <div class="account-bottom"><span>${leftDetail}</span><strong>${rightDetail}</strong></div>
      </div>`;
  }).join("");
}

function renderChart() {
  const svg = $("#usage-chart");
  const days = Number(document.querySelector(".range-button.active")?.dataset.days || 14);
  const points = state.usage?.daily?.slice(-days) || [];
  if (!points.length) {
    svg.innerHTML = `<text x="380" y="132" fill="#9ba6b3" font-size="13" text-anchor="middle">Load an API source or choose the demo preview.</text>`;
    return;
  }

  const max = Math.max(...points.map((point) => point.total), 1);
  const left = 44;
  const top = 18;
  const width = 690;
  const height = 190;
  const x = (index) => left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
  const y = (value) => top + height - (value / max) * height;
  const line = points.map((point, index) => `${x(index)},${y(point.total)}`).join(" ");
  const outputLine = points.map((point, index) => `${x(index)},${y(point.output)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const value = Math.round(max * ratio);
    const lineY = y(value);
    return `<line x1="${left}" y1="${lineY}" x2="${left + width}" y2="${lineY}" stroke="#2b333d" stroke-width="1"/><text x="0" y="${lineY + 4}" fill="#697480" font-size="10">${formatTokens(value)}</text>`;
  }).join("");
  const labels = points.map((point, index) => index % (points.length > 9 ? 2 : 1) === 0 ? `<text x="${x(index)}" y="239" fill="#697480" font-size="10" text-anchor="middle">${escapeHtml(point.label)}</text>` : "").join("");
  const dots = points.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.total)}" r="3.2" fill="#45d6dc"/>`).join("");
  svg.innerHTML = `${grid}<polyline points="${line}" fill="none" stroke="#45d6dc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${outputLine}" fill="none" stroke="#9c8cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>${dots}${labels}`;
}

function renderUsage() {
  renderUsageStatus();
  renderAccounts();
  renderChart();
}

function renderRepository() {
  const result = state.repository;
  if (!result) return;
  $("#repo-title").textContent = result.repoPath.split(/[\\/]/).pop() || result.repoPath;
  $("#repo-status").textContent = "Scanned";
  $("#repo-status").className = "pill";
  $("#repo-summary").innerHTML = `<span>Branches</span><strong>${result.summary.localBranchCount}</strong><span>Worktrees</span><strong>${result.summary.worktreeCount}</strong><span>Safe candidates</span><strong>${result.summary.localDeleteCandidates}</strong>`;
  $("#metric-candidates").textContent = String(result.summary.localDeleteCandidates);
  $("#branch-table").innerHTML = result.branches.map((branch) => {
    const stateClass = branch.safeLocalDelete ? "state-safe" : branch.checkedOutWorktree || branch.protectedBranch ? "state-blocked" : "state-active";
    const stateLabel = branch.safeLocalDelete ? "Review" : branch.checkedOutWorktree ? "In worktree" : branch.protectedBranch ? "Protected" : branch.mergedIntoBase ? "Recent merge" : "Active / unmerged";
    const action = branch.safeLocalDelete
      ? `<button class="button button-danger table-action" data-delete-branch="${escapeHtml(branch.name)}">Delete local</button>`
      : "Keep";
    return `<tr><td>${escapeHtml(branch.name)}</td><td>${branch.inactiveDays === null ? "--" : `${branch.inactiveDays}d`}</td><td><span class="branch-state ${stateClass}">${stateLabel}</span></td><td>${action}</td></tr>`;
  }).join("");
}

function renderAccountSources() {
  const container = $("#source-list");
  if (!state.accountSources.length) {
    container.innerHTML = `<div class="empty-state">Account sources are unavailable.</div>`;
    return;
  }
  container.innerHTML = state.accountSources.map((source) => {
    const actions = [];
    if (source.id === "chatgpt-codex") actions.push(`<button class="button button-quiet" data-open-chatgpt>Open ChatGPT</button>`);
    if (source.telemetry === "available") actions.push(`<button class="button button-quiet" data-load-api-source>Load usage</button>`);
    if (source.telemetry === "not-configured") actions.push(`<button class="button button-quiet" data-add-api-source>Add source</button>`);
    if (source.removable) actions.push(`<button class="button button-danger table-action" data-remove-api-source="${escapeHtml(source.id)}">Remove</button>`);
    return `
      <div class="source-row">
        <div><strong>${escapeHtml(source.label)}</strong><span>${escapeHtml(source.kind)} - ${escapeHtml(source.detail)}</span></div>
        <div class="source-action"><span class="pill">${escapeHtml(source.status)}</span>${actions.join("")}</div>
      </div>`;
  }).join("");
}

function renderBranchRecoveries() {
  const container = $("#recovery-list");
  const recoveries = state.branchRecoveries.filter((manifest) => manifest.status === "deleted");
  if (!recoveries.length) {
    container.innerHTML = `<div class="empty-state">No deleted local branches are available to restore.</div>`;
    return;
  }
  container.innerHTML = recoveries.map((manifest) => `
    <div class="recovery-row">
      <div><strong>${escapeHtml(manifest.branch)}</strong><span>Deleted ${escapeHtml(formatTimestamp(manifest.deletedAt || manifest.createdAt))}</span></div>
      <button class="button button-quiet" data-restore-branch="${escapeHtml(manifest.id)}">Restore</button>
    </div>`).join("");
}

function renderCodexState() {
  if (!state.codex) return;
  const categories = Object.values(state.codex.categories).filter((category) => category.exists);
  $("#metric-state").textContent = formatTokens(state.codex.aggregate.totalBytes) + "B";
  $("#metric-state-detail").textContent = `${state.codex.aggregate.fileCount} files scanned`;
  $("#state-list").innerHTML = categories.length ? categories.map((category) => `<div class="state-row"><span>${escapeHtml(category.root.split(/[\\/]/).pop())}</span><strong>${category.fileCount} files - ${formatTokens(category.totalBytes)}B</strong></div>`).join("") : `<div class="empty-state">No common Codex state folders found.</div>`;
}

function renderSessionCleanup() {
  const candidateContainer = $("#session-list");
  const recoveryContainer = $("#session-recovery-list");
  if (state.sessionCandidates === null) {
    candidateContainer.innerHTML = `<div class="empty-state">Scan local Codex state to review session files.</div>`;
  } else if (!state.sessionCandidates.length) {
    candidateContainer.innerHTML = `<div class="empty-state">No local session files are available for quarantine.</div>`;
  } else {
    const visibleCandidates = state.sessionCandidates.slice(0, 12);
    candidateContainer.innerHTML = visibleCandidates.map((candidate) => `
      <div class="session-row">
        <div><strong>${escapeHtml(candidate.relativePath)}</strong><span>${escapeHtml(candidate.category)} - ${candidate.ageDays}d old - ${formatBytes(candidate.size)}</span></div>
        <button class="button button-quiet" data-quarantine-category="${escapeHtml(candidate.category)}" data-quarantine-path="${escapeHtml(candidate.relativePath)}">Quarantine</button>
      </div>`).join("") + (state.sessionCandidates.length > visibleCandidates.length ? `<p class="list-note">Showing the 12 oldest of ${state.sessionCandidates.length} local session files.</p>` : "");
  }

  const quarantines = state.sessionRecoveries.filter((manifest) => manifest.status === "quarantined");
  if (!quarantines.length) {
    recoveryContainer.innerHTML = `<div class="empty-state">No quarantined sessions are available to restore.</div>`;
    return;
  }
  recoveryContainer.innerHTML = quarantines.map((manifest) => `
    <div class="session-row">
      <div><strong>${escapeHtml(manifest.relativePath)}</strong><span>${escapeHtml(manifest.category)} - quarantined ${escapeHtml(formatTimestamp(manifest.quarantinedAt || manifest.createdAt))}</span></div>
      <button class="button button-quiet" data-restore-session="${escapeHtml(manifest.id)}">Restore</button>
    </div>`).join("");
}

function renderGitHubProfiles() {
  const container = $("#github-profiles");
  if (!state.githubProfiles.length) return;
  container.innerHTML = state.githubProfiles.map((profile) => profile.status === "ok"
    ? `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>${escapeHtml(profile.name)} - ${profile.followers} followers</span></div><b class="profile-repos">${profile.publicRepos} repos</b></div>`
    : `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>Could not read public profile</span></div><b class="profile-repos">Error</b></div>`).join("");
}

async function loadUsageStatus() {
  if (!window.codexGuard?.getOpenAIUsageStatus) return;
  state.usageStatus = await window.codexGuard.getOpenAIUsageStatus();
  renderUsage();
}

async function loadAccountSources() {
  if (!window.codexGuard?.getAccountSources || !window.codexGuard?.getAccountStorageStatus) return;
  const [sources, storage] = await Promise.all([
    window.codexGuard.getAccountSources(),
    window.codexGuard.getAccountStorageStatus(),
  ]);
  state.accountSources = sources;
  state.accountStorage = storage;
  renderAccountSources();
}

function openApiSourceDialog() {
  if (!state.accountStorage?.available) return showToast("Windows-protected storage is unavailable on this device.");
  const dialog = $("#api-source-dialog");
  if (!dialog.open) dialog.showModal();
  $("#api-source-label").focus();
}

function closeApiSourceDialog() {
  $("#api-source-form").reset();
  $("#api-source-dialog").close();
}

async function addApiSource(event) {
  event.preventDefault();
  if (!window.codexGuard?.addApiSource) return showToast("Electron bridge is not available.");
  const labelField = $("#api-source-label");
  const keyField = $("#api-source-key");
  const source = { apiKey: keyField.value, label: labelField.value };
  keyField.value = "";
  try {
    await window.codexGuard.addApiSource(source);
    closeApiSourceDialog();
    await Promise.all([loadUsageStatus(), loadAccountSources()]);
    await loadLiveUsage();
  } catch {
    showToast("Could not add that API source. Check the name and Admin key.");
  }
}

async function openChatGpt() {
  if (!window.codexGuard?.openChatGpt) return showToast("Electron bridge is not available.");
  try {
    await window.codexGuard.openChatGpt();
    showToast("Opened ChatGPT in your default browser.");
  } catch {
    showToast("Could not open ChatGPT in your default browser.");
  }
}

async function removeApiSource(sourceId) {
  if (!window.codexGuard?.removeApiSource) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.removeApiSource(sourceId);
    if (result.cancelled) return showToast("API source removal cancelled.");
    state.usage = null;
    await Promise.all([loadUsageStatus(), loadAccountSources()]);
    renderUsage();
    showToast(`Removed ${result.source.label}.`);
  } catch {
    showToast("Could not remove that API source.");
  }
}

async function loadLiveUsage() {
  await loadUsageStatus();
  if (!state.usageStatus?.configured) {
    openApiSourceDialog();
    return;
  }
  try {
    state.usage = await window.codexGuard.loadOpenAIUsage({ days: 14 });
    renderUsage();
    showToast(state.usage.failedSources?.length ? `Loaded available sources. ${state.usage.failedSources.length} source needs attention.` : "Loaded live API usage.");
  } catch {
    state.usage = null;
    renderUsage();
    showToast("Could not load OpenAI API usage. Check key permissions and try again.");
  }
}

async function loadDemoUsage() {
  if (!window.codexGuard?.getDemoUsage) return showToast("Electron bridge is not available.");
  state.usage = await window.codexGuard.getDemoUsage();
  renderUsage();
  showToast("Showing illustrative demo data.");
}

async function scanRepository() {
  if (!window.codexGuard?.chooseRepository) return showToast("Electron bridge is not available.");
  const repositoryPath = await window.codexGuard.chooseRepository();
  if (!repositoryPath) return;
  state.repository = await window.codexGuard.scanRepository(repositoryPath);
  renderRepository();
  await loadBranchRecoveries();
  showToast(`Scanned ${state.repository.summary.localBranchCount} local branches.`);
}

async function scanCodex() {
  if (!window.codexGuard?.scanCodexState) return showToast("Electron bridge is not available.");
  try {
    state.codex = await window.codexGuard.scanCodexState();
    renderCodexState();
    await refreshSessionCleanup();
    showToast("Local Codex state scanned.");
  } catch {
    showToast("Could not scan local Codex state.");
  }
}

async function refreshSessionCleanup() {
  if (!window.codexGuard?.listCodexSessionCandidates || !window.codexGuard?.listQuarantinedSessions) return;
  const [candidates, recoveries] = await Promise.all([
    window.codexGuard.listCodexSessionCandidates(),
    window.codexGuard.listQuarantinedSessions(),
  ]);
  state.sessionCandidates = candidates;
  state.sessionRecoveries = recoveries;
  renderSessionCleanup();
}

async function loadSessionRecoveries() {
  if (!window.codexGuard?.listQuarantinedSessions) return;
  state.sessionRecoveries = await window.codexGuard.listQuarantinedSessions();
  renderSessionCleanup();
}

async function refreshCodexAfterSessionChange() {
  state.codex = await window.codexGuard.scanCodexState();
  renderCodexState();
  await refreshSessionCleanup();
}

async function quarantineCodexSession(category, relativePath) {
  if (!window.codexGuard?.quarantineCodexSession) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.quarantineCodexSession({ category, relativePath });
    if (result.cancelled) return showToast("Session quarantine cancelled.");
    await refreshCodexAfterSessionChange();
    showToast("Local session quarantined.");
  } catch {
    showToast("The selected session file could not be quarantined safely.");
  }
}

async function restoreQuarantinedSession(manifestId) {
  if (!window.codexGuard?.restoreCodexSession) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.restoreCodexSession(manifestId);
    if (result.cancelled) return showToast("Session restore cancelled.");
    await refreshCodexAfterSessionChange();
    showToast("Local session restored.");
  } catch {
    showToast("The local session could not be restored safely.");
  }
}

async function deleteLocalBranch(branchName) {
  if (!state.repository || !window.codexGuard?.deleteLocalBranch) return showToast("Scan a repository before deleting a branch.");
  try {
    const result = await window.codexGuard.deleteLocalBranch(state.repository.repoPath, branchName, {
      baseBranch: state.repository.baseBranch,
      staleAfterDays: state.repository.staleAfterDays,
    });
    if (result.cancelled) return showToast("Local branch deletion cancelled.");
    state.repository = result.scan;
    renderRepository();
    await loadBranchRecoveries();
    showToast(`Deleted local branch ${result.branch}.`);
  } catch {
    showToast("The branch is no longer safe to delete. Scan again and review it.");
  }
}

async function loadBranchRecoveries() {
  if (!window.codexGuard?.listBranchRecoveryManifests) return;
  state.branchRecoveries = await window.codexGuard.listBranchRecoveryManifests();
  renderBranchRecoveries();
}

async function restoreLocalBranch(manifestId) {
  if (!window.codexGuard?.restoreLocalBranch) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.restoreLocalBranch(manifestId);
    if (result.cancelled) return showToast("Local branch restore cancelled.");
    await loadBranchRecoveries();
    if (state.repository?.repoPath === result.repository) {
      state.repository = await window.codexGuard.scanRepository(result.repository, {
        baseBranch: state.repository.baseBranch,
        staleAfterDays: state.repository.staleAfterDays,
      });
      renderRepository();
    }
    showToast(`Restored local branch ${result.branch}.`);
  } catch {
    showToast("The local branch could not be restored safely.");
  }
}

async function exportHandoff() {
  if (!window.codexGuard?.exportHandoff) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.exportHandoff({
      codex: state.codex,
      repository: state.repository,
      usage: state.usage,
    });
    showToast(`Created ${result.fileName}.`);
  } catch {
    showToast("Could not export the handoff report.");
  }
}

async function importHandoff() {
  if (!window.codexGuard?.importHandoff) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.importHandoff();
    if (result.cancelled) return showToast("Handoff import cancelled.");
    showToast("Handoff copied. Select a ChatGPT chat, paste, then press Enter.");
  } catch {
    showToast("Could not prepare that handoff document.");
  }
}

async function loadGitHubProfiles() {
  if (!window.codexGuard?.scanGitHubProfiles) return showToast("Electron bridge is not available.");
  state.githubProfiles = await window.codexGuard.scanGitHubProfiles(profiles);
  renderGitHubProfiles();
  showToast("GitHub profile access checked.");
}

document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(button.dataset.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
}));
document.querySelectorAll(".range-button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".range-button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderChart();
}));
$("#load-live-usage").addEventListener("click", loadLiveUsage);
$("#load-demo-usage").addEventListener("click", loadDemoUsage);
$("#refresh-usage").addEventListener("click", () => state.usage?.source === "demo" ? loadDemoUsage() : loadLiveUsage());
$("#source-list").addEventListener("click", (event) => {
  if (event.target.closest("[data-open-chatgpt]")) openChatGpt();
  if (event.target.closest("[data-load-api-source]")) loadLiveUsage();
  if (event.target.closest("[data-add-api-source]")) openApiSourceDialog();
  const removeButton = event.target.closest("[data-remove-api-source]");
  if (removeButton) removeApiSource(removeButton.dataset.removeApiSource);
});
$("#add-api-source").addEventListener("click", openApiSourceDialog);
$("#api-source-form").addEventListener("submit", addApiSource);
$("#cancel-api-source").addEventListener("click", closeApiSourceDialog);
$("#cancel-api-source-bottom").addEventListener("click", closeApiSourceDialog);
$("#api-source-dialog").addEventListener("close", () => $("#api-source-form").reset());
$("#scan-repository").addEventListener("click", scanRepository);
$("#scan-codex").addEventListener("click", scanCodex);
$("#refresh-sessions").addEventListener("click", () => refreshSessionCleanup().catch(() => showToast("Could not refresh local session cleanup.")));
$("#refresh-profiles").addEventListener("click", loadGitHubProfiles);
$("#export-handoff").addEventListener("click", exportHandoff);
$("#import-handoff").addEventListener("click", importHandoff);
$("#refresh-recoveries").addEventListener("click", loadBranchRecoveries);
$("#branch-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-branch]");
  if (button) deleteLocalBranch(button.dataset.deleteBranch);
});
$("#recovery-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-branch]");
  if (button) restoreLocalBranch(button.dataset.restoreBranch);
});
$("#session-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quarantine-category]");
  if (button) quarantineCodexSession(button.dataset.quarantineCategory, button.dataset.quarantinePath);
});
$("#session-recovery-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-session]");
  if (button) restoreQuarantinedSession(button.dataset.restoreSession);
});

renderUsage();
await loadUsageStatus();
await loadAccountSources();
await loadGitHubProfiles();
await loadBranchRecoveries();
await loadSessionRecoveries();
