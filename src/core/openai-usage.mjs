const API_BASE_URL = "https://api.openai.com/v1/organization";
const DAY_IN_SECONDS = 86_400;

function asNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

function formatDay(timestamp) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(timestamp * 1000));
}

function createUrl(path, parameters) {
  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function fetchJson(fetcher, url, apiKey) {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!response.ok) throw new Error(`OpenAI API request failed with status ${response.status}.`);
  return response.json();
}

function bucketResults(payload) {
  return (payload.data || []).flatMap((bucket) => (bucket.results || []).map((result) => ({
    ...result,
    endTime: bucket.end_time,
    startTime: bucket.start_time,
  })));
}

export function getOpenAIUsageStatus(environment = process.env) {
  const configured = typeof environment.OPENAI_ADMIN_KEY === "string" && environment.OPENAI_ADMIN_KEY.trim().length > 0;
  return {
    configured,
    provider: "OpenAI API Platform",
    scope: "Organization API usage and costs",
    environmentVariable: "OPENAI_ADMIN_KEY",
    personalQuotaSupported: false,
  };
}

export async function fetchOpenAIUsage({
  apiKey = process.env.OPENAI_ADMIN_KEY,
  days = 14,
  fetcher = fetch,
  now = Date.now(),
  sourceColor = "cyan",
  sourceId = "openai-api-platform",
  sourceName = "OpenAI API Platform",
} = {}) {
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error("OpenAI Admin key is not configured.");
  }

  const rangeDays = Math.max(1, Math.min(31, Math.floor(days)));
  const endTime = Math.floor(now / 1000);
  const startTime = endTime - rangeDays * DAY_IN_SECONDS;
  const sharedParameters = { bucket_width: "1d", end_time: endTime, limit: rangeDays, start_time: startTime };
  const [usagePayload, costsPayload] = await Promise.all([
    fetchJson(fetcher, createUrl("/usage/completions", { ...sharedParameters, group_by: "model" }), apiKey),
    fetchJson(fetcher, createUrl("/costs", sharedParameters), apiKey),
  ]);

  const daily = (usagePayload.data || []).map((bucket) => {
    const results = bucket.results || [];
    const input = results.reduce((total, result) => total + asNumber(result.input_tokens), 0);
    const output = results.reduce((total, result) => total + asNumber(result.output_tokens), 0);
    return {
      input,
      label: formatDay(bucket.start_time),
      output,
      timestamp: bucket.start_time,
      total: input + output,
    };
  });
  const usageResults = bucketResults(usagePayload);
  const totalInput = usageResults.reduce((total, result) => total + asNumber(result.input_tokens), 0);
  const totalOutput = usageResults.reduce((total, result) => total + asNumber(result.output_tokens), 0);
  const totalRequests = usageResults.reduce((total, result) => total + asNumber(result.num_model_requests), 0);
  const modelTotals = new Map();

  for (const result of usageResults) {
    const model = result.model || "All models";
    const current = modelTotals.get(model) || 0;
    modelTotals.set(model, current + asNumber(result.input_tokens) + asNumber(result.output_tokens));
  }

  const costs = bucketResults(costsPayload);
  const currency = costs.find((result) => result.amount?.currency)?.amount?.currency?.toUpperCase() || "USD";
  const totalCost = costs.reduce((total, result) => total + asNumber(result.amount?.value), 0);
  const totalTokens = totalInput + totalOutput;
  const models = [...modelTotals.entries()]
    .sort(([, firstTotal], [, secondTotal]) => secondTotal - firstTotal)
    .slice(0, 8)
    .map(([name, tokens], index) => ({
      color: ["cyan", "violet", "amber", "green"][index % 4],
      name,
      share: totalTokens === 0 ? 0 : Math.round((tokens / totalTokens) * 100),
      tokens,
    }));

  return {
    accounts: [{
      color: sourceColor,
      detail: `${totalRequests.toLocaleString("en-US")} API requests in the last ${rangeDays} days`,
      footer: new Intl.NumberFormat("en-US", { currency, style: "currency" }).format(totalCost),
      id: sourceId,
      kind: "Organization API usage",
      name: sourceName,
      reset: null,
      status: "Live",
      tokens: totalTokens,
      usagePercent: null,
    }],
    costs: { currency, total: totalCost },
    daily,
    label: sourceName,
    models,
    rangeDays,
    source: "openai-api-platform",
    updatedAt: new Date(now).toISOString(),
  };
}

export function mergeOpenAIUsageReports(reports) {
  if (!Array.isArray(reports) || reports.length === 0) throw new Error("At least one OpenAI usage report is required.");
  const dailyByTimestamp = new Map();
  const modelTotals = new Map();
  const accounts = reports.flatMap((report) => report.accounts || []);
  let totalCost = 0;
  let currency = reports[0].costs?.currency || "USD";

  for (const report of reports) {
    totalCost += asNumber(report.costs?.total);
    if (report.costs?.currency && report.costs.currency !== currency) currency = "USD";
    for (const day of report.daily || []) {
      const key = day.timestamp ?? day.label;
      const current = dailyByTimestamp.get(key) || { input: 0, label: day.label, output: 0, timestamp: day.timestamp, total: 0 };
      current.input += asNumber(day.input);
      current.output += asNumber(day.output);
      current.total += asNumber(day.total);
      dailyByTimestamp.set(key, current);
    }
    for (const model of report.models || []) {
      modelTotals.set(model.name, (modelTotals.get(model.name) || 0) + asNumber(model.tokens));
    }
  }

  const totalTokens = accounts.reduce((total, account) => total + asNumber(account.tokens), 0);
  const models = [...modelTotals.entries()]
    .sort(([, firstTotal], [, secondTotal]) => secondTotal - firstTotal)
    .slice(0, 8)
    .map(([name, tokens], index) => ({
      color: ["cyan", "violet", "amber", "green"][index % 4],
      name,
      share: totalTokens === 0 ? 0 : Math.round((tokens / totalTokens) * 100),
      tokens,
    }));

  return {
    accounts,
    costs: { currency, total: totalCost },
    daily: [...dailyByTimestamp.values()].sort((first, second) => (first.timestamp || 0) - (second.timestamp || 0)),
    label: "OpenAI API Platform",
    models,
    rangeDays: reports[0].rangeDays,
    source: "openai-api-platform",
    updatedAt: new Date().toISOString(),
  };
}
