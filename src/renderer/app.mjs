const profiles = ["vaduvanathan", "nathan-build"];
const state = { usage: null, repository: null, codex: null, githubProfiles: [] };

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return String(value);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function renderAccounts() {
  const totalTokens = state.usage.accounts.reduce((sum, account) => sum + account.tokens, 0);
  const connectedAccounts = state.usage.accounts.filter((account) => account.status === "Connected").length;
  $("#metric-tokens").textContent = formatTokens(totalTokens);
  $("#metric-accounts").textContent = String(connectedAccounts);
  $("#account-list").innerHTML = state.usage.accounts.map((account) => `
    <div class="account-row">
      <div class="account-top"><div><div class="account-name">${escapeHtml(account.name)}</div><div class="account-kind">${escapeHtml(account.kind)}</div></div><span class="pill">${escapeHtml(account.status)}</span></div>
      <div class="progress"><i class="bar-${escapeHtml(account.color)}" style="width:${account.usagePercent}%"></i></div>
      <div class="account-bottom"><span>${account.usagePercent}% used</span><strong>${escapeHtml(account.reset)} reset</strong></div>
    </div>`).join("");
}

function renderChart() {
  const svg = $("#usage-chart");
  const days = Number(document.querySelector(".range-button.active")?.dataset.days || 14);
  const account = $("#account-filter").value;
  const points = state.usage.daily.slice(-days);
  const max = Math.max(...points.map((point) => point.total), 1);
  const left = 44;
  const top = 18;
  const width = 690;
  const height = 190;
  const x = (index) => left + (points.length === 1 ? width / 2 : (index / (points.length - 1)) * width);
  const y = (value) => top + height - (value / max) * height;
  const line = points.map((point, index) => `${x(index)},${y(account === "all" ? point.total : Math.round(point.total * (account === "hackathon" ? .48 : account === "personal" ? .22 : .30)))}`).join(" ");
  const outputLine = points.map((point, index) => `${x(index)},${y(point.output)}`).join(" ");
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const value = Math.round(max * ratio);
    const lineY = y(value);
    return `<line x1="${left}" y1="${lineY}" x2="${left + width}" y2="${lineY}" stroke="#2b333d" stroke-width="1"/><text x="0" y="${lineY + 4}" fill="#697480" font-size="10">${formatTokens(value)}</text>`;
  }).join("");
  const labels = points.map((point, index) => index % (points.length > 9 ? 2 : 1) === 0 ? `<text x="${x(index)}" y="239" fill="#697480" font-size="10" text-anchor="middle">${escapeHtml(point.label)}</text>` : "").join("");
  const dots = points.map((point, index) => `<circle cx="${x(index)}" cy="${y(account === "all" ? point.total : Math.round(point.total * (account === "hackathon" ? .48 : account === "personal" ? .22 : .30)))}" r="3.2" fill="#45d6dc"/>`).join("");
  svg.innerHTML = `${grid}<polyline points="${line}" fill="none" stroke="#45d6dc" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><polyline points="${outputLine}" fill="none" stroke="#9c8cff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>${dots}${labels}`;
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
    const action = branch.safeLocalDelete ? "Preview" : "Keep";
    return `<tr><td>${escapeHtml(branch.name)}</td><td>${branch.inactiveDays === null ? "--" : `${branch.inactiveDays}d`}</td><td><span class="branch-state ${stateClass}">${stateLabel}</span></td><td>${action}</td></tr>`;
  }).join("");
}

function renderCodexState() {
  if (!state.codex) return;
  const categories = Object.values(state.codex.categories).filter((category) => category.exists);
  $("#metric-state").textContent = formatTokens(state.codex.aggregate.totalBytes) + "B";
  $("#metric-state-detail").textContent = `${state.codex.aggregate.fileCount} files scanned`;
  $("#state-list").innerHTML = categories.length ? categories.map((category) => `<div class="state-row"><span>${escapeHtml(category.root.split(/[\\/]/).pop())}</span><strong>${category.fileCount} files - ${formatTokens(category.totalBytes)}B</strong></div>`).join("") : `<div class="empty-state">No common Codex state folders found.</div>`;
}

function renderGitHubProfiles() {
  const container = $("#github-profiles");
  if (!state.githubProfiles.length) return;
  container.innerHTML = state.githubProfiles.map((profile) => profile.status === "ok"
    ? `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>${escapeHtml(profile.name)} - ${profile.followers} followers</span></div><b class="profile-repos">${profile.publicRepos} repos</b></div>`
    : `<div class="profile-row"><div><strong>${escapeHtml(profile.login)}</strong><span>Could not read public profile</span></div><b class="profile-repos">Error</b></div>`).join("");
}

async function loadUsage() {
  state.usage = window.codexGuard?.getDemoUsage ? await window.codexGuard.getDemoUsage() : (await import("../core/demo-usage.mjs")).getDemoUsage();
  renderAccounts();
  renderChart();
}

async function scanRepository() {
  if (!window.codexGuard?.chooseRepository) return showToast("Electron bridge is not available.");
  const repositoryPath = await window.codexGuard.chooseRepository();
  if (!repositoryPath) return;
  state.repository = await window.codexGuard.scanRepository(repositoryPath, { baseBranch: "staging" });
  renderRepository();
  showToast(`Scanned ${state.repository.summary.localBranchCount} local branches.`);
}

async function scanCodex() {
  if (!window.codexGuard?.scanCodexState) return showToast("Electron bridge is not available.");
  state.codex = await window.codexGuard.scanCodexState();
  renderCodexState();
  showToast("Local Codex state scanned.");
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
  showToast(`${button.textContent.trim()} view is coming in the next build batch.`);
}));
document.querySelectorAll(".range-button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".range-button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  renderChart();
}));
$("#account-filter").addEventListener("change", renderChart);
$("#refresh-usage").addEventListener("click", loadUsage);
$("#scan-repository").addEventListener("click", scanRepository);
$("#scan-codex").addEventListener("click", scanCodex);
$("#refresh-profiles").addEventListener("click", loadGitHubProfiles);

await loadUsage();
await loadGitHubProfiles();
