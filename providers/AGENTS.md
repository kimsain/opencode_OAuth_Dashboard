# Quota Pulse - Provider Layer (AGENTS.md)

Updated: 2026-01-29

## 🧩 PROVIDER ARCHITECTURE

### OVERVIEW
Providers implement an **Adapter Pattern** to abstract diverse quota/usage sources into a unified dashboard contract. They handle the "Discovery -> Auth -> Fetch -> Map" lifecycle, shielding the main process from API-specific complexities.

### WHERE TO LOOK
| Task | Location | Notes |
|:---|:---|:---|
| **Path Resolution** | `providers/paths.js` | Cross-platform path detection; must stay environment-agnostic. |
| **Credential Discovery** | `providers/credentials.js` | Logic for finding local `auth.json` or Google SDK `accounts.json`. |
| **API Mapping (Codex)** | `providers/codex.js` | Maps OpenAI usage windows into dashboard items. |
| **API Mapping (Google)** | `providers/antigravity.js` | Maps Google Cloud quota fractions to items. |
| **Data Normalization** | `providers/view_mapper.js` | Groups and sorts items for Model/Category views (title, subtitle decoration). |
| **Shared Constants** | `providers/constants.js` | lists `BASE_ALLOWED_MODELS` and `ALLOWED_VARIANTS`. |
| **OAuth Flows** | `providers/*_connect.js` | Local server handlers for browser-based OAuth connect flows. |

### CONVENTIONS
*   **Stable Naming**: Provider keys in payloads must remain consistent (e.g., `codex`, `antigravity`).
*   **Redaction Policy**: **Strict Privacy.** NEVER log, store, or return raw secrets (access/refresh tokens, auth codes, full callback URLs).
*   **Atomic Responses**: Return lists of standardized items: `{ category, model, used, limit, resetAt, unit }`.
*   **Errors**: Throw actionable `Error(message)`; main process aggregates these.

### ANTI-PATTERNS
*   **No Disk Persistence**: Providers must NOT write refreshed tokens or auth state back to disk. This app is a monitoring tool.
*   **No Synchronous I/O**: Use `fs.promises` or `fetch` for all filesystem and network operations.
*   **No UI Logic**: Providers map data for dashboard consumption; they do not handle presentation.
