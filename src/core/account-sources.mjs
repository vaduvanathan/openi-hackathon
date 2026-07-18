import { getOpenAIUsageStatus } from "./openai-usage.mjs";

export function getAccountSources(environment = process.env) {
  const apiUsage = getOpenAIUsageStatus(environment);
  return [
    {
      detail: "Personal plan, credits, and Codex quota remain in ChatGPT.",
      id: "chatgpt-codex",
      kind: "Personal account",
      label: "ChatGPT / Codex",
      status: "Browser handoff",
      telemetry: "not-supported",
    },
    {
      detail: apiUsage.configured ? "Organization API usage and costs are available in this app." : "Set OPENAI_ADMIN_KEY before launch to load organization usage and costs.",
      id: "openai-api-platform",
      kind: "Organization API",
      label: "OpenAI API Platform",
      status: apiUsage.configured ? "Ready" : "Admin key needed",
      telemetry: apiUsage.configured ? "available" : "not-configured",
    },
  ];
}
