# Codex Pull Request Review

You are reviewing a pull request for Codex Session Guard.

Review only the pull request diff and nearby code needed to understand it. Do not modify files. Do not install dependencies, run package scripts, start servers, execute project code, or make network calls. It is okay to use read-only shell commands such as `git diff`, `git show`, `git status`, `rg`, and file reads.

Start by inspecting:

```powershell
git status --short
git diff --stat HEAD^1 HEAD
git diff --find-renames HEAD^1 HEAD
```

Focus on issues that matter for this project:

- Privacy leaks, especially accidental reading/exporting of `auth.json`, tokens, cookies, API keys, `.env` files, or local session transcripts.
- Incorrect claims about account switching, billing, OpenAI server-side records, or permanent deletion.
- Risky filesystem behavior, especially destructive deletes instead of quarantine/restore.
- Handoff output quality: whether it is useful to the next agent while being redacted and scoped.
- Windows path handling, OneDrive paths, Unicode paths, and safe filesystem APIs.
- Missing tests or verification for scanner, redaction, handoff, or quarantine logic.
- User-facing wording that could make developers overtrust the tool.

Return a GitHub-ready review comment with:

1. A one-paragraph summary.
2. Blocking or high-risk findings first, with file and line references when possible.
3. Medium-risk findings or missing tests.
4. A short note if no blocking issues were found.

Avoid nitpicks unless they hide a real bug, privacy problem, or demo risk.
