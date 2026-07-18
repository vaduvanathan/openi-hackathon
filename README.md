# openi-hackathon
OpenAI Build Week Hackathon project: Codex Session Guard

## Codex Session Guard

Codex Session Guard helps developers safely switch Codex contexts by making local Codex state visible, generating clean handoff packages, and quarantining old sessions instead of deleting them.

## Current Build Direction

The current Windows Electron build scans local Codex state, identifies safe local branch cleanup candidates, supports reversible branch and session quarantine recovery, exports sanitized handoff reports, and labels OpenAI API Platform usage separately from ChatGPT or Codex subscription quota.
