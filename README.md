# openi-hackathon
OpenAI Build Week Hackathon project: Codex Session Guard

## Codex Session Guard

Codex Session Guard helps developers safely switch Codex contexts by making local Codex state visible, generating clean handoff packages, and quarantining old sessions instead of deleting them.

## Current Build Direction

The current Windows Electron build scans local Codex state, identifies safe local branch cleanup candidates, supports reversible branch and session quarantine recovery, and automatically writes sanitized handoff reports. It opens the user's ChatGPT account in their normal browser for personal plan information, while live OpenAI API Platform telemetry comes from named Admin-key sources encrypted with Windows-protected storage.
