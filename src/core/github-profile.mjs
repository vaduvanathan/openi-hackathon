async function readJson(fetcher, url) {
  const response = await fetcher(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "codex-session-guard",
    },
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} for ${url}`);
  return response.json();
}

export async function scanGitHubProfiles(logins, fetcher = fetch) {
  const results = await Promise.allSettled(logins.map(async (login) => {
    const profile = await readJson(fetcher, `https://api.github.com/users/${encodeURIComponent(login)}`);
    const repositories = await readJson(fetcher, `https://api.github.com/users/${encodeURIComponent(login)}/repos?per_page=100&sort=updated`);
    return {
      login: profile.login,
      name: profile.name || profile.login,
      avatarUrl: profile.avatar_url,
      publicRepos: profile.public_repos,
      followers: profile.followers,
      repositories: repositories.slice(0, 8).map((repo) => ({
        name: repo.name,
        private: repo.private,
        updatedAt: repo.updated_at,
        url: repo.html_url,
      })),
    };
  }));

  return results.map((result, index) => result.status === "fulfilled"
    ? { status: "ok", ...result.value }
    : { status: "error", login: logins[index], error: result.reason.message });
}
