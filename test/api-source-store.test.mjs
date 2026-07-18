import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addApiSource, getEncryptedApiSource, listApiSources, removeApiSource } from "../src/core/index.mjs";

test("stores only encrypted API source material and keeps it out of source listings", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-api-sources-"));
  const storePath = path.join(directory, "sources.json");
  const saved = await addApiSource(storePath, { encryptedKey: "encrypted-value", label: "Hackathon" });

  assert.deepEqual(await listApiSources(storePath), [saved]);
  assert.equal(Object.hasOwn(saved, "encryptedKey"), false);
  assert.equal((await getEncryptedApiSource(storePath, saved.id)).encryptedKey, "encrypted-value");
  assert.deepEqual(await removeApiSource(storePath, saved.id), saved);
  assert.deepEqual(await listApiSources(storePath), []);
});
