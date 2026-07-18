import { runCommand } from "./command.mjs";

const FIELD_SEPARATOR = "\0";

function parseRecords(output, fields) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.split(FIELD_SEPARATOR))
    .map((values) => {
      const record = Object.fromEntries(fields.map((field, index) => [field, values[index] ?? ""]));
      return record;
    })
    .filter((record) => record.name);
}

async function git(repoPath, args) {
  return (await runCommand("git", ["-C", repoPath, ...args])).stdout.trim();
}

async function refreshOrigin(repoPath) {
  try {
    await git(repoPath, ["fetch", "origin", "--prune"]);
    return "synced";
  } catch {
    return "not-available";
  }
}

async function getCurrentBranch(repoPath) {
  try {
    return await git(repoPath, ["symbolic-ref", "--quiet", "--short", "HEAD"]);
  } catch {
    return null;
  }
}

async function getBaseBranch(repoPath, requestedBase) {
  if (requestedBase) return requestedBase;
  try {
    const remoteHead = await git(repoPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]);
    return remoteHead.replace(/^origin\//, "");
  } catch {
    return (await getCurrentBranch(repoPath)) ?? "main";
  }
}

async function getWorktrees(repoPath) {
  const output = await git(repoPath, ["worktree", "list", "--porcelain"]);
  const blocks = output.split(/\r?\n\r?\n/).filter(Boolean);
  return blocks.map((block) => {
    const record = {};
    for (const line of block.split(/\r?\n/)) {
      if (line === "detached" || line === "bare") {
        record[line] = true;
        continue;
      }
      const separator = line.indexOf(" ");
      if (separator === -1) continue;
      record[line.slice(0, separator)] = line.slice(separator + 1);
    }
    return {
      path: record.worktree,
      head: record.HEAD,
      branch: record.branch?.replace(/^refs\/heads\//, "") ?? null,
      detached: "detached" in record,
      bare: "bare" in record,
    };
  });
}

async function getLocalBranches(repoPath) {
  const format = ["%(refname:short)", "%(objectname)", "%(committerdate:iso8601)", "%(subject)", "%(upstream:short)"].join("%00");
  const output = await git(repoPath, ["for-each-ref", `--format=${format}`, "refs/heads"]);
  return parseRecords(output, ["name", "sha", "commitDate", "subject", "upstream"]);
}

async function getRemoteBranches(repoPath) {
  const format = ["%(refname:short)", "%(objectname)", "%(committerdate:iso8601)", "%(subject)"].join("%00");
  const output = await git(repoPath, ["for-each-ref", `--format=${format}`, "refs/remotes"]);
  return parseRecords(output, ["name", "sha", "commitDate", "subject"])
    .filter((branch) => branch.name !== "origin/HEAD");
}

async function getMergedBranches(repoPath, baseBranch) {
  const output = await git(repoPath, ["for-each-ref", "--format=%(refname:short)", "--merged", `refs/heads/${baseBranch}`, "refs/heads"]);
  return new Set(output.split(/\r?\n/).filter(Boolean));
}

async function getMergedRemoteBranches(repoPath, baseBranch) {
  const remoteBase = `refs/remotes/origin/${baseBranch}`;
  let mergeTarget = remoteBase;
  try {
    await git(repoPath, ["show-ref", "--verify", "--quiet", remoteBase]);
  } catch {
    mergeTarget = `refs/heads/${baseBranch}`;
  }
  const output = await git(repoPath, ["for-each-ref", "--format=%(refname:short)", "--merged", mergeTarget, "refs/remotes/origin"]);
  return new Set(output.split(/\r?\n/).filter(Boolean));
}

function daysSince(dateValue, now) {
  const timestamp = Date.parse(dateValue);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}

export async function scanRepository(repoPath, {
  baseBranch,
  refreshRemote = false,
  staleAfterDays = 30,
  protectedBranches = ["main", "master", "staging"],
  now = Date.now(),
} = {}) {
  const remoteSync = refreshRemote ? await refreshOrigin(repoPath) : "not-requested";
  const base = await getBaseBranch(repoPath, baseBranch);
  const [currentBranch, localBranches, remoteBranches, worktrees, mergedBranches, mergedRemoteBranches] = await Promise.all([
    getCurrentBranch(repoPath),
    getLocalBranches(repoPath),
    getRemoteBranches(repoPath),
    getWorktrees(repoPath),
    getMergedBranches(repoPath, base),
    getMergedRemoteBranches(repoPath, base),
  ]);
  const checkedOutBranches = new Set(worktrees.map((worktree) => worktree.branch).filter(Boolean));
  const remoteNames = new Set(remoteBranches.map((branch) => branch.name.replace(/^origin\//, "")));

  const branches = localBranches.map((branch) => {
    const inactiveDays = daysSince(branch.commitDate, now);
    const isCurrent = branch.name === currentBranch;
    const checkedOutWorktree = checkedOutBranches.has(branch.name);
    const mergedIntoBase = mergedBranches.has(branch.name);
    const protectedBranch = protectedBranches.includes(branch.name);
    const reasons = [];
    if (protectedBranch) reasons.push("protected branch");
    if (isCurrent) reasons.push("current branch");
    if (checkedOutWorktree) reasons.push("checked out in a worktree");
    if (!mergedIntoBase) reasons.push(`not merged into ${base}`);
    if (inactiveDays === null || inactiveDays < staleAfterDays) reasons.push("recent activity");
    const safeLocalDelete = mergedIntoBase && inactiveDays >= staleAfterDays && !protectedBranch && !isCurrent && !checkedOutWorktree;
    return {
      ...branch,
      inactiveDays,
      mergedIntoBase,
      protectedBranch,
      isCurrent,
      checkedOutWorktree,
      hasRemote: remoteNames.has(branch.name),
      remoteDeleted: Boolean(branch.upstream) && !remoteNames.has(branch.name),
      safeLocalDelete,
      recommendation: safeLocalDelete ? "review-for-local-delete" : "keep-or-review",
      reasons,
    };
  });

  const remoteCandidates = remoteBranches
    .map((branch) => {
      const [remote, ...nameParts] = branch.name.split("/");
      const name = nameParts.join("/");
      const inactiveDays = daysSince(branch.commitDate, now);
      const protectedBranch = protectedBranches.includes(name);
      const mergedIntoBase = mergedRemoteBranches.has(branch.name);
      const eligibleForReview = remote === "origin" && Boolean(name) && mergedIntoBase && inactiveDays !== null && inactiveDays >= staleAfterDays && !protectedBranch;
      return {
        ...branch,
        inactiveDays,
        mergedIntoBase,
        name,
        protectedBranch,
        remote,
        remoteRef: branch.name,
        eligibleForReview,
        prVerification: eligibleForReview ? "required" : "not-applicable",
      };
    })
    .filter((branch) => branch.eligibleForReview)
    .sort((first, second) => second.inactiveDays - first.inactiveDays);

  return {
    repoPath,
    baseBranch: base,
    currentBranch,
    staleAfterDays,
    branches,
    remoteBranches,
    remoteCandidates,
    remoteSync,
    worktrees,
    summary: {
      localBranchCount: branches.length,
      remoteBranchCount: remoteBranches.length,
      worktreeCount: worktrees.length,
      localDeleteCandidates: branches.filter((branch) => branch.safeLocalDelete).length,
      remoteDeleteCandidates: remoteCandidates.length,
    },
  };
}
