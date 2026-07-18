import { lstat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PROTECTED_NAMES = new Set(["auth.json", ".env", ".env.local"]);
const MAX_FILES = 100_000;

function emptySummary(root) {
  return { root, exists: false, fileCount: 0, totalBytes: 0, newestFile: null, protectedSkipped: [] };
}

async function walkDirectory(root, summary, depth = 0) {
  if (summary.fileCount >= MAX_FILES || depth > 16) return;
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (PROTECTED_NAMES.has(entry.name.toLowerCase())) {
      summary.protectedSkipped.push(fullPath);
      continue;
    }
    let info;
    try {
      info = await lstat(fullPath);
    } catch {
      continue;
    }
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) {
      await walkDirectory(fullPath, summary, depth + 1);
      continue;
    }
    if (!info.isFile()) continue;
    summary.fileCount += 1;
    summary.totalBytes += info.size;
    const modified = info.mtime.toISOString();
    if (!summary.newestFile || modified > summary.newestFile.modified) {
      summary.newestFile = { path: fullPath, modified };
    }
  }
}

async function summarize(root) {
  const summary = emptySummary(root);
  try {
    const info = await lstat(root);
    if (!info.isDirectory()) return summary;
  } catch {
    return summary;
  }
  summary.exists = true;
  await walkDirectory(root, summary);
  return summary;
}

export async function scanCodexState(codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex")) {
  const categories = {};
  for (const name of ["sessions", "archived_sessions", "worktrees", "log", "logs", "state", "memories_extensions"]) {
    categories[name] = await summarize(path.join(codexHome, name));
  }
  const aggregate = Object.values(categories).reduce((total, summary) => ({
    fileCount: total.fileCount + summary.fileCount,
    totalBytes: total.totalBytes + summary.totalBytes,
  }), { fileCount: 0, totalBytes: 0 });
  return {
    codexHome,
    categories,
    aggregate,
    policy: {
      contentsRead: false,
      protectedNamesSkipped: [...PROTECTED_NAMES],
      authFilesOpened: false,
    },
  };
}
