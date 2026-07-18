import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getDemoApiKeyStatus, getEncryptedDemoApiKey, recordDemoApiEvent, saveDemoApiKey } from "../src/core/index.mjs";

test("stores a demo project key without exposing it in status", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-demo-key-"));
  const storePath = path.join(directory, "source.json");
  const saved = await saveDemoApiKey(storePath, { encryptedKey: "encrypted-value", label: "Hackathon demo", model: "gpt-5-mini" });

  assert.equal(saved.configured, true);
  assert.equal(Object.hasOwn(saved, "encryptedKey"), false);
  assert.equal((await getEncryptedDemoApiKey(storePath)).encryptedKey, "encrypted-value");
  const status = await recordDemoApiEvent(storePath, { completedAt: "2026-07-18T12:00:00.000Z", inputTokens: 4, model: "gpt-5-mini", outputTokens: 2, requestId: "resp_demo", totalTokens: 6 });
  assert.equal(status.lastEvent.totalTokens, 6);
  assert.equal((await getDemoApiKeyStatus(storePath)).lastEvent.requestId, "resp_demo");
});
