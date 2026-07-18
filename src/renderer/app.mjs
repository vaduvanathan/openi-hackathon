const state = { accountSources: [], accountStorage: null, auditEvents: [], branchRecoveries: [], codex: null, desktopClients: [], githubCli: { accounts: [], available: false }, githubConnections: [], githubProfiles: [], githubRepositories: [], localWorktreeScan: null, repository: null, selectedBranches: new Set(), selectedSessions: new Map(), sessionCandidates: null, sessionRecoveries: [], usage: null, usageStatus: null };

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
  $("#repo-summary").innerHTML = `<span>Local</span><strong>${result.summary.localBranchCount}</strong><span>Remote</span><strong>${result.summary.remoteBranchCount}</strong><span>Cleanup review</span><strong>${result.summary.localDeleteCandidates + result.summary.remoteDeleteCandidates}</strong>`;
  $("#metric-candidates").textContent = String(result.summary.localDeleteCandidates);
  $("#branch-table").innerHTML = result.branches.map((branch) => {
    const stateClass = branch.safeLocalDelete ? "state-safe" : branch.checkedOutWorktree || branch.protectedBranch ? "state-blocked" : "state-active";
    const stateLabel = branch.safeLocalDelete ? "Review" : branch.checkedOutWorktree ? "In worktree" : branch.protectedBranch ? "Protected" : branch.mergedIntoBase ? "Recent merge" : "Active / unmerged";
    const action = branch.safeLocalDelete
      ? `<label class="row-choice"><input type="checkbox" data-select-branch="${escapeHtml(branch.name)}" ${state.selectedBranches.has(branch.name) ? "checked" : ""} aria-label="Select ${escapeHtml(branch.name)}" /><span>Select</span></label>`
      : "Keep";
    return `<tr><td>${escapeHtml(branch.name)}</td><td>${branch.inactiveDays === null ? "--" : `${branch.inactiveDays}d`}</td><td><span class="branch-state ${stateClass}">${stateLabel}</span></td><td>${action}</td></tr>`;
  }).join("");
  $("#branch-selection-count").textContent = `${state.selectedBranches.size} selected`;
  $("#delete-selected-branches").disabled = state.selectedBranches.size === 0;
  renderRemoteCandidates();
}

