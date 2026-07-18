# Core Build Preparation

## Build Boundary

The first version is a Windows-first Electron application with local logic in the main process. The renderer will remain a thin client until the scan results and safety rules are tested.

The first batch does not include password storage, Bun or Node environment readiness, temporary secret injection, cloud ChatGPT history deletion, or automatic destructive cleanup.

## Local Capabilities Needed

- Node.js filesystem APIs for metadata-only scanning.
- Git CLI for branch, merge, worktree, commit, and repository status information.
- Electron main-process IPC for safe renderer access.
- A local audit log for scans and approved actions.
- A recovery manifest before any future branch or file deletion.

## External APIs To Add Later

### GitHub

Use GitHub OAuth, a GitHub App, or the user's existing `gh` authentication to read:

- repositories and default branches
- remote branches and branch protection
- pull requests and their states
- merge status and recent activity

Remote branch deletion is a later, separately confirmed action.

### Codex / ChatGPT Account Data

Use the supported Codex account service when available:

- `account/read`
- `account/rateLimits/read`
- `account/usage/read`

These calls require the user to connect each account and may return only the fields supported for that account.

### OpenAI Platform Usage

For organizations using the API Platform, add an Admin API connector for:

- `/organization/usage/completions`
- `/organization/costs`

This is separate from ChatGPT/Codex plan usage and should be labeled separately in the product.

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
- Never treat a branch as removable while checked out in a worktree.
- Keep remote deletion behind a future explicit confirmation.
