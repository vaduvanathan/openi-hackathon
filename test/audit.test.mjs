import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent } from "../src/core/index.mjs";

test("writes a local audit event without secret fields", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-audit-"));
  const auditPath = path.join(root, "audit", "events.jsonl");
  const event = await appendAuditEvent(auditPath, {
    type: "repository-scan",
    repository: "C:/demo/repository",
    branchCount: 3,
  });
  const saved = JSON.parse((await readFile(auditPath, "utf8")).trim());

  assert.equal(saved.id, event.id);
  assert.equal(saved.type, "repository-scan");
  assert.equal(saved.branchCount, 3);
  assert.equal(Object.hasOwn(saved, "secret"), false);
});
