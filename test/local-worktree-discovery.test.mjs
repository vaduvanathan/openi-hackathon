import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverLocalAgentWorktrees } from "../src/core/index.mjs";

test("discovers Git worktrees only beneath explicitly supplied local agent roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-worktrees-"));
  const repository = path.join(root, "task", "repository");
  await mkdir(path.join(repository, ".git"), { recursive: true });
  await writeFile(path.join(repository, ".git", "HEAD"), "ref: refs/heads/main\n");
  const result = await discoverLocalAgentWorktrees({ roots: [root] });
  assert.deepEqual(result.repositories, [repository]);
  assert.deepEqual(result.availableRoots, [root]);
});
