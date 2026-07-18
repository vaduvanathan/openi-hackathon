import { lstat, open } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./command.mjs";
import { scanRepository } from "./git-scanner.mjs";

const MAX_METADATA_BYTES = 512_000;
const SESSION_CATEGORIES = new Set(["sessions", "archived_sessions"]);
const WORKSPACE_KEYS = new Set(["cwd", "working_directory", "workingdirectory", "workspace", "workspace_root", "workspaceroot"]);

function defaultCodexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function isPathWithin(root, target) {
  const relative = path.relative(root, target);
  return Boolean(relative) && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative);
}

function resolveSessionPath(codexHome, candidate) {
  if (!SESSION_CATEGORIES.has(candidate?.category) || typeof candidate?.relativePath !== "string" || !candidate.relativePath || path.isAbsolute(candidate.relativePath)) {
    throw new Error("A supported local session file is required.");
  }
  const root = path.resolve(codexHome, candidate.category);
  const filePath = path.resolve(root, candidate.relativePath);
  if (!isPathWithin(root, filePath)) throw new Error("Session path is outside the supported Codex session roots.");
  return filePath;
}

async function readMetadataPrefix(filePath) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(MAX_METADATA_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function findWorkspace(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const [key, nested] of Object.entries(value)) {
    const normalized = key.toLowerCase().replace(/[ -]/g, "_");
    if (WORKSPACE_KEYS.has(normalized) && typeof nested === "string" && path.isAbsolute(nested)) return nested;
    if (nested && typeof nested === "object") {
      const workspace = findWorkspace(nested, depth + 1);
      if (workspace) return workspace;
    }
  }
  return null;
}

async function resolveRepository(workspace) {
  try {
    const { stdout } = await runCommand("git", ["-C", workspace, "rev-parse", "--show-toplevel"]);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function inspectCodexSession(candidate, { codexHome = defaultCodexHome() } = {}) {
  const filePath = resolveSessionPath(codexHome, candidate);
  const info = await lstat(filePath);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("The selected session file is unavailable for inspection.");

  const metadata = await readMetadataPrefix(filePath);
  let workspace = null;
  for (const line of metadata.split(/\r?\n/)) {
    if (!line) continue;
    try {
      workspace = findWorkspace(JSON.parse(line));
    } catch {
      // Ignore incomplete or non-JSON lines; session content is never displayed.
    }
    if (workspace) break;
  }
  if (!workspace) return { candidate, inspected: true, repository: null, workspace: null };

  const repositoryPath = await resolveRepository(workspace);
  if (!repositoryPath) return { candidate, inspected: true, repository: null, workspace };
  const scan = await scanRepository(repositoryPath);
  return {
    candidate,
    inspected: true,
    repository: {
      currentBranch: scan.currentBranch,
      path: repositoryPath,
      safeBranches: scan.branches.filter((branch) => branch.safeLocalDelete),
    },
    scan,
    workspace,
  };
}
