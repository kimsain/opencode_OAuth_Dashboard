const crypto = require("crypto");
const http = require("http");
const os = require("os");
const path = require("path");
const fs = require("fs/promises");

// Mirrored from opencode-antigravity-auth constants (public OSS reference).
const ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_CLIENT_SECRET = "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";
const ANTIGRAVITY_REDIRECT_URI = "http://localhost:51121/oauth-callback";
const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs"
];

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";

const isWindows = process.platform === "win32";

const base64Url = (buffer) => {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const generatePkceVerifier = () => {
  // RFC 7636: 43-128 chars.
  return base64Url(crypto.randomBytes(64));
};

const challengeFromVerifier = (verifier) => {
  const hash = crypto.createHash("sha256").update(verifier, "utf8").digest();
  return base64Url(hash);
};

const resolveConfigDir = () => {
  if (isWindows) {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "opencode");
  }
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfig, "opencode");
};

const resolveAccountsPath = () => {
  return path.join(resolveConfigDir(), "antigravity-accounts.json");
};

const readJson = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const writeJson = async (filePath, value) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
};

const upsertAccountStorage = async ({ refreshToken, email }) => {
  const filePath = resolveAccountsPath();

  const now = Date.now();
  const existing = await readJson(filePath);
  const base = {
    version: 3,
    accounts: [],
    activeIndex: 0,
    activeIndexByFamily: {
      gemini: 0
    }
  };

  const storage = existing && typeof existing === "object" ? existing : base;
  const accounts = Array.isArray(storage.accounts) ? storage.accounts.slice() : [];

  let index = accounts.findIndex((acc) => acc && typeof acc === "object" && acc.refreshToken === refreshToken);
  if (index === -1 && email) {
    index = accounts.findIndex((acc) => acc && typeof acc === "object" && acc.email === email);
  }

  const account = {
    email: email || undefined,
    refreshToken,
    addedAt: now,
    lastUsed: now,
    enabled: true
  };

  if (index === -1) {
    accounts.push(account);
    index = accounts.length - 1;
  } else {
    const prior = accounts[index] || {};
    accounts[index] = {
      ...prior,
      ...account,
      addedAt: typeof prior.addedAt === "number" ? prior.addedAt : account.addedAt
    };
  }

  const next = {
    version: 3,
    accounts,
    activeIndex: index,
    activeIndexByFamily: {
      ...(storage.activeIndexByFamily || {}),
      gemini: index
    }
  };

  await writeJson(filePath, next);
  return { path: filePath, index, email: email || undefined };
};

const startCallbackServer = async ({ timeoutMs }) => {
  const url = new URL(ANTIGRAVITY_REDIRECT_URI);
  const port = Number(url.port);
  const expectedPath = url.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const reqUrl = new URL(req.url || "", `http://127.0.0.1:${port}`);
        if (reqUrl.pathname !== expectedPath) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        const code = reqUrl.searchParams.get("code");
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

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>Connected</h2><p>You can close this window and return to the app.</p>");
        cleanup();
        resolve({ type: "success", code });
      } catch (e) {
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

    server.listen(port, "127.0.0.1", () => {
      timeoutId = setTimeout(() => {
        cleanup();
        resolve({ type: "timeout" });
      }, timeoutMs);
    });
  });
};

const exchangeCodeForTokens = async ({ code, verifier }) => {
  const body = new URLSearchParams({
    client_id: ANTIGRAVITY_CLIENT_ID,
    client_secret: ANTIGRAVITY_CLIENT_SECRET,
    code,
    grant_type: "authorization_code",
    redirect_uri: ANTIGRAVITY_REDIRECT_URI,
    code_verifier: verifier
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Accept: "*/*"
    },
    body
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Antigravity token exchange failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  return {
    accessToken: data?.access_token,
    refreshToken: data?.refresh_token,
    expiresIn: data?.expires_in
  };
};

const fetchUserEmail = async (accessToken) => {
  if (!accessToken) return null;
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  const email = data?.email;
  return typeof email === "string" && email ? email : null;
};

const buildAuthorizationUrl = ({ verifier }) => {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", ANTIGRAVITY_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", ANTIGRAVITY_REDIRECT_URI);
  url.searchParams.set("scope", ANTIGRAVITY_SCOPES.join(" "));
  url.searchParams.set("code_challenge", challengeFromVerifier(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  return url.toString();
};

async function connectAntigravity({ openExternal, timeoutMs = 5 * 60_000 } = {}) {
  if (typeof openExternal !== "function") {
    throw new Error("connectAntigravity requires openExternal(url)");
  }

  const verifier = generatePkceVerifier();
  const authUrl = buildAuthorizationUrl({ verifier });
  const serverResultPromise = startCallbackServer({ timeoutMs });

  await openExternal(authUrl);

  const callback = await serverResultPromise;
  if (!callback || callback.type === "timeout") {
    throw new Error("Antigravity connect timed out");
  }
  if (callback.type === "error") {
    throw new Error(`Antigravity connect failed: ${callback.error}`);
  }

  const tokenResult = await exchangeCodeForTokens({ code: callback.code, verifier });
  if (!tokenResult.refreshToken) {
    throw new Error("Antigravity connect did not return a refresh token. Try again or revoke consent and retry.");
  }
  const email = await fetchUserEmail(tokenResult.accessToken);
  const saved = await upsertAccountStorage({ refreshToken: tokenResult.refreshToken, email });

  return {
    email: saved.email,
    path: saved.path
  };
}

module.exports = {
  connectAntigravity,
  resolveAccountsPath
};
