import { appendAuditEvent } from "./audit.mjs";
import { runCommand } from "./command.mjs";
import { scanRepository } from "./git-scanner.mjs";
import { createRecoveryManifest, listRecoveryManifests, readRecoveryManifest, updateRecoveryManifest } from "./recovery-manifest.mjs";

function validateBranchName(branchName) {
  if (typeof branchName !== "string" || branchName.trim().length === 0 || branchName.startsWith("-")) {
    throw new Error("A valid local branch name is required.");
  }
  return branchName;
}

async function refExists(repoPath, refName) {
  try {
    await runCommand("git", ["-C", repoPath, "show-ref", "--verify", "--quiet", refName]);
    return true;
  } catch {
    return false;
  }
}

async function commitExists(repoPath, commit) {
  try {
    await runCommand("git", ["-C", repoPath, "cat-file", "-e", `${commit}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteSafeLocalBranch(repoPath, branchName, {
  auditPath,
  baseBranch,
  manifestDirectory,
  now,
  protectedBranches,
  staleAfterDays,
} = {}) {
  const branch = validateBranchName(branchName);
  if (!manifestDirectory) throw new Error("A recovery manifest directory is required.");
  const scan = await scanRepository(repoPath, { baseBranch, now, protectedBranches, staleAfterDays });
  const candidate = scan.branches.find((item) => item.name === branch);

  if (!candidate) throw new Error(`Local branch ${branch} was not found.`);
  if (!candidate.safeLocalDelete) {
    throw new Error(`Local branch ${branch} is not eligible for safe deletion: ${candidate.reasons.join(", ")}.`);
  }

  const manifest = await createRecoveryManifest(manifestDirectory, {
    baseBranch: scan.baseBranch,
    branch,
    commit: candidate.sha,
    repository: repoPath,
    type: "local-branch-recovery",
  });
  try {
    await runCommand("git", ["-C", repoPath, "branch", "-d", "--", branch]);
  } catch (error) {
    await updateRecoveryManifest(manifestDirectory, manifest.id, { status: "delete-failed" });
    throw error;
  }
  const event = auditPath ? await appendAuditEvent(auditPath, {
    branch,
    commit: candidate.sha,
    repository: repoPath,
    type: "local-branch-deleted",
  }) : null;
  const updatedManifest = await updateRecoveryManifest(manifestDirectory, manifest.id, {
    auditEventId: event?.id ?? null,
    deletedAt: new Date().toISOString(),
    status: "deleted",
  });
  const updatedScan = await scanRepository(repoPath, { baseBranch, now, protectedBranches, staleAfterDays });

  return {
    auditEventId: event?.id ?? null,
    branch,
    deleted: true,
    manifest: updatedManifest,
    scan: updatedScan,
  };
}

export async function deleteSafeLocalBranches(repoPath, branchNames, options = {}) {
  const uniqueBranches = [...new Set((branchNames || []).map(validateBranchName))];
  if (!uniqueBranches.length) throw new Error("Select at least one local branch to delete.");
  const results = [];
  for (const branch of uniqueBranches) {
    try {
      results.push({ branch, ...(await deleteSafeLocalBranch(repoPath, branch, options)) });
    } catch (error) {
      results.push({ branch, deleted: false, error: error.message });
    }
  }
  return results;
}

export async function listLocalBranchRecoveryManifests(manifestDirectory) {
  return listRecoveryManifests(manifestDirectory, { type: "local-branch-recovery" });
}

export async function restoreSafeLocalBranch(manifestDirectory, manifestId, { auditPath } = {}) {
  const manifest = await readRecoveryManifest(manifestDirectory, manifestId);
  if (manifest.type !== "local-branch-recovery" || manifest.status !== "deleted") {
    throw new Error("This recovery manifest is not eligible for branch restore.");
  }
  const branch = validateBranchName(manifest.branch);
  if (await refExists(manifest.repository, `refs/heads/${branch}`)) {
    throw new Error(`Local branch ${branch} already exists and will not be overwritten.`);
  }
  if (!await commitExists(manifest.repository, manifest.commit)) {
    throw new Error("The commit required for branch restore is no longer available locally.");
  }
  await runCommand("git", ["-C", manifest.repository, "branch", branch, manifest.commit]);
  const event = auditPath ? await appendAuditEvent(auditPath, {
    branch,
    commit: manifest.commit,
    repository: manifest.repository,
    type: "local-branch-restored",
  }) : null;
  const updatedManifest = await updateRecoveryManifest(manifestDirectory, manifest.id, {
    restoredAt: new Date().toISOString(),
    restoreAuditEventId: event?.id ?? null,
    status: "restored",
  });
  return { branch, manifest: updatedManifest, restored: true, repository: manifest.repository };
}
