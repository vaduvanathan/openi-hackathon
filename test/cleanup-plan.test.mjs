import test from "node:test";
import assert from "node:assert/strict";
import { createCleanupPlan, scanRepository } from "../src/core/index.mjs";

test("creates a confirmation-required plan without enabling deletion", async () => {
  const scan = await scanRepository("C:/open-ai-handoff/fixtures/codex-session-guard-demo", {
    baseBranch: "staging",
    now: Date.parse("2026-07-18T12:00:00+05:30"),
  });
  const plan = createCleanupPlan(scan);
  assert.equal(plan.destructiveActionsEnabled, false);
  assert.equal(plan.actions.length, 1);
  assert.equal(plan.actions[0].branch, "codex/merged-old");
  assert.equal(plan.actions[0].requiresConfirmation, true);
});
