import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { runCommand } from "./command.mjs";

function validateLogin(login) {
  const value = String(login || "").trim();
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37})$/.test(value)) throw new Error("A valid GitHub username is required.");
  return value;
}

function validateRepository(fullName) {
  const value = String(fullName || "").trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) throw new Error("A valid owner/repository name is required.");
  return value;
}

function parseJson(value, message) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(message);
  }
}

export async function listGitHubCliAccounts() {
  try {
    const { stdout } = await runCommand("gh", ["auth", "status", "--json", "hosts"]);
    const status = parseJson(stdout, "GitHub CLI returned an invalid account response.");
    const accounts = Object.values(status.hosts || {}).flatMap((entries) => entries || [])
      .filter((account) => account.state === "success" && account.login)
      .map((account) => ({ active: Boolean(account.active), host: account.host, login: account.login, scopes: account.scopes || "" }));
    return { accounts, available: true };
  } catch {
    return { accounts: [], available: false };
  }
}

export async function switchGitHubCliAccount(login) {
  const account = validateLogin(login);
  await runCommand("gh", ["auth", "switch", "--hostname", "github.com", "--user", account]);
  return listGitHubCliAccounts();
}

export async function listGitHubCliRepositories(login) {
  const account = validateLogin(login);
  const { stdout } = await runCommand("gh", ["repo", "list", account, "--limit", "100", "--json", "nameWithOwner,isPrivate,updatedAt,url,defaultBranchRef"]);
  const repositories = parseJson(stdout, "GitHub CLI returned an invalid repository response.");
  return repositories.map((repository) => ({
    defaultBranch: repository.defaultBranchRef?.name || "main",
    isPrivate: Boolean(repository.isPrivate),
    nameWithOwner: repository.nameWithOwner,
    updatedAt: repository.updatedAt,
    url: repository.url,
  }));
}

async function exists(target) {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}

export async function checkoutGitHubCliRepository(fullName, destinationRoot) {
  const repository = validateRepository(fullName);
  const directoryName = repository.replace("/", "--");
  const destination = path.join(destinationRoot, directoryName);
  if (await exists(path.join(destination, ".git"))) {
    await runCommand("git", ["-C", destination, "fetch", "origin", "--prune"]);
    return { cached: true, repository, repositoryPath: destination };
  }
  await mkdir(destinationRoot, { recursive: true });
  await runCommand("gh", ["repo", "clone", repository, destination]);
  return { cached: false, repository, repositoryPath: destination };
}
