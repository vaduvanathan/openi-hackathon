import { getOpenAIUsageStatus } from "./openai-usage.mjs";

function apiSource({ detail, id, kind, label, removable = false, status, telemetry }) {
  return { detail, id, kind, label, removable, status, telemetry };
}

export function getAccountSources(options = process.env) {
  const environment = options.environment ?? options;
  const storedSources = options.storedSources ?? [];
  const apiUsage = getOpenAIUsageStatus(environment);
  const sources = [
    {
      detail: "Personal plan, credits, and Codex quota remain in ChatGPT.",
      id: "chatgpt-codex",
      kind: "Personal account",
      label: "ChatGPT / Codex",
      status: "Browser handoff",
      telemetry: "not-supported",
    },
  ];
  if (apiUsage.configured) {
    sources.push(apiSource({
      detail: "Organization API usage and costs are available through OPENAI_ADMIN_KEY.",
      id: "environment-admin-key",
      kind: "Organization API",
      label: "Environment API source",
      status: "Ready",
      telemetry: "available",
    }));
  }
  for (const source of storedSources) {
    sources.push(apiSource({
      detail: "Organization API usage and costs are available through Windows-protected storage.",
      id: source.id,
      kind: "Organization API",
      label: source.label,
      removable: true,
      status: "Ready",
      telemetry: "available",
    }));
  }
  if (sources.length === 1) {
    sources.push(apiSource({
      detail: "Add an OpenAI Admin key to load organization API usage and costs.",
      id: "openai-api-setup",
      kind: "Organization API",
      label: "OpenAI API Platform",
      status: "Setup required",
      telemetry: "not-configured",
    }));
  }
  return sources;
}
