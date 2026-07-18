# openi-hackathon
OpenAI Build Week Hackathon project: Codex Session Guard

## Codex Session Guard

Codex Session Guard helps developers safely switch Codex contexts by making local Codex state visible, generating clean handoff packages, and quarantining old sessions instead of deleting them.

## MVP Features

- Connect multiple OpenAI API Platform organizations with separately named Admin API sources protected by Windows encryption.
- Combine live API token, request, model, and cost data into one interactive 7- or 14-day usage view.
- Open ChatGPT in the user's normal browser for personal account information without reading browser sessions, cookies, or chat history.
- Scan a local repository and preview branches that are merged, stale for at least 30 days, and safe to delete locally.
- Delete one or many selected local branches with `git branch -d`, an explicit confirmation, audit event, and restore manifest.
- Fetch `origin`, review stale merged remote branches, and delete only after GitHub CLI confirms there is no open PR for that branch.
- Scan local Codex metadata without opening protected names such as `auth.json` or `.env` files.
- Quarantine one or many selected local Codex session files, then restore them later without overwriting an existing file.
- Add multiple public GitHub usernames to view public account/repository activity without collecting GitHub credentials.
- Reuse signed-in GitHub CLI accounts to list owned repositories, clone or refresh a selected repository into an app-managed inspection cache, and scan it without choosing a local folder.
- Automatically look for Git repositories only in supported local Codex and ChatGPT worktree roots, then report cleanup candidates without scanning arbitrary files on the device.
- Detect supported ChatGPT and Codex Windows desktop executables in common installation locations; desktop detection never reads app chat databases or browser sessions.
- Offer an offline Presentation Mode with preloaded, non-secret GitHub account and repository fixtures; it visibly disables destructive actions and never contains a GitHub token.
- Create sanitized handoff documents automatically, import one into the clipboard, and open ChatGPT for a user-controlled paste.
- Keep an in-app audit trail and automatically export it as JSON for a demo or incident report.

## Intentional Limits

ChatGPT/Codex personal-plan quota, private ChatGPT chat lists, and server-side task deletion are not exposed through a supported public API. This app does not scrape them, read browser credentials, select a private chat, attach a file, or send a message automatically. The handoff flow opens ChatGPT and copies the selected document so the user chooses the target chat and sends it themselves.

Remote branch deletion requires a signed-in GitHub CLI (`gh`) because the app fails closed when it cannot verify that the branch has no open pull request. GitLab and private GitHub account OAuth connections are future connector work, not simulated as complete.
