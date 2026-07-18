import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function emptyStore() {
  return { sources: [], version: 1 };
}

function normalizeLabel(label) {
  if (typeof label !== "string") throw new Error("A source name is required.");
  const normalized = label.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 48) throw new Error("Source names must be between 2 and 48 characters.");
  return normalized;
}

function publicSource(source) {
  return { createdAt: source.createdAt, id: source.id, label: source.label };
}

async function readStore(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return emptyStore();
    throw error;
  }
  const store = JSON.parse(raw);
  if (store?.version !== 1 || !Array.isArray(store.sources)) throw new Error("Saved API source configuration is invalid.");
  return store;
}

async function writeStore(filePath, store) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

export async function listApiSources(filePath) {
  const store = await readStore(filePath);
  return store.sources.map(publicSource);
}

export async function addApiSource(filePath, { encryptedKey, label }) {
  if (typeof encryptedKey !== "string" || encryptedKey.length === 0) throw new Error("An encrypted API key is required.");
  const normalizedLabel = normalizeLabel(label);
  const store = await readStore(filePath);
  if (store.sources.some((source) => source.label.toLocaleLowerCase() === normalizedLabel.toLocaleLowerCase())) {
    throw new Error("An API source with this name already exists.");
  }
  const source = {
    createdAt: new Date().toISOString(),
    encryptedKey,
    id: randomUUID(),
    label: normalizedLabel,
  };
  store.sources.push(source);
  await writeStore(filePath, store);
  return publicSource(source);
}

export async function getEncryptedApiSource(filePath, sourceId) {
  const store = await readStore(filePath);
  const source = store.sources.find((item) => item.id === sourceId);
  if (!source) throw new Error("The requested API source was not found.");
  return { encryptedKey: source.encryptedKey, ...publicSource(source) };
}

export async function removeApiSource(filePath, sourceId) {
  const store = await readStore(filePath);
  const index = store.sources.findIndex((source) => source.id === sourceId);
  if (index === -1) throw new Error("The requested API source was not found.");
  const [removed] = store.sources.splice(index, 1);
  await writeStore(filePath, store);
  return publicSource(removed);
}
