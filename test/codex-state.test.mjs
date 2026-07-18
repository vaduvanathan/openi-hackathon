import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { scanCodexState } from "../src/core/index.mjs";

test("scans Codex metadata without opening protected filenames", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-"));
  await mkdir(path.join(root, "sessions"));
  await writeFile(path.join(root, "sessions", "session.jsonl"), "metadata only");
  await writeFile(path.join(root, "auth.json"), "not read by scanner");

  const result = await scanCodexState(root);
  assert.equal(result.categories.sessions.fileCount, 1);
  assert.equal(result.aggregate.fileCount, 1);
  assert.equal(result.policy.contentsRead, false);
  assert.equal(result.policy.authFilesOpened, false);
});
