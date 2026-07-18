import { scanRepository } from "../src/core/index.mjs";

const repositoryPath = process.argv[2] ?? "C:/open-ai-handoff/fixtures/codex-session-guard-demo";
const result = await scanRepository(repositoryPath, { baseBranch: "staging" });
console.log(JSON.stringify({
  repository: result.repoPath,
  baseBranch: result.baseBranch,
  summary: result.summary,
  candidates: result.branches.filter((branch) => branch.safeLocalDelete).map((branch) => ({
    name: branch.name,
    sha: branch.sha,
    inactiveDays: branch.inactiveDays,
    hasRemote: branch.hasRemote,
  })),
  worktrees: result.worktrees,
}, null, 2));
