# Quota Pulse - Agent Guidelines (AGENTS.md)

Updated: 2026-02-01
Project: Electron Desktop Dashboard for OAuth Usage & Quota Monitoring

## 📋 OVERVIEW
Premium Electron dashboard for real-time OAuth quota monitoring (Codex/Antigravity) and `oh-my-opencode.json` configuration management.
Key features: Glassmorphic UI, state-driven rendering, atomic config safety, and bilingual support (EN/KR).

## 🛠 COMMANDS
*   **Start App**: `npm start` (Runs `electron .`)
*   **Install Deps**: `npm install`
*   **Tests**: No automated test suite. Manual verification required.
    *   **Verify**: Start app, click "Refresh", check console for errors (Ctrl+Shift+I).
*   **Linting**: No automated linter. Follow existing style strictly.

## 🏗 CODE STRUCTURE
*   **Process Manager** (`main.js`): Entry point. Handles IPC, file I/O, and API orchestration.
*   **UI Logic** (`renderer.js`): Pure DOM manipulation. State-driven (`state` object -> `render()` pattern).
*   **Bridge** (`preload.js`): Exposes safe API to renderer via `window.usageApi`.
*   **Providers** (`providers/`):
    *   `antigravity.js` / `codex.js`: API adapters using Adapter Pattern.
    *   `credentials.js`: Token/Auth management.
    *   `paths.js`: Cross-platform path resolution (XDG standards).
    *   `view_mapper.js`: Normalizes data for UI (sorting/grouping).
*   **Config**: `app.config.json` (Runtime), `oh-my-opencode.json` (Target managed config).

## 🎨 CODE STYLE & CONVENTIONS

### JavaScript (CommonJS)
*   **Module System**: `require` / `module.exports`. **NO ESM** (`import`/`export`).
*   **Formatting**: 
    *   **Indentation**: 2 spaces.
    *   **Semicolons**: **REQUIRED**.
    *   **Quotes**: Double quotes `"` preferred.
*   **Async/Await**: Preferred over raw promises. `fs.promises` for file I/O.
*   **Naming**:
    *   Variables/Functions: `camelCase` (e.g., `fetchUsage`, `renderCards`).
    *   Constants: `UPPER_SNAKE_CASE` (e.g., `BASE_ALLOWED_MODELS`).
    *   DOM Elements: Suffix with `El` or `Btn` (e.g., `refreshBtn`, `statusEl`).

### Electron Patterns
*   **IPC Communication**:
    *   **Main**: `ipcMain.handle("channel:action", async () => { ... })`.
    *   **Renderer**: `window.usageApi.action()`.
    *   **Response**: Standardized `{ status: "ok", data: ... }` or `{ status: "error", message: ... }`.
*   **Security**:
    *   `contextIsolation: true`, `nodeIntegration: false`.
    *   **NEVER** pass raw tokens/secrets to Renderer. Redact in `providers/` before returning.
    *   **File I/O**: Only in Main process. Use `safeReadJson` helper.

### UI / Renderer
*   **State Management**: Single `state` object. Mutate `state`, then call `render*()` function.
    *   *Do not* implementation complex reactive frameworks (React/Vue). Keep it vanilla.
*   **Safety**: Always use `escapeHtml()` helper before injecting user content into `innerHTML`.
*   **Design**: Glassmorphism.
    *   Use CSS variables (`--glass-bg`, `--text-primary`) for theming.
    *   Use `backdrop-filter: blur(...)` for depth.

## 🔒 SECURITY & CONFIG
*   **Secrets**: Never commit `app.config.json` or credential files (`auth.json`, `credentials.json`).
*   **Input Sanitization**: All user-provided data (e.g., config values) must be escaped via `escapeHtml()` before rendering to prevent XSS.
*   **Network Stability**: API requests must have a 30s timeout (`AbortController`) to prevent UI hangs.
*   **Config Resolution**:
    *   Follows XDG standards (via `providers/paths.js`).
    *   Checks `~/.config/opencode`, `~/.local/share/opencode`, and `%APPDATA%`.
*   **Atomic Writes**: Critical for config integrity. `ipcMain.handle("ohmyopencode:save")` must ensure partial writes don't corrupt files.

## 🤖 AGENT BEHAVIOR
1.  **Read First**: Check `main.js` and `renderer.js` to understand the flow before editing.
2.  **No New Deps**: Avoid adding npm packages unless absolutely necessary.
3.  **Preserve Style**: Match existing indentation and variable naming conventions.
4.  **Error Handling**:
    *   Providers should throw actionable errors.
    *   Main process catches and formats for Renderer.
    *   Do not swallow errors silently unless explicitly handling `ENOENT` (file not found).

## ⚠️ TROUBLESHOOTING & COMMON PITFALLS
*   **"require is not defined" in Renderer**: You used `require` in `renderer.js`. Move logic to `preload.js` or `main.js`.
*   **IPC Handler Not Found**: Ensure channels match exactly in `main.js` and `preload.js`.
*   **Path Issues**: Always use `providers/paths.js` resolvers. Do not hardcode paths like `C:\`.
*   **Undefined DOM Elements**: `renderer.js` runs after DOM load, but ensure IDs match `index.html`.

## 🧠 ARCHITECTURE FLOW
1.  **User Action**: Click "Refresh" in UI (`renderer.js`).
2.  **IPC Call**: `window.usageApi.refresh()` -> `ipcRenderer.invoke("usage:refresh")`.
3.  **Main Handler**: `main.js` receives call.
4.  **Provider Fetch**: Calls `fetchCodexUsage` / `fetchAntigravityItems`.
5.  **Normalization**: Providers return array of items `{ model, used, limit, ... }`.
6.  **Response**: `main.js` sends `{ status: "ok", data: items }` back.
7.  **Render**: `renderer.js` updates `state.items` and calls `renderCards()`.
