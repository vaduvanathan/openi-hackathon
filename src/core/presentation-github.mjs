const DAY = 86_400_000;
const NOW = Date.parse("2026-07-18T12:00:00Z");

const ACCOUNTS = [
  { active: true, host: "github.com", login: "vaduvanathan", scopes: "Presentation data" },
  { active: false, host: "github.com", login: "nathan-build", scopes: "Presentation data" },
];

const REPOSITORIES = {
  "vaduvanathan": [
    { defaultBranch: "main", isPrivate: false, nameWithOwner: "vaduvanathan/openi-hackathon", updatedAt: "2026-07-18T09:32:06Z", url: "https://github.com/vaduvanathan/openi-hackathon" },
    { defaultBranch: "main", isPrivate: false, nameWithOwner: "vaduvanathan/codex-session-guard-demo", updatedAt: "2026-07-18T07:05:29Z", url: "https://github.com/vaduvanathan/codex-session-guard-demo" },
  ],
  "nathan-build": [
    { defaultBranch: "main", isPrivate: true, nameWithOwner: "nathan-build/workspace-demo", updatedAt: "2026-07-17T15:20:00Z", url: "https://github.com/nathan-build/workspace-demo" },
  ],
};

function branch(name, { days, merged = false, protectedBranch = false, worktree = false } = {}) {
  const commitDate = new Date(NOW - days * DAY).toISOString();
  const safeLocalDelete = merged && days >= 30 && !protectedBranch && !worktree;
  return {
    checkedOutWorktree: worktree,
    commitDate,
    hasRemote: true,
    inactiveDays: days,
    isCurrent: protectedBranch,
    mergedIntoBase: merged,
    name,
    protectedBranch,
    recommendation: safeLocalDelete ? "review-for-local-delete" : "keep-or-review",
    reasons: safeLocalDelete ? [] : [protectedBranch ? "protected branch" : worktree ? "checked out in a worktree" : merged ? "recent activity" : "not merged into main"],
    remoteDeleted: false,
    safeLocalDelete,
    sha: `presentation-${name.replace(/[^a-z0-9]/gi, "").slice(0, 16)}`,
    subject: "Presentation branch",
    upstream: `origin/${name}`,
  };
}

export function getPresentationGitHubWorkspace() {
  return { accounts: ACCOUNTS, available: true, repositoriesByAccount: REPOSITORIES };
}

export function getPresentationRepositoryScan(repository) {
  const known = Object.values(REPOSITORIES).flat().find((item) => item.nameWithOwner === repository);
  if (!known) throw new Error("Presentation repository was not found.");
  const branches = [
    branch("main", { days: 0, merged: true, protectedBranch: true }),
    branch("staging", { days: 2, merged: true, protectedBranch: true }),
    branch("codex/merged-cleanup", { days: 46, merged: true }),
    branch("codex/active-telemetry", { days: 3, merged: false }),
    branch("feature/current-review", { days: 12, merged: false, worktree: true }),
  ];
  const stale = branches.find((item) => item.name === "codex/merged-cleanup");
  return {
    baseBranch: known.defaultBranch,
    branches,
    currentBranch: "main",
    presentation: true,
    remoteCandidates: [{
      ...stale,
      eligibleForReview: true,
      name: stale.name,
      prVerification: "presentation-data",
      remote: "origin",
      remoteRef: `origin/${stale.name}`,
    }],
    remoteSync: "presentation-data",
    remoteBranches: branches.map((item) => ({ ...item, name: `origin/${item.name}` })),
    repoPath: `Presentation workspace / ${repository}`,
    staleAfterDays: 30,
    summary: { localBranchCount: branches.length, localDeleteCandidates: 1, remoteBranchCount: branches.length, remoteDeleteCandidates: 1, worktreeCount: 1 },
    worktrees: [{ branch: "main", detached: false, head: "presentation-main", path: `Presentation workspace / ${repository}` }, { branch: "feature/current-review", detached: false, head: "presentation-worktree", path: "Presentation workspace / current-review" }],
  };
}
