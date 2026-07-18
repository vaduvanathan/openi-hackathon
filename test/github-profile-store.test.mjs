import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addGitHubProfileConnection, listGitHubProfileConnections, removeGitHubProfileConnection } from "../src/core/index.mjs";

test("keeps a local list of public GitHub profiles without any token", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "codex-session-guard-github-"));
  const filePath = path.join(root, "profiles.json");
  await addGitHubProfileConnection(filePath, "octocat");
  await addGitHubProfileConnection(filePath, "octocat");
  assert.deepEqual((await listGitHubProfileConnections(filePath)).map((profile) => profile.login), ["octocat"]);
  await removeGitHubProfileConnection(filePath, "octocat");
  assert.deepEqual(await listGitHubProfileConnections(filePath), []);
});
