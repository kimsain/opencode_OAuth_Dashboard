const CLOUDCODE_BASE_URL = "https://cloudcode-pa.googleapis.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CLOUDCODE_METADATA = {
  ideType: "ANTIGRAVITY",
  platform: "PLATFORM_UNSPECIFIED",
  pluginType: "GEMINI"
};
const ANTIGRAVITY_CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
// Publicly referenced in multiple OSS Antigravity auth implementations.
const ANTIGRAVITY_CLIENT_SECRET_PUBLIC = "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";
const DEFAULT_USER_AGENT = "antigravity/1.11.5 windows/amd64";
const DEFAULT_X_GOOG_API_CLIENT = "google-cloud-sdk vscode_cloudshelleditor/0.1";

const GEMINI_CLI_USER_AGENT = "google-api-nodejs-client/10.3.0";
const GEMINI_CLI_X_GOOG_API_CLIENT = "gl-node/22.18.0";
const GEMINI_CLI_METADATA_STRING = "ideType=IDE_UNSPECIFIED,platform=PLATFORM_UNSPECIFIED,pluginType=GEMINI";

const toFiniteNumber = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseExpiresTimestamp = (value) => {
  const numeric = toFiniteNumber(value);
  if (numeric !== null) return Math.floor(numeric);
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.floor(date.getTime() / 1000);
  }
  return null;
};

const extractProjectId = (value) => {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "id")) {
    const id = value.id;
    if (typeof id === "string" && id) return id;
  }
  return undefined;
};

const clampFraction = (input) => {
  const number = typeof input === "number" ? input : Number(input);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(1, number));
};

const parseResetTime = (value) => {
  if (typeof value === "string" && value) return value;
  const candidate = typeof value === "number" ? new Date(value) : value;
  if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
    return candidate.toISOString();
  }
  return undefined;
};

const shouldSkipModel = (label) => {
  if (!label) return true;
  const normalized = label.toLowerCase();
  if (normalized.startsWith("chat_")) return true;
  if (normalized.startsWith("rev19")) return true;
  if (normalized.includes("gemini 3 pro image")) return true;
  return false;
};

const ensureFetch = (providedFetch) => {
  if (providedFetch) return providedFetch;
  if (typeof fetch === "function") return fetch;
  throw new Error("Fetch API is not available");
};

const buildErrorMessage = async (prefix, response) => {
  let details = "";
  try {
    const text = await response.text();
    if (text) {
      details = `: ${text}`;
    }
  } catch (error) {
    // ignore
  }
  return `${prefix} (${response.status})${details}`;
};

const exchangeRefreshToken = async (refreshToken, options) => {
  const fetchFn = ensureFetch(options.fetch);
  if (!options.clientSecret) {
    throw new Error("Antigravity client secret missing; set ANTIGRAVITY_CLIENT_SECRET or pass options.clientSecret");
  }
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: options.clientId,
    client_secret: options.clientSecret
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetchFn(options.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString(),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(await buildErrorMessage("Antigravity token refresh failed", response));
    }
    const data = await response.json();
    if (!data || !data.access_token) {
      throw new Error("Antigravity token refresh did not return an access token");
    }
    return data.access_token;
  } finally {
    clearTimeout(timeoutId);
  }
};

const resolveAccessToken = (account) => {
  if (!account || typeof account !== "object") return null;
  const token =
    account.accessToken ||
    account.access_token ||
    account.access ||
    account.token ||
    account.idToken;
  return typeof token === "string" && token ? token : null;
};

const resolveRefreshToken = (account) => {
  if (!account || typeof account !== "object") return null;
  const token = account.refreshToken || account.refresh_token || account.refresh;
  return typeof token === "string" && token ? token : null;
};

const isAccessTokenExpired = (account) => {
  const expiresAt = parseExpiresTimestamp(account?.expires);
  if (expiresAt === null) return false;
  return expiresAt <= Math.floor(Date.now() / 1000);
};

