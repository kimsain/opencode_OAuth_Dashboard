# Quota Pulse - Provider Layer (AGENTS.md)

Updated: 2026-02-01

## 📋 OVERVIEW
Unified adapter layer for abstracting diverse OAuth quota sources into a standardized dashboard contract.

## 🏗 STRUCTURE
*   **Adapters** (`antigravity.js`, `codex.js`): Implements service-specific logic for the "Discovery -> Auth -> Fetch -> Map" lifecycle.
*   **Security** (`credentials.js`): Safely discovers and redacts local auth tokens before they reach the Main process.
*   **Normalizer** (`view_mapper.js`): Transforms raw provider payloads into sorted, dashboard-ready state items.
*   **Orchestration** (`*_connect.js`): Handles local server callbacks for browser-based OAuth authentication flows.
*   **Environment** (`paths.js`, `constants.js`): Resolves XDG-compliant storage paths and maintains global model definitions.

## 🔍 WHERE TO LOOK
| Task | Location | Notes |
|:---|:---|:---|
| **API Mapping** | `providers/codex.js` | Main logic for OpenAI/Codex usage window calculation. |
| **Quota Logic** | `providers/antigravity.js` | Handles Google Cloud quota fractions and project-level limits. |
| **Token Discovery**| `providers/credentials.js` | Scans for `auth.json` or Google SDK credentials; performs redaction. |
| **Data Shaping** | `providers/view_mapper.js` | Logic for grouping items by category or model type for the UI. |
| **Path Resolution**| `providers/paths.js` | Platform-specific path detection (Windows %APPDATA% vs Unix ~/.config). |

## ⚖️ CONVENTIONS
*   **Stable Naming**: Use keys `"codex"` and `"antigravity"` consistently for provider identification.
*   **Redaction Policy**: **Strict Privacy.** Strip all secrets (tokens, auth codes) before data crosses the IPC boundary.
*   **Atomic Responses**: Return self-contained arrays of standardized items: `{ category, model, used, limit, resetAt, unit }`.
*   **Async-First**: All providers must return Promises; use `fs.promises` and `fetch` exclusively.

## 🚫 ANTI-PATTERNS
*   **No Disk Persistence**: Providers must NOT write secrets to disk. Refreshing is allowed in-memory only.
*   **No Synchronous I/O**: Blocking the event loop in providers is strictly forbidden.
*   **No UI Logic**: Do not include presentation code; return data that `renderer.js` can consume directly.
*   **No Direct IPC**: Providers are called by `main.js`. Do not use `ipcMain` or `ipcRenderer` here.
