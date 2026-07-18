import test from "node:test";
import assert from "node:assert/strict";
import { createHandoffReport } from "../src/core/index.mjs";

test("creates a sanitized handoff report without credential content", () => {
  const report = createHandoffReport({
    repository: {
      repoPath: "C:/work/example",
      baseBranch: "main",
      currentBranch: "feature/demo",
      summary: { localBranchCount: 3, worktreeCount: 1, localDeleteCandidates: 1 },
      branches: [{ name: "codex/merged-old", safeLocalDelete: true, inactiveDays: 45 }],
    },
    usage: { source: "openai-api-platform", rangeDays: 14, accounts: [{ tokens: 9000 }] },
  });

  assert.match(report, /Folder: example/);
  assert.match(report, /codex\/merged-old/);
  assert.doesNotMatch(report, /OPENAI_ADMIN_KEY|auth\.json|sk-/i);
});

test("includes an explicit user-authored continuation brief", () => {
  const report = createHandoffReport({
    brief: {
      currentState: "Repository cleanup is implemented.",
      goal: "Finish the account dashboard.",
      nextSteps: "Run the visual review.",
      title: "Continue the MVP",
    },
  });

  assert.match(report, /Title: Continue the MVP/);
  assert.match(report, /Finish the account dashboard/);
  assert.match(report, /Run the visual review/);
});
