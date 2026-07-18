import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function emptyStore() {
  return { key: null, lastEvent: null, version: 1 };
}

function normalizeLabel(label) {
  const normalized = typeof label === "string" ? label.trim().replace(/\s+/g, " ") : "Demo project";
  if (normalized.length < 2 || normalized.length > 48) throw new Error("Demo project names must be between 2 and 48 characters.");
  return normalized;
}

function normalizeModel(model) {
  const normalized = typeof model === "string" ? model.trim() : "";
  if (!/^[A-Za-z0-9._-]{2,80}$/.test(normalized)) throw new Error("Choose a valid OpenAI model name.");
  return normalized;
}

async function readStore(filePath) {
  try {
    const store = JSON.parse(await readFile(filePath, "utf8"));
    if (store?.version !== 1) throw new Error("Saved demo API configuration is invalid.");
    return { ...emptyStore(), ...store };
  } catch (error) {
    if (error?.code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStore(filePath, store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function publicStatus(store) {
  return {
    configured: Boolean(store.key?.encryptedKey),
    label: store.key?.label || null,
    lastEvent: store.lastEvent || null,
    model: store.key?.model || null,
  };
}

export async function getDemoApiKeyStatus(filePath) {
  return publicStatus(await readStore(filePath));
}

export async function saveDemoApiKey(filePath, { encryptedKey, label, model }) {
  if (typeof encryptedKey !== "string" || encryptedKey.length === 0) throw new Error("An encrypted project API key is required.");
  const store = await readStore(filePath);
  store.key = {
    encryptedKey,
    label: normalizeLabel(label),
    model: normalizeModel(model),
    updatedAt: new Date().toISOString(),
  };
  await writeStore(filePath, store);
  return publicStatus(store);
}

export async function getEncryptedDemoApiKey(filePath) {
  const store = await readStore(filePath);
  if (!store.key?.encryptedKey) throw new Error("Connect a project API key before creating a demo event.");
  return { ...store.key };
}

export async function clearDemoApiKey(filePath) {
  const store = await readStore(filePath);
  store.key = null;
  await writeStore(filePath, store);
  return publicStatus(store);
}

export async function recordDemoApiEvent(filePath, event) {
  const store = await readStore(filePath);
  store.lastEvent = {
    completedAt: event.completedAt,
    inputTokens: event.inputTokens,
    model: event.model,
    outputTokens: event.outputTokens,
    requestId: event.requestId,
    totalTokens: event.totalTokens,
  };
  await writeStore(filePath, store);
  return publicStatus(store);
}
