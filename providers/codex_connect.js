const crypto = require("crypto");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");

// Mirrored from anomalyco/opencode packages/opencode/src/plugin/codex.ts (public OSS reference).
const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OAUTH_PORT = 1455;
const REDIRECT_URI = `http://localhost:${OAUTH_PORT}/auth/callback`;
const SCOPE = "openid profile email offline_access";

const isWindows = process.platform === "win32";

const base64Url = (buffer) => {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const generatePkceVerifier = () => base64Url(crypto.randomBytes(64));

const challengeFromVerifier = (verifier) => {
  const hash = crypto.createHash("sha256").update(verifier, "utf8").digest();
  return base64Url(hash);
};

const resolveAuthPath = () => {
  // Keep this local to avoid circular deps.
  // Match the same candidate dirs as providers/paths.js.
  const candidates = [];
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) candidates.push(path.join(xdgData, "opencode"));
  candidates.push(path.join(os.homedir(), ".local", "share", "opencode"));
  if (isWindows) {
    if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "opencode"));
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "opencode"));
    candidates.push(path.join(os.homedir(), "AppData", "Roaming", "opencode"));
    candidates.push(path.join(os.homedir(), "AppData", "Local", "opencode"));
  }
  for (const dir of Array.from(new Set(candidates))) {
    const p = path.join(dir, "auth.json");
    try {
      // eslint-disable-next-line no-sync
      require("fs").accessSync(p);
      return p;
    } catch {
      // continue
    }
  }
  return path.join(os.homedir(), ".local", "share", "opencode", "auth.json");
};

const readJson = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeJsonAtomic = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
};

const upsertOpenAIOAuth = async ({ accessToken, refreshToken, expiresIn, idToken }) => {
  const authPath = resolveAuthPath();
  const now = Math.floor(Date.now() / 1000);
  const expiresAt =
    typeof expiresIn === "number" && Number.isFinite(expiresIn)
      ? String(now + Math.floor(expiresIn))
      : undefined;

  const existing = (await readJson(authPath)) || {};
  const base = existing && typeof existing === "object" ? existing : {};
  const prior = base.openai && typeof base.openai === "object" ? base.openai : {};

  const next = {
    ...base,
    openai: {
      ...prior,
      type: "oauth",
      access: accessToken,
      refresh: refreshToken,
      ...(expiresAt ? { expires: expiresAt } : {}),
      ...(idToken ? { id_token: idToken } : {})
    }
  };

  await writeJsonAtomic(authPath, next);
  return { path: authPath };
};

const startCallbackServer = async ({ expectedState, timeoutMs }) => {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "", `http://127.0.0.1:${OAUTH_PORT}`);
        if (reqUrl.pathname !== "/auth/callback") {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state");
        const error = reqUrl.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end("<h2>Authentication cancelled</h2><p>You can close this window.</p>");
          cleanup();
          resolve({ type: "error", error });
          return;
        }

        if (!code) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Missing code");
          return;
        }

        if (!state || state !== expectedState) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Invalid state");
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>Connected</h2><p>You can close this window and return to the app.</p>");
        cleanup();
        resolve({ type: "success", code });
      } catch {
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Error");
      }
    });

    let timeoutId = null;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        server.close();
      } catch {
        // ignore
      }
    };

    server.on("error", (err) => {
      cleanup();
      reject(err);
    });

    server.listen(OAUTH_PORT, "127.0.0.1", () => {
      timeoutId = setTimeout(() => {
        cleanup();
        resolve({ type: "timeout" });
      }, timeoutMs);
    });
  });
};

const buildAuthorizeUrl = ({ pkce, state }) => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "opencode"
  });
  return `${ISSUER}/oauth/authorize?${params.toString()}`;
};

const exchangeCodeForTokens = async ({ code, pkce }) => {
  const response = await fetch(`${ISSUER}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: pkce.verifier
    }).toString()
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codex token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }

  return response.json();
};

async function connectCodex({ openExternal, timeoutMs = 5 * 60_000 } = {}) {
  if (typeof openExternal !== "function") {
    throw new Error("connectCodex requires openExternal(url)");
  }

  const verifier = generatePkceVerifier();
  const pkce = { verifier, challenge: challengeFromVerifier(verifier) };
  const state = base64Url(crypto.randomBytes(24));
  const url = buildAuthorizeUrl({ pkce, state });

  const callbackPromise = startCallbackServer({ expectedState: state, timeoutMs });
  await openExternal(url);

  const callback = await callbackPromise;
  if (!callback || callback.type === "timeout") {
    throw new Error("Codex connect timed out (is port 1455 in use?)");
  }
  if (callback.type === "error") {
    throw new Error(`Codex connect failed: ${callback.error}`);
  }

  const tokens = await exchangeCodeForTokens({ code: callback.code, pkce });
  const accessToken = tokens?.access_token;
  const refreshToken = tokens?.refresh_token;
  const expiresIn = tokens?.expires_in;
  const idToken = tokens?.id_token;

  if (!accessToken || !refreshToken) {
    throw new Error("Codex connect did not return access/refresh tokens");
  }

  const saved = await upsertOpenAIOAuth({ accessToken, refreshToken, expiresIn, idToken });
  return { path: saved.path };
}

module.exports = {
  connectCodex,
  resolveAuthPath
};
