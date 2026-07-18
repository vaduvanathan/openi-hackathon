import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function normalizeLogin(login) {
  const value = String(login || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(value)) {
    throw new Error("Enter a valid GitHub username.");
  }
  return value;
}

async function readProfiles(filePath) {
  try {
    const value = JSON.parse(await readFile(filePath, "utf8"));
    return Array.isArray(value.profiles) ? value.profiles : [];
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function saveProfiles(filePath, profiles) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ profiles }, null, 2)}\n`, "utf8");
}

export async function listGitHubProfileConnections(filePath) {
  return readProfiles(filePath);
}

export async function addGitHubProfileConnection(filePath, login) {
  const normalized = normalizeLogin(login);
  const profiles = await readProfiles(filePath);
  if (profiles.some((profile) => profile.login.toLowerCase() === normalized.toLowerCase())) {
    return profiles.find((profile) => profile.login.toLowerCase() === normalized.toLowerCase());
  }
  const profile = { login: normalized, addedAt: new Date().toISOString() };
  await saveProfiles(filePath, [...profiles, profile]);
  return profile;
}

export async function removeGitHubProfileConnection(filePath, login) {
  const normalized = normalizeLogin(login);
  const profiles = await readProfiles(filePath);
  const remaining = profiles.filter((profile) => profile.login.toLowerCase() !== normalized.toLowerCase());
  if (remaining.length === profiles.length) throw new Error("GitHub profile was not found.");
  await saveProfiles(filePath, remaining);
  return { login: normalized };
}
