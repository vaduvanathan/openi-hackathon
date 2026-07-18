import test from "node:test";
import assert from "node:assert/strict";
import { createDemoApiEvent } from "../src/core/demo-api-request.mjs";

test("creates a deliberately small Responses API demo request", async () => {
  let request;
  const event = await createDemoApiEvent({
    apiKey: "test-key",
    model: "gpt-5-mini",
    fetcher: async (_url, options) => {
      request = options;
      return { ok: true, json: async () => ({ id: "resp_demo", model: "gpt-5-mini", usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } }) };
    },
  });
  assert.equal(JSON.parse(request.body).max_output_tokens, 8);
  assert.equal(JSON.parse(request.body).store, false);
  assert.equal(event.totalTokens, 7);
});
