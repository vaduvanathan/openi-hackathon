import test from "node:test";
import assert from "node:assert/strict";
import { scanGitHubProfiles } from "../src/core/index.mjs";

test("normalizes read-only GitHub profile data", async () => {
  const fetcher = async (url) => ({
    ok: true,
    async json() {
      if (url.includes("/repos")) return [{ name: "demo", private: false, updated_at: "2026-07-18T00:00:00Z", html_url: "https://github.com/example/demo" }];
      return { login: "example", name: "Example", avatar_url: "", public_repos: 1, followers: 2 };
    },
  });
  const [profile] = await scanGitHubProfiles(["example"], fetcher);
  assert.equal(profile.status, "ok");
  assert.equal(profile.login, "example");
  assert.equal(profile.repositories[0].name, "demo");
});
