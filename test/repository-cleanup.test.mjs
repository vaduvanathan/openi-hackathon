import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { deleteSafeLocalBranch, listLocalBranchRecoveryManifests, restoreSafeLocalBranch } from "../src/core/index.mjs";
import { runCommand } from "../src/core/command.mjs";

async function git(repoPath, args) {
  await runCommand("git", ["-C", repoPath, ...args]);
}

test("deletes only a freshly rescanned safe local branch and audits the action", async () => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-cleanup-"));
  const auditPath = path.join(repository, "audit", "events.jsonl");
  const manifestDirectory = path.join(repository, "recovery-manifests");
  const now = Date.parse("2026-07-18T12:00:00Z");
  await git(repository, ["init", "-b", "main"]);
  await git(repository, ["config", "user.email", "test@example.com"]);
  await git(repository, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repository, "README.md"), "# fixture\n");
  await git(repository, ["add", "README.md"]);
  await git(repository, ["commit", "-m", "Initial commit"]);
  await git(repository, ["branch", "codex/merged-old"]);

  const result = await deleteSafeLocalBranch(repository, "codex/merged-old", {
    auditPath,
    baseBranch: "main",
    manifestDirectory,
    now: now + 31 * 86_400_000,
    staleAfterDays: 30,
  });
  const auditRecord = JSON.parse((await readFile(auditPath, "utf8")).trim());

  assert.equal(result.deleted, true);
  assert.equal(result.scan.branches.some((branch) => branch.name === "codex/merged-old"), false);
  assert.equal(auditRecord.type, "local-branch-deleted");
  assert.equal(auditRecord.branch, "codex/merged-old");
  const [manifest] = await listLocalBranchRecoveryManifests(manifestDirectory);
  assert.equal(manifest.status, "deleted");

  const restored = await restoreSafeLocalBranch(manifestDirectory, manifest.id, { auditPath });
  assert.equal(restored.restored, true);
  assert.equal(restored.branch, "codex/merged-old");
  assert.equal((await git(repository, ["show-ref", "--verify", "--quiet", "refs/heads/codex/merged-old"])), undefined);
});
