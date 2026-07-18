import test from "node:test";
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listCodexSessionCandidates, listQuarantinedCodexSessions, quarantineCodexSession, restoreQuarantinedCodexSession } from "../src/core/index.mjs";

test("quarantines and restores a selected local Codex session without touching protected files", async () => {
  const codexHome = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-quarantine-"));
  const sessions = path.join(codexHome, "sessions");
  const manifestDirectory = path.join(codexHome, "app-data", "recovery-manifests");
  const quarantineDirectory = path.join(codexHome, "app-data", "quarantine");
  const auditPath = path.join(codexHome, "app-data", "audit", "events.jsonl");
  await mkdir(path.join(sessions, "nested"), { recursive: true });
  await writeFile(path.join(sessions, "nested", "old-session.jsonl"), [
    JSON.stringify({ payload: { content: [{ text: "# AGENTS.md instructions" }], role: "user", type: "message" }, type: "response_item" }),
    JSON.stringify({ payload: { content: [{ text: "Make the Windows branch cleanup workflow easier to review." }], role: "user", type: "message" }, type: "response_item" }),
  ].join("\n"));
  await writeFile(path.join(sessions, "auth.json"), "protected credential data");
  await writeFile(path.join(sessions, ".env"), "protected environment data");

  const candidates = await listCodexSessionCandidates(codexHome, { now: Date.parse("2026-07-18T12:00:00Z") });
  assert.deepEqual(candidates.map((candidate) => candidate.relativePath), [path.join("nested", "old-session.jsonl")]);
  assert.equal(candidates[0].taskTitle, "Make the Windows branch cleanup workflow easier to review.");

  const result = await quarantineCodexSession(codexHome, candidates[0], {
    auditPath,
    manifestDirectory,
    quarantineDirectory,
  });
  assert.equal(result.quarantined, true);
  await assert.rejects(lstat(path.join(sessions, "nested", "old-session.jsonl")));
  await lstat(result.manifest.quarantinedPath);
  await lstat(path.join(sessions, "auth.json"));

  const [manifest] = await listQuarantinedCodexSessions(manifestDirectory);
  assert.equal(manifest.status, "quarantined");
  await writeFile(path.join(sessions, "nested", "old-session.jsonl"), "replacement payload");
  await assert.rejects(restoreQuarantinedCodexSession(manifestDirectory, quarantineDirectory, manifest.id, { auditPath }));
  await lstat(manifest.quarantinedPath);
  await unlink(path.join(sessions, "nested", "old-session.jsonl"));
  const restored = await restoreQuarantinedCodexSession(manifestDirectory, quarantineDirectory, manifest.id, { auditPath });
  assert.equal(restored.restored, true);
  await lstat(path.join(sessions, "nested", "old-session.jsonl"));
  await assert.rejects(lstat(result.manifest.quarantinedPath));
});
