# Core Build Preparation

## Build Boundary

The first version is a Windows-first Electron application with local logic in the main process. The renderer will remain a thin client until the scan results and safety rules are tested.

The first batch does not include password storage, Bun or Node environment readiness, temporary secret injection, or cloud ChatGPT history deletion. Local branch cleanup requires an explicit native confirmation and a fresh safety scan.

## Local Capabilities Needed

- Node.js filesystem APIs for metadata-only scanning.
- Git CLI for branch, merge, worktree, commit, and repository status information.
- Electron main-process IPC for safe renderer access.
- A local audit log for scans and approved actions.
- A recovery manifest for every approved local branch deletion, with a no-overwrite restore path.
- A metadata-only local session quarantine with a no-overwrite restore path.
- A sanitized, user-selected Markdown handoff export with no transcript or credential content.

## External APIs

### GitHub

Use GitHub OAuth, a GitHub App, or the user's existing `gh` authentication to read:

- repositories and default branches
- remote branches and branch protection
- pull requests and their states
- merge status and recent activity

Remote branch deletion is a later, separately confirmed action.

### Codex / ChatGPT Account Data

The MVP does not read personal ChatGPT or Codex plan telemetry, chat history, credits, or quota through an undocumented endpoint. It opens ChatGPT in the user's normal browser, where the user can review information available to that signed-in account.

### OpenAI Platform Usage

The current connector reads API Platform organization data from a process-level `OPENAI_ADMIN_KEY` or from a user-approved named source encrypted by Electron safeStorage. It never displays, exports, logs, or commits the key. It reads:

- `/organization/usage/completions`
- `/organization/costs`

This is separate from ChatGPT/Codex plan usage and should be labeled separately in the product.

Personal ChatGPT or Codex subscription quota, credit balance, and server-side task history are not represented by this connector.

Handoff exports are written automatically to the app's local handoff folder. Importing a selected handoff copies its text to the clipboard and opens ChatGPT, but the app does not inspect, select, or write into private ChatGPT chats.

## Core Data Contracts

The scanner should return structured records for:

- repository identity and selected base branch
- local branches and commit metadata
- remote-tracking branches
- merged status and inactive age
- current and worktree checkout status
- cleanup recommendation and reasons
- Codex state categories, file counts, sizes, and timestamps
- audit events without secrets or transcript content

## Safety Rules For This Batch

- Read metadata, not credential contents.
- Never open or export `auth.json`.
- Do not scan arbitrary device contents from the renderer.
- Do not delete branches or files automatically.
- Quarantine only a freshly listed local session file after native confirmation.
- Never treat a branch as removable while checked out in a worktree.
- Keep remote deletion behind a future explicit confirmation.
