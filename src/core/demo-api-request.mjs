const RESPONSES_URL = "https://api.openai.com/v1/responses";

export async function createDemoApiEvent({ apiKey, fetcher = fetch, model }) {
  const response = await fetcher(RESPONSES_URL, {
    body: JSON.stringify({
      input: "Reply with exactly: DEMO_OK",
      max_output_tokens: 8,
      model,
      store: false,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI request failed (${response.status}).`);
  const usage = payload?.usage || {};
  return {
    completedAt: new Date().toISOString(),
    inputTokens: Number(usage.input_tokens || 0),
    model: payload?.model || model,
    outputTokens: Number(usage.output_tokens || 0),
    requestId: payload?.id || null,
    totalTokens: Number(usage.total_tokens || 0),
  };
}
