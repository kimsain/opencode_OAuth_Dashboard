# OAuth Usage Dashboard - AGENTS

Generated: 2026-01-29
Git: n/a (not a git repo)

Electron desktop app that shows quota/usage for OAuth-connected providers.
Reads local OpenCode credential files and polls provider endpoints every minute (plus manual refresh).

## Structure

```
./
  main.js
  preload.js
  renderer.js
  index.html
  styles.css
  app.config.json
  app.config.example.json
  data/
  providers/
  .sisyphus/
  %TEMP%/               # scratch area (not part of app runtime)
```

## Where to look

| Task | Location | Notes |
|------|----------|-------|
| IPC + orchestration | `main.js` | owns fetch flow and IPC handlers |
| Renderer UI | `renderer.js` | DOM rendering; must escape error strings |
| Preload API | `preload.js` | only expose narrow IPC surface |
| Provider fetch/mapping | `providers/` | credentials, adapters, connect flows |
| Config | `app.config.json` | strict JSON only; comments break parsing |
| Sample payload | `data/sample-usage.json` | used for `dataMode:"sample"` / fallback |
| Planning notes | `.sisyphus/` | non-runtime artifacts |

## Commands

```bash
npm install
npm start
```

## Configuration

- `app.config.json` must be strict JSON.
- `app.config.example.json` is JSON-with-comments for humans; do not use as runtime config.
- Key keys: `dataMode` (`oauth` | `api` | `sample`), `enableSampleFallback`, `refreshIntervalMs`.

## OAuth / local files (secrets)

- Credentials are read from user-scoped files resolved by `providers/paths.js`.
- Treat anything derived from `auth.json` / `antigravity-accounts.json` as secret.

## Connect flows

- Codex callback: `http://localhost:1455/auth/callback`.
- Antigravity callback: `http://localhost:51121/oauth-callback`.
- Port conflicts are common (Codex: if OpenCode/Codex CLI is running).

## Data flow (runtime contract)

1) Renderer calls `window.usageApi.fetchUsage()`.
2) Main returns `{ status, source, fetchedAt, items, refreshIntervalMs, providerErrors?, accountInfo? }`.
3) Renderer renders banner/errors + cards.

## Conventions

- CommonJS (`require`, `module.exports`), semicolons, 2-space indent.
- Provider IDs are stable: `codex`, `antigravity`.

## Anti-patterns (project)

- Never log tokens, refresh tokens, auth codes, or full callback URLs.
- Never write secrets into `app.config.json`.
- Keep Electron security: `contextIsolation: true`, `nodeIntegration: false`.
- `%TEMP%/` is not app runtime; avoid coupling product code to it.