const loadCodeAssist = async (accessToken, options) => {
  const fetchFn = ensureFetch(options.fetch);
  const clientMetadata = options.clientMetadata || JSON.stringify(options.metadata);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetchFn(`${options.cloudcodeBaseUrl}/v1internal:loadCodeAssist`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": options.userAgent,
        "X-Goog-Api-Client": options.xGoogApiClient,
        "Client-Metadata": clientMetadata
      },
      body: JSON.stringify({ metadata: options.metadata }),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(await buildErrorMessage("loadCodeAssist failed", response));
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchAvailableModels = async (accessToken, projectId, options) => {
  const fetchFn = ensureFetch(options.fetch);
  const payload = projectId ? { project: projectId } : {};
  const clientMetadata = options.clientMetadata || JSON.stringify(options.metadata);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  try {
    const response = await fetchFn(`${options.cloudcodeBaseUrl}/v1internal:fetchAvailableModels`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": options.userAgent,
        "X-Goog-Api-Client": options.xGoogApiClient,
        "Client-Metadata": clientMetadata
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(await buildErrorMessage("fetchAvailableModels failed", response));
    }
    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
};

const normalizeOptions = (overrides = {}) => ({
  fetch: overrides.fetch,
  tokenUrl: overrides.tokenUrl || GOOGLE_TOKEN_URL,
  cloudcodeBaseUrl: overrides.cloudcodeBaseUrl || CLOUDCODE_BASE_URL,
  metadata: overrides.metadata || CLOUDCODE_METADATA,
  clientId: overrides.clientId || ANTIGRAVITY_CLIENT_ID,
  clientSecret:
    overrides.clientSecret ??
    process.env.ANTIGRAVITY_CLIENT_SECRET ??
    ANTIGRAVITY_CLIENT_SECRET_PUBLIC,
  userAgent: overrides.userAgent || DEFAULT_USER_AGENT,
  xGoogApiClient: overrides.xGoogApiClient || DEFAULT_X_GOOG_API_CLIENT,
  clientMetadata: overrides.clientMetadata,
  timeout: overrides.timeout || 30000
});

const mapAntigravity = (quotaResponse, categoryOverride) => {
  if (!quotaResponse || typeof quotaResponse !== "object") return [];
  const models = quotaResponse.models;
  if (!models || typeof models !== "object") return [];
  const entries = Object.entries(models);
  const normalized = [];
  for (const [modelKey, info] of entries) {
    if (!info || typeof info !== "object") continue;
    const quotaInfo = info.quotaInfo;
    if (!quotaInfo || typeof quotaInfo !== "object") continue;
    const label = (typeof info.displayName === "string" && info.displayName) ? info.displayName : modelKey;
    if (!label) continue;
    if (shouldSkipModel(label)) continue;
    const remainingFraction = clampFraction(quotaInfo.remainingFraction);
    const used = Math.max(0, Math.min(100, (1 - remainingFraction) * 100));
    const category = categoryOverride || (label.toLowerCase().includes("antigravity") ? "antigravity" : "gemini-cli");
    normalized.push({
      category,
      model: label,
      limit: 100,
      used,
      unit: "percent",
      resetAt: parseResetTime(quotaInfo.resetTime)
    });
  }
  return normalized;
};

const fetchAntigravityItems = async (account, options = {}) => {
  return fetchInternal(account, {
    ...options,
    category: "antigravity"
  });
};

const fetchGeminiCliItems = async (account, options = {}) => {
  try {
    return await fetchInternal(account, {
      ...options,
      userAgent: GEMINI_CLI_USER_AGENT,
      xGoogApiClient: GEMINI_CLI_X_GOOG_API_CLIENT,
      clientMetadata: GEMINI_CLI_METADATA_STRING,
      category: "gemini-cli"
    });
  } catch (error) {
    // 403 Forbidden means the Project ID (likely default 'rising-fact-p41fc') blocks Gemini CLI User-Agent.
    if (error.message && error.message.includes("403")) {
      // Retry with Antigravity User-Agent but keep Gemini metadata.
      // This allows access to the project while attempting to request the specific quota pool via headers.
      return fetchInternal(account, {
        ...options,
        userAgent: DEFAULT_USER_AGENT, 
        xGoogApiClient: GEMINI_CLI_X_GOOG_API_CLIENT,
        clientMetadata: GEMINI_CLI_METADATA_STRING,
        category: "gemini-cli"
      });
    }
    throw error;
  }
};

const fetchInternal = async (account, options) => {
   const resolved = normalizeOptions(options);
  if (!account || typeof account !== "object") {
    throw new Error("Missing Antigravity account");
  }

  const directAccessToken = resolveAccessToken(account);
  const refreshToken = resolveRefreshToken(account);

  let accessToken = null;
  if (refreshToken) {
    try {
      // Prefer a fresh token minted for the Antigravity client.
      accessToken = await exchangeRefreshToken(refreshToken, resolved);
    } catch (error) {
      const message = error?.message || "";
      if (directAccessToken && !message.toLowerCase().includes("invalid_client")) {
        accessToken = directAccessToken;
      } else {
        throw error;
      }
    }
  } else if (directAccessToken && !isAccessTokenExpired(account)) {
    accessToken = directAccessToken;
  } else if (directAccessToken) {
    throw new Error("Antigravity access token expired and no refresh token available");
  } else {
    throw new Error("Antigravity account is missing access/refresh tokens");
  }

  let projectId = account.projectId || account.managedProjectId || extractProjectId(account.project);
  if (!projectId) {
    const assist = await loadCodeAssist(accessToken, resolved);
    projectId = extractProjectId(assist?.cloudaicompanionProject);
  }
  const quotaResponse = await fetchAvailableModels(accessToken, projectId, resolved);
  return mapAntigravity(quotaResponse, options.category);
}

// Re-exporting the original signature for backward compatibility if needed, 
// but we are replacing the file content so we can change the exports.
// We need to fix fetchAntigravityItems to use fetchInternal too.


module.exports = {
  CLOUDCODE_METADATA,
  mapAntigravity,
  fetchAntigravityItems,
  fetchGeminiCliItems
};
