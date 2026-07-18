# Codex Session Guard Agent Notes

Codex Session Guard is a Windows-first Electron app for local Codex workspace hygiene.

## Product Promise

Help developers switch Codex contexts safely by making local Codex state visible, keeping histories separate, quarantining old sessions, and generating clean handoff context.

## Safety Boundaries

- Do not read, print, export, or commit `auth.json`.
- Do not read or expose API keys, access tokens, cookies, browser credentials, or `.env` files.
- Do not claim to delete OpenAI server-side records.
- Only claim local cleanup, quarantine, and restore on this computer.
- Prefer quarantine and restore over permanent deletion.
- Keep all actions local by default unless the user explicitly chooses an export.

## Review Priorities

- Verify privacy claims are precise and not overstated.
- Check that session scanning avoids auth files and obvious secrets.
- Confirm handoff exports redact sensitive content before writing files.
- Check quarantine has a manifest and restore path.
- Keep the MVP demoable: scanner, risk warning, profiles, handoff, quarantine.
- Avoid broad platform support beyond Codex for the hackathon MVP.
