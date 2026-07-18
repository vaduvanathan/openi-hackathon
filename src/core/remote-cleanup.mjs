import { appendAuditEvent } from "./audit.mjs";
import { runCommand } from "./command.mjs";
import { scanRepository } from "./git-scanner.mjs";

function validateBranchName(branchName) {
  if (typeof branchName !== "string" || !branchName.trim() || branchName.startsWith("-")) {
    throw new Error("A valid remote branch name is required.");
  }
  return branchName;
}

async function openPullRequestsForBranch(repoPath, branchName) {
  try {
    const { stdout } = await runCommand("gh", ["pr", "list", "--head", branchName, "--state", "open", "--json", "number", "--limit", "1"], { cwd: repoPath });
    const pullRequests = JSON.parse(stdout || "[]");
    return { available: true, count: Array.isArray(pullRequests) ? pullRequests.length : 0 };
  } catch {
    return { available: false, count: null };
  }
}

export async function deleteVerifiedRemoteBranch(repoPath, branchName, {
  auditPath,
  baseBranch,
  now,
  protectedBranches,
  staleAfterDays,
} = {}) {
  const branch = validateBranchName(branchName);
  const scan = await scanRepository(repoPath, { baseBranch, now, protectedBranches, refreshRemote: true, staleAfterDays });
  const candidate = scan.remoteCandidates.find((item) => item.name === branch && item.remote === "origin");
  if (!candidate) throw new Error("This remote branch is no longer a merged, stale cleanup candidate.");

  const pullRequests = await openPullRequestsForBranch(repoPath, branch);
  if (!pullRequests.available) throw new Error("GitHub CLI PR verification is unavailable. Sign in with gh before deleting remote branches.");
  if (pullRequests.count > 0) throw new Error("An open pull request exists for this branch.");

  await runCommand("git", ["-C", repoPath, "push", "origin", "--delete", branch]);
  const event = auditPath ? await appendAuditEvent(auditPath, {
    branch,
    commit: candidate.sha,
    repository: repoPath,
    type: "remote-branch-deleted",
  }) : null;
  return {
    auditEventId: event?.id ?? null,
    branch,
    deleted: true,
    scan: await scanRepository(repoPath, { baseBranch, now, protectedBranches, refreshRemote: true, staleAfterDays }),
  };
}
