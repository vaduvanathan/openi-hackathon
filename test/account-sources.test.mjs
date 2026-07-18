import test from "node:test";
import assert from "node:assert/strict";
import { getAccountSources } from "../src/core/index.mjs";

test("distinguishes browser-only ChatGPT access from API Platform telemetry", () => {
  const sources = getAccountSources({ OPENAI_ADMIN_KEY: "test-admin-key" });
  assert.deepEqual(sources.map((source) => source.id), ["chatgpt-codex", "environment-admin-key"]);
  assert.equal(sources[0].telemetry, "not-supported");
  assert.equal(sources[1].telemetry, "available");
  assert.match(sources[0].detail, /remain in ChatGPT/);
});
