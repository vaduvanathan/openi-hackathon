import test from "node:test";
import assert from "node:assert/strict";
import { fetchOpenAIUsage, getOpenAIUsageStatus, mergeOpenAIUsageReports } from "../src/core/index.mjs";

test("reports whether the OpenAI Admin key is configured without returning it", () => {
  const status = getOpenAIUsageStatus({ OPENAI_ADMIN_KEY: "test-key" });
  assert.equal(status.configured, true);
  assert.equal(Object.hasOwn(status, "apiKey"), false);
  assert.equal(status.personalQuotaSupported, false);
});

test("normalizes read-only OpenAI organization usage and costs", async () => {
  const fetcher = async (url, options) => {
    assert.match(options.headers.Authorization, /^Bearer test-key$/);
    if (url.includes("/usage/completions")) {
      return {
        ok: true,
        async json() {
          return { data: [{ start_time: 1782259200, end_time: 1782345600, results: [{ model: "gpt-test", input_tokens: 120, output_tokens: 30, num_model_requests: 4 }] }] };
        },
      };
    }
    return {
      ok: true,
      async json() {
        return { data: [{ start_time: 1782259200, end_time: 1782345600, results: [{ amount: { value: 1.25, currency: "usd" } }] }] };
      },
    };
  };
  const usage = await fetchOpenAIUsage({ apiKey: "test-key", days: 14, fetcher, now: Date.parse("2026-06-24T00:00:00Z") });
  assert.equal(usage.source, "openai-api-platform");
  assert.equal(usage.accounts[0].tokens, 150);
  assert.equal(usage.accounts[0].detail, "4 API requests in the last 14 days");
  assert.equal(usage.costs.total, 1.25);
  assert.equal(usage.models[0].name, "gpt-test");
});

test("merges multiple organization reports into one dashboard series", () => {
  const merged = mergeOpenAIUsageReports([
    { accounts: [{ tokens: 10 }], costs: { currency: "USD", total: 1 }, daily: [{ input: 4, label: "01 Jul", output: 6, timestamp: 1, total: 10 }], models: [{ name: "gpt-test", tokens: 10 }], rangeDays: 14 },
    { accounts: [{ tokens: 20 }], costs: { currency: "USD", total: 2 }, daily: [{ input: 8, label: "01 Jul", output: 12, timestamp: 1, total: 20 }], models: [{ name: "gpt-test", tokens: 20 }], rangeDays: 14 },
  ]);
  assert.equal(merged.accounts.length, 2);
  assert.equal(merged.daily[0].total, 30);
  assert.equal(merged.costs.total, 3);
  assert.equal(merged.models[0].tokens, 30);
});
