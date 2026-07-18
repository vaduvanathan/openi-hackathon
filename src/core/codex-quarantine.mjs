import { copyFile, lstat, mkdir, readdir, rename, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendAuditEvent } from "./audit.mjs";
import { createRecoveryManifest, listRecoveryManifests, readRecoveryManifest, updateRecoveryManifest } from "./recovery-manifest.mjs";

const PROTECTED_NAMES = new Set(["auth.json", ".env", ".env.local"]);
const SESSION_CATEGORIES = new Set(["sessions", "archived_sessions"]);
const MAX_CANDIDATES = 500;
const MAX_DEPTH = 16;

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function isProtectedName(fileName) {
  return PROTECTED_NAMES.has(fileName.toLowerCase());
}

function isPathWithin(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveSessionPath(codexHome, category, relativePath) {
  if (!SESSION_CATEGORIES.has(category)) throw new Error("A supported session category is required.");
  if (typeof relativePath !== "string" || !relativePath.trim() || path.isAbsolute(relativePath)) {
    throw new Error("A relative session path is required.");
  }
  const categoryRoot = path.resolve(codexHome, category);
  const candidatePath = path.resolve(categoryRoot, relativePath);
  if (!isPathWithin(categoryRoot, candidatePath) || isProtectedName(path.basename(candidatePath))) {
    throw new Error("The selected session file is not eligible for cleanup.");
  }
  return { candidatePath, categoryRoot };
}

function candidateFromInfo(category, categoryRoot, filePath, info, now) {
  const modifiedAt = info.mtime.toISOString();
  return {
    ageDays: Math.max(0, Math.floor((now - info.mtimeMs) / 86_400_000)),
    category,
    modifiedAt,
    relativePath: path.relative(categoryRoot, filePath),
    size: info.size,
  };
}

async function collectCandidates(category, categoryRoot, directoryPath, candidates, now, depth = 0) {
  if (candidates.length >= MAX_CANDIDATES || depth > MAX_DEPTH) return;
  let entries;
  try {
    entries = await readdir(directoryPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (candidates.length >= MAX_CANDIDATES || isProtectedName(entry.name)) continue;
    const filePath = path.join(directoryPath, entry.name);
    let info;
    try {
      info = await lstat(filePath);
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      await collectCandidates(category, categoryRoot, filePath, candidates, now, depth + 1);
      continue;
    }
    if (info.isFile()) candidates.push(candidateFromInfo(category, categoryRoot, filePath, info, now));
  }
}

async function moveFile(sourcePath, destinationPath) {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  try {
    await rename(sourcePath, destinationPath);
  } catch (error) {
    if (error?.code !== "EXDEV") throw error;
    await copyFile(sourcePath, destinationPath);
    await unlink(sourcePath);
  }
}

export async function listCodexSessionCandidates(codexHome = defaultCodexHome(), { now = Date.now() } = {}) {
  const candidates = [];
  for (const category of SESSION_CATEGORIES) {
    const categoryRoot = path.join(codexHome, category);
    await collectCandidates(category, categoryRoot, categoryRoot, candidates, now);
  }
  return candidates.sort((first, second) => Date.parse(first.modifiedAt) - Date.parse(second.modifiedAt));
}

export async function quarantineCodexSession(codexHome, candidate, {
  auditPath,
  manifestDirectory,
  quarantineDirectory,
} = {}) {
  if (!manifestDirectory || !quarantineDirectory) throw new Error("Quarantine storage is not configured.");
  const { category, relativePath } = candidate ?? {};
  const { candidatePath } = resolveSessionPath(codexHome, category, relativePath);
  const info = await lstat(candidatePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("The selected session file is no longer available for cleanup.");

  const manifest = await createRecoveryManifest(manifestDirectory, {
    category,
    codexHome: path.resolve(codexHome),
    originalPath: candidatePath,
    relativePath,
    type: "codex-session-quarantine",
  });
  const quarantinedPath = path.join(quarantineDirectory, manifest.id, "data", category, relativePath);
  await updateRecoveryManifest(manifestDirectory, manifest.id, { quarantinedPath });
  try {
    await moveFile(candidatePath, quarantinedPath);
  } catch (error) {
    await updateRecoveryManifest(manifestDirectory, manifest.id, { status: "quarantine-failed" });
    throw error;
  }
  const event = auditPath ? await appendAuditEvent(auditPath, {
    category,
    relativePath,
    type: "codex-session-quarantined",
  }) : null;
  const updatedManifest = await updateRecoveryManifest(manifestDirectory, manifest.id, {
    auditEventId: event?.id ?? null,
    quarantinedAt: new Date().toISOString(),
    status: "quarantined",
  });
  return { manifest: updatedManifest, quarantined: true };
}

export async function listQuarantinedCodexSessions(manifestDirectory) {
  return listRecoveryManifests(manifestDirectory, { type: "codex-session-quarantine" });
}

export async function restoreQuarantinedCodexSession(manifestDirectory, quarantineDirectory, manifestId, { auditPath } = {}) {
  const manifest = await readRecoveryManifest(manifestDirectory, manifestId);
  if (manifest.type !== "codex-session-quarantine" || manifest.status !== "quarantined") {
    throw new Error("This quarantine manifest is not eligible for restore.");
  }
  const { candidatePath } = resolveSessionPath(manifest.codexHome, manifest.category, manifest.relativePath);
  if (await fileExists(candidatePath)) throw new Error("The original session file already exists and will not be overwritten.");
  const expectedQuarantinePath = path.join(quarantineDirectory, manifest.id, "data", manifest.category, manifest.relativePath);
  if (manifest.quarantinedPath !== expectedQuarantinePath || !await isRegularFile(expectedQuarantinePath)) {
    throw new Error("The quarantined session file is not available for restore.");
  }
  await moveFile(expectedQuarantinePath, candidatePath);
  const event = auditPath ? await appendAuditEvent(auditPath, {
    category: manifest.category,
    relativePath: manifest.relativePath,
    type: "codex-session-restored",
  }) : null;
  const updatedManifest = await updateRecoveryManifest(manifestDirectory, manifest.id, {
    restoreAuditEventId: event?.id ?? null,
    restoredAt: new Date().toISOString(),
    status: "restored",
  });
  return { manifest: updatedManifest, restored: true };
}

async function fileExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isRegularFile(filePath) {
  try {
    const info = await lstat(filePath);
    return info.isFile() && !info.isSymbolicLink();
  } catch {
    return false;
  }
}
