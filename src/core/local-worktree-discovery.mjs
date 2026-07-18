import { lstat, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_DEPTH = 4;
const MAX_REPOSITORIES = 100;

function defaultRoots(home = os.homedir()) {
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  return [
    path.join(process.env.CODEX_HOME || path.join(home, ".codex"), "worktrees"),
    path.join(home, ".chatgpt", "worktrees"),
    path.join(appData, "ChatGPT", "worktrees"),
    path.join(localAppData, "ChatGPT", "worktrees"),
  ];
}

async function isGitRepository(directory) {
  try {
    const info = await lstat(path.join(directory, ".git"));
    return info.isDirectory() || info.isFile();
  } catch {
    return false;
  }
}

async function collectRepositories(root, current, repositories, depth = 0) {
  if (repositories.length >= MAX_REPOSITORIES || depth > MAX_DEPTH) return;
  if (await isGitRepository(current)) {
    repositories.push(current);
    return;
  }
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
    await collectRepositories(root, path.join(current, entry.name), repositories, depth + 1);
  }
}

export async function discoverLocalAgentWorktrees({ roots = defaultRoots() } = {}) {
  const repositories = [];
  const availableRoots = [];
  for (const root of roots) {
    try {
      if (!(await lstat(root)).isDirectory()) continue;
      availableRoots.push(root);
      await collectRepositories(root, root, repositories);
    } catch {
      // A missing optional local client root is normal.
    }
  }
  return {
    availableRoots,
    repositories: [...new Set(repositories)].slice(0, MAX_REPOSITORIES),
    roots,
  };
}
