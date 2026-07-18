import { appendAuditEvent } from "./audit.mjs";
import { runCommand } from "./command.mjs";
import { scanRepository } from "./git-scanner.mjs";

function validateBranchName(branchName) {
  if (typeof branchName !== "string" || branchName.trim().length === 0 || branchName.startsWith("-")) {
    throw new Error("A valid local branch name is required.");
  }
  return branchName;
}

export async function deleteSafeLocalBranch(repoPath, branchName, {
  auditPath,
  baseBranch,
  now,
  protectedBranches,
  staleAfterDays,
} = {}) {
  const branch = validateBranchName(branchName);
  const scan = await scanRepository(repoPath, { baseBranch, now, protectedBranches, staleAfterDays });
  const candidate = scan.branches.find((item) => item.name === branch);

  if (!candidate) throw new Error(`Local branch ${branch} was not found.`);
  if (!candidate.safeLocalDelete) {
    throw new Error(`Local branch ${branch} is not eligible for safe deletion: ${candidate.reasons.join(", ")}.`);
  }

  await runCommand("git", ["-C", repoPath, "branch", "-d", "--", branch]);
  const event = auditPath ? await appendAuditEvent(auditPath, {
    branch,
    commit: candidate.sha,
    repository: repoPath,
    type: "local-branch-deleted",
  }) : null;
  const updatedScan = await scanRepository(repoPath, { baseBranch, now, protectedBranches, staleAfterDays });

  return {
    auditEventId: event?.id ?? null,
    branch,
    deleted: true,
    scan: updatedScan,
  };
}
