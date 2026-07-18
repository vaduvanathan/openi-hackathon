import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectCodexSession } from "../src/core/index.mjs";
import { runCommand } from "../src/core/command.mjs";

async function git(repoPath, args) {
  await runCommand("git", ["-C", repoPath, ...args]);
}

test("reads only local session workspace metadata and scans its Git repository", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-inspector-"));
  const repository = path.join(codexHome, "project");
  const sessions = path.join(codexHome, "sessions");
  await mkdir(repository, { recursive: true });
  await mkdir(sessions, { recursive: true });
  await git(repository, ["init", "-b", "main"]);
  await git(repository, ["config", "user.email", "test@example.com"]);
  await git(repository, ["config", "user.name", "Test User"]);
  await writeFile(path.join(repository, "README.md"), "# project\n");
  await git(repository, ["add", "README.md"]);
  await git(repository, ["commit", "-m", "Initial commit"]);
  await writeFile(path.join(sessions, "session.jsonl"), `${JSON.stringify({ payload: { cwd: repository, secret: "must-not-be-returned" }, type: "session_meta" })}\n`);

  const result = await inspectCodexSession({ category: "sessions", relativePath: "session.jsonl" }, { codexHome });
  assert.equal(path.normalize(result.repository.path), path.normalize(repository));
  assert.equal(result.repository.currentBranch, "main");
  assert.equal(JSON.stringify(result).includes("must-not-be-returned"), false);
});
