import test from "node:test";
import assert from "node:assert/strict";
import { getPresentationGitHubWorkspace, getPresentationRepositoryScan } from "../src/core/index.mjs";

test("provides a token-free presentation GitHub workspace with non-destructive scans", () => {
  const workspace = getPresentationGitHubWorkspace();
  assert.equal(workspace.accounts.length, 2);
  const repository = workspace.repositoriesByAccount.vaduvanathan[0].nameWithOwner;
  const scan = getPresentationRepositoryScan(repository);
  assert.equal(scan.presentation, true);
  assert.equal(scan.summary.localDeleteCandidates, 1);
  assert.equal(Object.hasOwn(JSON.parse(JSON.stringify(workspace)), "token"), false);
});
