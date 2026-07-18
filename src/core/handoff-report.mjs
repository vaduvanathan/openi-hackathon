import path from "node:path";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
  return `${bytes} B`;
}

function formatTokens(tokens) {
  if (!Number.isFinite(tokens)) return "Not loaded";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens);
}

export function createHandoffReport({ brief, codex, repository, usage } = {}) {
  const lines = [
    "# Codex Session Guard Handoff",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
  ];

  const handoffBrief = {
    currentState: typeof brief?.currentState === "string" ? brief.currentState.trim() : "",
    goal: typeof brief?.goal === "string" ? brief.goal.trim() : "",
    nextSteps: typeof brief?.nextSteps === "string" ? brief.nextSteps.trim() : "",
    title: typeof brief?.title === "string" ? brief.title.trim() : "",
  };
  if (handoffBrief.title || handoffBrief.goal || handoffBrief.currentState || handoffBrief.nextSteps) {
    lines.splice(4, 0, "## Continuation Brief", "", `- Title: ${handoffBrief.title || "Untitled handoff"}`);
    if (handoffBrief.goal) lines.push("", "### Goal", "", handoffBrief.goal);
    if (handoffBrief.currentState) lines.push("", "### Current State", "", handoffBrief.currentState);
    if (handoffBrief.nextSteps) lines.push("", "### Next Steps", "", handoffBrief.nextSteps);
    lines.push("");
  }

  lines.push(
    "## Scope",
    "",
    "This report contains local repository and metadata-only state. It does not include chat transcripts, auth files, API keys, access tokens, cookies, or environment variable values.",
    "",
    "## Repository",
    "",
  );

  if (repository) {
    lines.push(`- Folder: ${path.basename(repository.repoPath)}`);
    lines.push(`- Base branch: ${repository.baseBranch}`);
    lines.push(`- Current branch: ${repository.currentBranch || "detached HEAD"}`);
    lines.push(`- Local branches: ${repository.summary.localBranchCount}`);
    lines.push(`- Worktrees: ${repository.summary.worktreeCount}`);
    lines.push(`- Safe local cleanup candidates: ${repository.summary.localDeleteCandidates}`);
    const candidates = repository.branches.filter((branch) => branch.safeLocalDelete);
    if (candidates.length) {
      lines.push("", "### Cleanup Candidates", "");
      for (const branch of candidates) lines.push(`- ${branch.name}: merged into ${repository.baseBranch}, inactive ${branch.inactiveDays} days`);
    }
  } else {
    lines.push("- No repository scan was included.");
  }

  lines.push("", "## Local Codex State", "");
  if (codex) {
    lines.push(`- Metadata files scanned: ${codex.aggregate.fileCount}`);
    lines.push(`- Metadata storage: ${formatBytes(codex.aggregate.totalBytes)}`);
  } else {
    lines.push("- No local Codex metadata scan was included.");
  }

  lines.push("", "## Usage Source", "");
  if (usage?.source === "openai-api-platform") {
    const tokens = usage.accounts?.reduce((total, account) => total + (account.tokens || 0), 0) ?? 0;
    lines.push("- Source: OpenAI API Platform organization usage and costs");
    lines.push(`- Range: ${usage.rangeDays} days`);
    lines.push(`- Total tokens: ${formatTokens(tokens)}`);
  } else if (usage?.source === "demo") {
    lines.push("- Source: Illustrative demo data only");
  } else {
    lines.push("- No usage source was loaded.");
  }

  lines.push("", "## Safety", "", "- No remote branches were deleted.", "- Any local deletion was separately confirmed and recorded in the local audit log.");
  return `${lines.join("\n")}\n`;
}
