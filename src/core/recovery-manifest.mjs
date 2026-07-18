import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

function validateManifestId(manifestId) {
  if (typeof manifestId !== "string" || !/^[a-f0-9-]{36}$/i.test(manifestId)) {
    throw new Error("A valid recovery manifest id is required.");
  }
  return manifestId;
}

function manifestPath(manifestDirectory, manifestId) {
  return path.join(manifestDirectory, `${validateManifestId(manifestId)}.json`);
}

export async function createRecoveryManifest(manifestDirectory, values) {
  const id = randomUUID();
  const manifest = {
    ...values,
    id,
    createdAt: new Date().toISOString(),
    status: "prepared",
    version: 1,
  };
  await mkdir(manifestDirectory, { recursive: true });
  await writeFile(manifestPath(manifestDirectory, id), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export async function readRecoveryManifest(manifestDirectory, manifestId) {
  const contents = await readFile(manifestPath(manifestDirectory, manifestId), "utf8");
  const manifest = JSON.parse(contents);
  if (manifest.id !== manifestId || typeof manifest.type !== "string") {
    throw new Error("Recovery manifest is invalid.");
  }
  return manifest;
}

export async function updateRecoveryManifest(manifestDirectory, manifestId, updates) {
  const manifest = await readRecoveryManifest(manifestDirectory, manifestId);
  const updated = { ...manifest, ...updates, updatedAt: new Date().toISOString() };
  await writeFile(manifestPath(manifestDirectory, manifestId), `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  return updated;
}

export async function listRecoveryManifests(manifestDirectory, { type } = {}) {
  let entries;
  try {
    entries = await readdir(manifestDirectory, { withFileTypes: true });
  } catch {
    return [];
  }
  const manifests = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9-]{36}\.json$/i.test(entry.name)) continue;
    try {
      const manifest = await readRecoveryManifest(manifestDirectory, path.basename(entry.name, ".json"));
      if (!type || manifest.type === type) manifests.push(manifest);
    } catch {
      continue;
    }
  }
  return manifests.sort((first, second) => Date.parse(second.createdAt) - Date.parse(first.createdAt));
}