function renderRemoteCandidates() {
  const container = $("#remote-candidate-list");
  if (!container) return;
  const candidates = state.repository?.remoteCandidates || [];
  $("#remote-sync-status").textContent = state.repository?.remoteSync === "synced" ? "Origin synced" : "Origin not synced";
  if (!candidates.length) {
    container.innerHTML = `<div class="empty-state">No merged, stale origin branches need remote cleanup review.</div>`;
    return;
  }
  container.innerHTML = candidates.map((branch) => `
    <div class="remote-row">
      <div><strong>${escapeHtml(branch.name)}</strong><span>Merged into ${escapeHtml(state.repository.baseBranch)} - ${branch.inactiveDays}d inactive - GitHub PR check required</span></div>
      <button class="button button-danger table-action" data-delete-remote-branch="${escapeHtml(branch.name)}">Verify & delete</button>
    </div>`).join("");
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

function renderDesktopClients() {
  const container = $("#desktop-client-list");
  if (!container) return;
  if (!state.desktopClients.length) {
    container.innerHTML = `<div class="empty-state">No supported ChatGPT or Codex desktop executable was detected in common Windows locations.</div>`;
    return;
  }
  container.innerHTML = state.desktopClients.map((client) => `<div class="state-row"><span>${escapeHtml(client.label)}</span><strong>Detected</strong></div>`).join("");
}

function renderLocalWorktrees() {
  const container = $("#local-worktree-list");
  if (!container) return;
  if (state.localWorktreeScan === null) {
    container.innerHTML = `<div class="empty-state">Run an automatic local scan to find Codex and ChatGPT-managed Git worktrees.</div>`;
    return;
  }
  const scans = state.localWorktreeScan.scans || [];
  if (!scans.length) {
    container.innerHTML = `<div class="empty-state">No Git worktrees were found in the supported Codex or ChatGPT local roots.</div>`;
    return;
  }
  container.innerHTML = scans.map((scan) => {
    const name = scan.repoPath.split(/[\\/]/).pop() || scan.repoPath;
    return `<div class="worktree-row"><div><strong>${escapeHtml(name)}</strong><span>${scan.summary.localDeleteCandidates} local and ${scan.summary.remoteDeleteCandidates} remote cleanup candidate${scan.summary.localDeleteCandidates + scan.summary.remoteDeleteCandidates === 1 ? "" : "s"}</span></div><button class="button button-quiet" data-open-local-worktree="${escapeHtml(scan.repoPath)}">Review</button></div>`;
  }).join("");
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
    candidateContainer.innerHTML = visibleCandidates.map((candidate) => {
      const key = `${candidate.category}:${candidate.relativePath}`;
      return `
      <div class="session-row">
        <div><strong>${escapeHtml(candidate.relativePath)}</strong><span>${escapeHtml(candidate.category)} - ${candidate.ageDays}d old - ${formatBytes(candidate.size)}</span></div>
        <label class="row-choice"><input type="checkbox" data-select-session-category="${escapeHtml(candidate.category)}" data-select-session-path="${escapeHtml(candidate.relativePath)}" ${state.selectedSessions.has(key) ? "checked" : ""} aria-label="Select ${escapeHtml(candidate.relativePath)}" /><span>Select</span></label>
      </div>`;
    }).join("") + (state.sessionCandidates.length > visibleCandidates.length ? `<p class="list-note">Showing the 12 oldest of ${state.sessionCandidates.length} local session files.</p>` : "");
  }

  $("#session-selection-count").textContent = `${state.selectedSessions.size} selected`;
  $("#quarantine-selected-sessions").disabled = state.selectedSessions.size === 0;

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

function describeAuditEvent(event) {
  const labels = {
    "api-source-added": "API source connected",
    "api-source-removed": "API source removed",
    "audit-exported": "Audit export created",
    "codex-session-quarantined": "Local session quarantined",
    "codex-session-restored": "Local session restored",
    "handoff-exported": "Handoff created",
    "handoff-import-prepared": "Handoff prepared for ChatGPT",
    "local-branch-deleted": "Local branch deleted",
    "local-branch-restored": "Local branch restored",
    "remote-branch-deleted": "Remote branch deleted",
  };
  return labels[event.type] || event.type || "Activity recorded";
}

function renderAuditEvents() {
  const container = $("#audit-list");
  if (!container) return;
  if (!state.auditEvents.length) {
    container.innerHTML = `<div class="empty-state">Actions such as cleanup, restore, source changes, and handoffs appear here.</div>`;
    return;
  }
  container.innerHTML = state.auditEvents.slice(0, 10).map((event) => {
    const detail = event.branch || event.relativePath || event.sourceLabel || event.reportName || "Local activity";
    return `<div class="audit-row"><div><strong>${escapeHtml(describeAuditEvent(event))}</strong><span>${escapeHtml(detail)}</span></div><time>${escapeHtml(formatTimestamp(event.timestamp))}</time></div>`;
  }).join("");
}

function renderGitHubProfiles() {
  const container = $("#github-profiles");
  if (!state.githubConnections.length) {
    container.innerHTML = `<div class="empty-state">Add a GitHub username to track its public repository activity.</div>`;
    return;
  }
  container.innerHTML = state.githubProfiles.map((profile) => profile.status === "ok"
    ? `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>${escapeHtml(profile.name)} - ${profile.followers} followers</span></div><div class="profile-actions"><b class="profile-repos">${profile.publicRepos} repos</b><button class="icon-button" data-remove-github-profile="${escapeHtml(profile.login)}" title="Remove profile">X</button></div></div>`
    : `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>Could not read public profile</span></div><div class="profile-actions"><b class="profile-repos">Error</b><button class="icon-button" data-remove-github-profile="${escapeHtml(profile.login)}" title="Remove profile">X</button></div></div>`).join("");
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

async function applyRepositoryScan(repository) {
  state.repository = repository;
  state.selectedBranches.clear();
  renderRepository();
  await Promise.all([loadBranchRecoveries(), loadAuditEvents()]);
}

async function scanManualRepository() {
  if (!window.codexGuard?.chooseRepository) return showToast("Electron bridge is not available.");
  const repositoryPath = await window.codexGuard.chooseRepository();
  if (!repositoryPath) return;
  await applyRepositoryScan(await window.codexGuard.scanRepository(repositoryPath));
  showToast(`Scanned ${state.repository.summary.localBranchCount} local branches.`);
}

async function openRepositoryDialog() {
  const dialog = $("#repository-dialog");
  if (!dialog.open) dialog.showModal();
  await loadGitHubCliAccounts();
}

function closeRepositoryDialog() {
  $("#repository-dialog").close();
}

function renderRepositoryDialog() {
  const notice = $("#github-cli-notice");
  const select = $("#github-cli-account");
  const list = $("#github-repository-list");
  const account = state.githubCli.accounts.find((item) => item.active) || state.githubCli.accounts[0];
  if (!state.githubCli.available) {
    notice.textContent = "GitHub CLI is not signed in. Use gh auth login, then refresh this dialog.";
    select.innerHTML = `<option>GitHub CLI unavailable</option>`;
    select.disabled = true;
    list.innerHTML = `<div class="empty-state">You can still scan a local folder below.</div>`;
    return;
  }
  notice.textContent = `${state.githubCli.accounts.length} GitHub account${state.githubCli.accounts.length === 1 ? "" : "s"} available through your Windows GitHub CLI keyring.`;
  select.disabled = false;
  select.innerHTML = state.githubCli.accounts.map((item) => `<option value="${escapeHtml(item.login)}" ${item.active ? "selected" : ""}>${escapeHtml(item.login)}${item.active ? " (active)" : ""}</option>`).join("");
  if (!state.githubRepositories.length) {
    list.innerHTML = `<div class="empty-state">Loading repositories for ${escapeHtml(account?.login || "the selected account")}.</div>`;
    return;
  }
  list.innerHTML = state.githubRepositories.map((repository) => `<div class="github-repository-row"><div><strong>${escapeHtml(repository.nameWithOwner)}</strong><span>${repository.isPrivate ? "Private" : "Public"} - updated ${escapeHtml(formatTimestamp(repository.updatedAt))}</span></div><button class="button button-quiet" data-scan-github-repository="${escapeHtml(repository.nameWithOwner)}">Scan</button></div>`).join("");
}

async function loadGitHubCliAccounts() {
  if (!window.codexGuard?.getGitHubCliAccounts) return showToast("Electron bridge is not available.");
  state.githubCli = await window.codexGuard.getGitHubCliAccounts();
  state.githubRepositories = [];
  renderRepositoryDialog();
  const active = state.githubCli.accounts.find((item) => item.active) || state.githubCli.accounts[0];
  if (active) await loadGitHubRepositories(active.login);
}

async function loadGitHubRepositories(login) {
  if (!window.codexGuard?.listGitHubCliRepositories) return;
  state.githubRepositories = [];
  renderRepositoryDialog();
  try {
    state.githubRepositories = await window.codexGuard.listGitHubCliRepositories(login);
  } catch {
    state.githubRepositories = [];
    showToast("Could not list repositories for that GitHub account.");
  }
  renderRepositoryDialog();
}

async function changeGitHubCliAccount() {
  const login = $("#github-cli-account").value;
  if (!login || !window.codexGuard?.switchGitHubCliAccount) return;
  try {
    state.githubCli = await window.codexGuard.switchGitHubCliAccount(login);
    await loadGitHubRepositories(login);
  } catch {
    showToast("Could not switch the active GitHub CLI account.");
  }
}

async function scanGitHubRepository(repository) {
  if (!window.codexGuard?.checkoutGitHubCliRepository) return showToast("Electron bridge is not available.");
  try {
    const checkout = await window.codexGuard.checkoutGitHubCliRepository(repository);
    await applyRepositoryScan(await window.codexGuard.scanRepository(checkout.repositoryPath));
    closeRepositoryDialog();
    showToast(`${checkout.cached ? "Refreshed" : "Cloned and scanned"} ${checkout.repository}.`);
  } catch {
    showToast("Could not prepare and scan that GitHub repository.");
  }
}

async function scanLocalAgentWorktrees() {
  if (!window.codexGuard?.scanLocalAgentWorktrees) return showToast("Electron bridge is not available.");
  try {
    state.localWorktreeScan = await window.codexGuard.scanLocalAgentWorktrees();
    renderLocalWorktrees();
    const count = state.localWorktreeScan.scans.length;
    showToast(count ? `Scanned ${count} local Codex or ChatGPT worktree ${count === 1 ? "repository" : "repositories"}.` : "No local Codex or ChatGPT worktrees were found.");
  } catch {
    showToast("Could not scan local Codex and ChatGPT worktrees.");
  }
}

async function openLocalWorktree(repositoryPath) {
  const scan = state.localWorktreeScan?.scans?.find((item) => item.repoPath === repositoryPath);
  if (!scan) return;
  await applyRepositoryScan(scan);
  $("#repositories").scrollIntoView({ behavior: "smooth", block: "start" });
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

async function loadDesktopClients() {
  if (!window.codexGuard?.getDesktopClients) return;
  state.desktopClients = await window.codexGuard.getDesktopClients();
  renderDesktopClients();
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
  state.selectedSessions.clear();
  renderCodexState();
  await refreshSessionCleanup();
  await loadAuditEvents();
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
    await loadAuditEvents();
    showToast(`Deleted local branch ${result.branch}.`);
  } catch {
    showToast("The branch is no longer safe to delete. Scan again and review it.");
  }
}

async function deleteSelectedLocalBranches() {
  if (!state.repository || !state.selectedBranches.size || !window.codexGuard?.deleteLocalBranches) return showToast("Select local cleanup candidates first.");
  try {
    const result = await window.codexGuard.deleteLocalBranches(state.repository.repoPath, [...state.selectedBranches], {
      baseBranch: state.repository.baseBranch,
      staleAfterDays: state.repository.staleAfterDays,
    });
    if (result.cancelled) return showToast("Local branch cleanup cancelled.");
    state.repository = result.scan;
    state.selectedBranches.clear();
    renderRepository();
    await Promise.all([loadBranchRecoveries(), loadAuditEvents()]);
    const removed = result.results.filter((item) => item.deleted).length;
    const skipped = result.results.length - removed;
    showToast(`Deleted ${removed} local branch${removed === 1 ? "" : "es"}${skipped ? `; ${skipped} skipped` : ""}.`);
  } catch {
    showToast("Selected local branches could not be cleaned up safely.");
  }
}

async function deleteRemoteBranch(branchName) {
  if (!state.repository || !window.codexGuard?.deleteRemoteBranch) return showToast("Scan a repository before remote cleanup.");
  try {
    const result = await window.codexGuard.deleteRemoteBranch(state.repository.repoPath, branchName, {
      baseBranch: state.repository.baseBranch,
      staleAfterDays: state.repository.staleAfterDays,
    });
    if (result.cancelled) return showToast("Remote branch cleanup cancelled.");
    state.repository = result.scan;
    renderRepository();
    await loadAuditEvents();
    showToast(`Deleted remote branch ${result.branch}.`);
  } catch (error) {
    showToast(error?.message || "Remote cleanup was blocked.");
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
    await loadAuditEvents();
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

async function quarantineSelectedSessions() {
  if (!state.selectedSessions.size || !window.codexGuard?.quarantineCodexSessions) return showToast("Select local session files first.");
  try {
    const result = await window.codexGuard.quarantineCodexSessions([...state.selectedSessions.values()]);
    if (result.cancelled) return showToast("Session cleanup cancelled.");
    const moved = result.results.filter((item) => item.quarantined).length;
    await refreshCodexAfterSessionChange();
    showToast(`Quarantined ${moved} local session file${moved === 1 ? "" : "s"}.`);
  } catch {
    showToast("Selected local sessions could not be quarantined safely.");
  }
}

async function loadAuditEvents() {
  if (!window.codexGuard?.listAuditEvents) return;
  state.auditEvents = await window.codexGuard.listAuditEvents();
  renderAuditEvents();
}

async function exportAudit() {
  if (!window.codexGuard?.exportAudit) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.exportAudit();
    await loadAuditEvents();
    showToast(`Created ${result.fileName}.`);
  } catch {
    showToast("Could not export the activity log.");
  }
}

async function loadGitHubProfiles() {
  if (!window.codexGuard?.scanGitHubProfiles || !window.codexGuard?.getGitHubConnections) return showToast("Electron bridge is not available.");
  state.githubConnections = await window.codexGuard.getGitHubConnections();
  state.githubProfiles = state.githubConnections.length ? await window.codexGuard.scanGitHubProfiles(state.githubConnections.map((profile) => profile.login)) : [];
  renderGitHubProfiles();
  if (state.githubConnections.length) showToast("GitHub public profiles refreshed.");
}

function openGitHubProfileDialog() {
  const dialog = $("#github-profile-dialog");
  if (!dialog.open) dialog.showModal();
  $("#github-profile-login").focus();
}

function closeGitHubProfileDialog() {
  $("#github-profile-form").reset();
  $("#github-profile-dialog").close();
}

async function addGitHubProfile(event) {
  event.preventDefault();
  if (!window.codexGuard?.addGitHubConnection) return showToast("Electron bridge is not available.");
  try {
    await window.codexGuard.addGitHubConnection($("#github-profile-login").value);
    closeGitHubProfileDialog();
    await Promise.all([loadGitHubProfiles(), loadAuditEvents()]);
    showToast("GitHub profile added.");
  } catch {
    showToast("Enter a valid GitHub username.");
  }
}

async function removeGitHubProfile(login) {
  if (!window.codexGuard?.removeGitHubConnection) return showToast("Electron bridge is not available.");
  try {
    const result = await window.codexGuard.removeGitHubConnection(login);
    if (result.cancelled) return showToast("GitHub profile removal cancelled.");
    await Promise.all([loadGitHubProfiles(), loadAuditEvents()]);
    showToast(`Removed ${login}.`);
  } catch {
    showToast("Could not remove that GitHub profile.");
  }
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
$("#scan-repository").addEventListener("click", openRepositoryDialog);
$("#scan-local-folder").addEventListener("click", scanManualRepository);
$("#scan-local-worktrees").addEventListener("click", scanLocalAgentWorktrees);
$("#close-repository-dialog").addEventListener("click", closeRepositoryDialog);
$("#close-repository-dialog-bottom").addEventListener("click", closeRepositoryDialog);
$("#repository-dialog").addEventListener("close", () => { state.githubRepositories = []; });
$("#refresh-github-cli").addEventListener("click", loadGitHubCliAccounts);
$("#github-cli-account").addEventListener("change", changeGitHubCliAccount);
$("#github-repository-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-scan-github-repository]");
  if (button) scanGitHubRepository(button.dataset.scanGithubRepository);
});
$("#delete-selected-branches").addEventListener("click", deleteSelectedLocalBranches);
$("#scan-codex").addEventListener("click", scanCodex);
$("#refresh-sessions").addEventListener("click", () => refreshSessionCleanup().catch(() => showToast("Could not refresh local session cleanup.")));
$("#quarantine-selected-sessions").addEventListener("click", quarantineSelectedSessions);
$("#refresh-profiles").addEventListener("click", loadGitHubProfiles);
$("#add-github-profile").addEventListener("click", openGitHubProfileDialog);
$("#github-profile-form").addEventListener("submit", addGitHubProfile);
$("#cancel-github-profile").addEventListener("click", closeGitHubProfileDialog);
$("#cancel-github-profile-bottom").addEventListener("click", closeGitHubProfileDialog);
$("#github-profile-dialog").addEventListener("close", () => $("#github-profile-form").reset());
$("#export-handoff").addEventListener("click", exportHandoff);
$("#import-handoff").addEventListener("click", importHandoff);
$("#refresh-recoveries").addEventListener("click", loadBranchRecoveries);
$("#refresh-audit").addEventListener("click", loadAuditEvents);
$("#export-audit").addEventListener("click", exportAudit);
$("#branch-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-branch]");
  if (button) deleteLocalBranch(button.dataset.deleteBranch);
});
$("#branch-table").addEventListener("change", (event) => {
  const input = event.target.closest("[data-select-branch]");
  if (!input) return;
  if (input.checked) state.selectedBranches.add(input.dataset.selectBranch);
  else state.selectedBranches.delete(input.dataset.selectBranch);
  renderRepository();
});
$("#remote-candidate-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-delete-remote-branch]");
  if (button) deleteRemoteBranch(button.dataset.deleteRemoteBranch);
});
$("#local-worktree-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-open-local-worktree]");
  if (button) openLocalWorktree(button.dataset.openLocalWorktree);
});
$("#recovery-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-branch]");
  if (button) restoreLocalBranch(button.dataset.restoreBranch);
});
$("#session-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-quarantine-category]");
  if (button) quarantineCodexSession(button.dataset.quarantineCategory, button.dataset.quarantinePath);
});
$("#session-list").addEventListener("change", (event) => {
  const input = event.target.closest("[data-select-session-category]");
  if (!input) return;
  const candidate = { category: input.dataset.selectSessionCategory, relativePath: input.dataset.selectSessionPath };
  const key = `${candidate.category}:${candidate.relativePath}`;
  if (input.checked) state.selectedSessions.set(key, candidate);
  else state.selectedSessions.delete(key);
  renderSessionCleanup();
});
$("#session-recovery-list").addEventListener("click", (event) => {
  const button = event.target.closest("[data-restore-session]");
  if (button) restoreQuarantinedSession(button.dataset.restoreSession);
});
$("#github-profiles").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-github-profile]");
  if (button) removeGitHubProfile(button.dataset.removeGithubProfile);
});

renderUsage();
await loadUsageStatus();
await loadAccountSources();
await loadGitHubProfiles();
await loadBranchRecoveries();
await loadSessionRecoveries();
await loadAuditEvents();
await loadDesktopClients();
