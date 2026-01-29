# providers/ - AGENTS

Provider layer: credential discovery, provider API calls, usage/quota mapping, and OAuth connect flows.

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| Resolve local credential file paths | `providers/paths.js` | XDG/Windows fallbacks; must stay cross-platform |
| Read/parse credential files | `providers/credentials.js` | never log tokens; return minimal account info |
| Fetch + map Codex usage | `providers/codex.js` | maps usage windows into dashboard items |
| Fetch + map Antigravity quota | `providers/antigravity.js` | percent-based quotas; maps to items |
| OpenAI OAuth connect | `providers/codex_connect.js` | localhost callback server; launches browser |
| Google OAuth connect | `providers/antigravity_connect.js` | localhost callback server; launches browser |

## Conventions (here)

- Throw actionable `Error(message)` from providers; main process aggregates into `providerErrors`.
- Redact aggressively: no access/refresh tokens, auth codes, or full callback URLs in logs/errors.
- Keep provider names stable in payloads: `codex`, `antigravity`.

## Anti-patterns (here)

- Do not persist refreshed tokens back to disk from this app.
- Do not expose secrets through IPC (only derived display fields like email).
- Do not add broad APIs to `preload.js` that leak provider internals.
