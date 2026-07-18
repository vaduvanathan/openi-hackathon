# Codex PR Review

This repository supports a company-style PR review flow:

1. Open a pull request.
2. Comment `codex review it`, `codex review`, `@codex review`, or `/codex-review`.
3. GitHub Actions runs Codex against the PR diff.
4. Codex posts a review comment back to the pull request.

## Required Setup

Add a repository secret named `OPENAI_API_KEY`:

GitHub repository -> Settings -> Secrets and variables -> Actions -> New repository secret.

The workflow does not store API keys in code. It reads the secret only inside GitHub Actions.

## Native Codex Cloud Option

OpenAI also supports Codex code review through Codex cloud. With that setup, enable code review for the repository in Codex settings and use the exact PR comment trigger `@codex review`.

The workflow in this repository is separate: it is a repo-owned automation that uses `openai/codex-action@v1`.

## Safety Defaults

- Runs only for trusted repository users: owner, member, or collaborator.
- Checks out the PR merge ref.
- Runs Codex in a read-only sandbox.
- Keeps the CI prompt inline in the workflow so a PR cannot alter the review instructions before the secret-backed job runs.
- Keeps a matching human-readable prompt at `.github/codex/prompts/pr-review.md`.
- Focuses on privacy, handoff quality, quarantine safety, Windows paths, and demo risk.

## Notes

This uses OpenAI API access through the `OPENAI_API_KEY` secret. If your hackathon credits are only visible in ChatGPT billing and not in Platform billing, use native Codex cloud review instead of this action.
