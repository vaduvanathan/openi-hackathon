import { lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function exists(filePath) {
  try {
    return (await lstat(filePath)).isFile();
  } catch {
    return false;
  }
}

export async function discoverOpenAIDesktopClients(home = os.homedir()) {
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const candidates = [
    { label: "ChatGPT desktop", path: path.join(localAppData, "Programs", "ChatGPT", "ChatGPT.exe") },
    { label: "ChatGPT desktop", path: path.join(localAppData, "Programs", "OpenAI", "ChatGPT.exe") },
    { label: "ChatGPT desktop", path: path.join(localAppData, "ChatGPT", "ChatGPT.exe") },
    { label: "Codex desktop", path: path.join(localAppData, "Programs", "Codex", "Codex.exe") },
    { label: "Codex desktop", path: path.join(localAppData, "Codex", "Codex.exe") },
  ];
  const found = [];
  for (const candidate of candidates) {
    if (await exists(candidate.path)) found.push(candidate);
  }
  return found;
}
