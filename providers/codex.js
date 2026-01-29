const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const REFRESH_ENDPOINT = "https://auth.openai.com/oauth/token";
const PRIMARY_USAGE_ENDPOINT = "https://chatgpt.com/backend-api/wham/usage";
const FALLBACK_USAGE_ENDPOINT = "https://chatgpt.com/api/codex/usage";

const toFiniteNumber = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return null;
};

const secondsToIso = (seconds) => {
  const normalized = toFiniteNumber(seconds);
  if (normalized === null) return null;
  const date = new Date(normalized * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
};

const resetAfterSecondsToIso = (seconds) => {
  const normalized = toFiniteNumber(seconds);
  if (normalized === null) return null;
  const date = new Date(Date.now() + normalized * 1000);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toISOString();
};

const buildWindowItem = (window, label) => {
  if (!window || typeof window !== "object") return null;
  const usedPercent = toFiniteNumber(window.used_percent ?? window.usedPercent);
  const resetAt = secondsToIso(window.reset_at ?? window.resetAt) ??
    resetAfterSecondsToIso(window.reset_after_seconds ?? window.resetAfterSeconds);

  return {
    category: "codex",
    model: label,
    limit: 100,
    used: usedPercent ?? 0,
    resetAt,
    unit: "percent"
  };
};

const mapCodex = (payload) => {
  const rateLimit = payload?.rate_limit;
  if (!rateLimit || typeof rateLimit !== "object") {
    return [];
  }
  const items = [];
  const primary = buildWindowItem(rateLimit.primary_window, "5-hour usage cap");
  if (primary) items.push(primary);
  const secondary = buildWindowItem(rateLimit.secondary_window, "Weekly usage cap");
  if (secondary) items.push(secondary);
  return items;
};

const parseExpiresTimestamp = (value) => {
  const normalized = toFiniteNumber(value);
  if (normalized !== null) return Math.floor(normalized);
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return Math.floor(date.getTime() / 1000);
  }
  return null;
};

const normalizeHeaders = (headers) => {
  if (!headers) return {};
  if (typeof headers === "object") {
    if (typeof headers.forEach === "function") {
      const result = {};
      headers.forEach((value, key) => {
        result[key] = value;
      });
      return result;
    }
    return { ...headers };
  }
  return {};
};

const refreshAccessToken = async (refreshToken) => {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID
  });

  const response = await fetch(REFRESH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: params.toString()
  });

  if (!response.ok) {
    throw new Error("Codex refresh token request failed");
  }

  return response.json();
};

const executeUsageRequest = (url, token, accountId, options = {}) => {
  const { headers: providedHeaders, method: _method, ...rest } = options;
  const baseHeaders = {
    Authorization: `Bearer ${token}`
  };
  if (accountId) {
    baseHeaders["ChatGPT-Account-Id"] = accountId;
  }

  const mergedHeaders = {
    ...normalizeHeaders(providedHeaders),
    ...baseHeaders
  };

  return fetch(url, {
    method: "GET",
    headers: mergedHeaders,
    ...rest
  });
};

const shouldRefreshToken = (auth) => {
  if (!auth?.refresh || !auth.expires) return false;
  const expiresAt = parseExpiresTimestamp(auth.expires);
  if (expiresAt === null) return false;
  return expiresAt <= Math.floor(Date.now() / 1000);
};

const fetchCodexUsage = async (auth, options = {}) => {
  if (!auth || !auth.access) {
    throw new Error("Missing Codex access token");
  }

  let accessToken = auth.access;
  if (shouldRefreshToken(auth)) {
    if (!auth.refresh) {
      throw new Error("Codex access token expired and no refresh token available");
    }
    const refreshed = await refreshAccessToken(auth.refresh);
    if (refreshed?.access_token) {
      accessToken = refreshed.access_token;
      auth.access = accessToken;
    }
    if (typeof refreshed?.expires_in === "number" && Number.isFinite(refreshed.expires_in)) {
      auth.expires = Math.floor(Date.now() / 1000 + refreshed.expires_in).toString();
    }
  }

  const accountId = auth.chatGptAccountId;
  let response = await executeUsageRequest(PRIMARY_USAGE_ENDPOINT, accessToken, accountId, options);
  if (!response.ok) {
    response = await executeUsageRequest(FALLBACK_USAGE_ENDPOINT, accessToken, accountId, options);
  }

  if (!response.ok) {
    throw new Error(`Codex usage request failed (${response.status})`);
  }

  return response.json();
};

module.exports = {
  mapCodex,
  fetchCodexUsage
};
