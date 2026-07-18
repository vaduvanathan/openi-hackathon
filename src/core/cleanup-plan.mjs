export function createCleanupPlan(scanResult, { selectedBranchNames } = {}) {
  const selected = selectedBranchNames ? new Set(selectedBranchNames) : null;
  const actions = scanResult.branches
    .filter((branch) => branch.safeLocalDelete)
    .filter((branch) => !selected || selected.has(branch.name))
    .map((branch) => ({
      type: "delete-local-branch",
      branch: branch.name,
      commit: branch.sha,
      reason: `merged into ${scanResult.baseBranch} and inactive for ${branch.inactiveDays} days`,
      requiresConfirmation: true,
    }));

  return {
    repository: scanResult.repoPath,
    baseBranch: scanResult.baseBranch,
    generatedAt: new Date().toISOString(),
    destructiveActionsEnabled: false,
    actions,
    blockedBranches: scanResult.branches
      .filter((branch) => !branch.safeLocalDelete)
      .map((branch) => ({ name: branch.name, reasons: branch.reasons })),
  };
}
