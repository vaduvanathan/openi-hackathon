import test from "node:test";
import assert from "node:assert/strict";
import { scanRepository } from "../src/core/index.mjs";

const fixtureRepository = "C:/open-ai-handoff/fixtures/codex-session-guard-demo";

test("classifies merged, stale, active, protected, and worktree branches", async () => {
  const result = await scanRepository(fixtureRepository, {
    baseBranch: "staging",
    now: Date.parse("2026-07-18T12:00:00+05:30"),
  });
  const branches = new Map(result.branches.map((branch) => [branch.name, branch]));

  assert.equal(branches.get("codex/merged-dashboard").mergedIntoBase, true);
  assert.equal(branches.get("codex/merged-old").safeLocalDelete, true);
  assert.equal(branches.get("codex/stale-experiment").mergedIntoBase, false);
  assert.equal(branches.get("codex/stale-experiment").safeLocalDelete, false);
  assert.equal(branches.get("codex/active-task").safeLocalDelete, false);
  assert.equal(branches.get("staging").protectedBranch, true);
  assert.equal(branches.get("codex/stale-experiment").checkedOutWorktree, true);
  assert.equal(result.summary.worktreeCount, 2);
});
