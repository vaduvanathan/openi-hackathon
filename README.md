# openi-hackathon
OpenAI Build Week Hackathon project: Codex Session Guard

## Codex Session Guard

Codex Session Guard helps developers safely switch Codex contexts by making local Codex state visible, generating clean handoff packages, and quarantining old sessions instead of deleting them.

## PR Review Automation

This repo includes a Codex-powered pull request review workflow. On a PR, comment:

```text
codex review it
```

The workflow runs Codex against the PR diff and posts a review comment. Setup details are in [docs/codex-pr-review.md](docs/codex-pr-review.md).
