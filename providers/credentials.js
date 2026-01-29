const fs = require("fs/promises");
const { resolveAuthPath, resolveAntigravityAccountsPath } = require("./paths");

const readJsonFile = async (filePath) => {
  if (!filePath) return null;
  try {
    const data = await fs.readFile(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

const findProviderEntry = (node, providerKey) => {
  if (!node || typeof node !== "object") return null;
  if (
    Object.prototype.hasOwnProperty.call(node, providerKey) &&
    node[providerKey] &&
    typeof node[providerKey] === "object"
  ) {
    return node[providerKey];
  }
  for (const key of Object.keys(node)) {
    const child = node[key];
    if (child && typeof child === "object") {
      const nested = findProviderEntry(child, providerKey);
      if (nested) return nested;
    }
  }
  return null;
};

const findOpenAiEntry = (node) => findProviderEntry(node, "openai");
const findGoogleEntry = (node) => findProviderEntry(node, "google");

const normalizeString = (value) => (typeof value === "string" && value ? value : null);

const resolveValue = (source, keys) => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value) {
      return value;
    }
  }
  return null;
};

const decodeBase64Url = (value) => {
  if (!value) return null;
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padding);
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch (error) {
    return null;
  }
};

const parseJwtPayload = (token) => {
  if (!token) return null;
  const segments = token.split(".");
  if (segments.length < 2) return null;
  const payload = decodeBase64Url(segments[1]);
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch (error) {
    return null;
  }
};

const extractChatGptAccountIdFromClaims = (claims) => {
  if (!claims || typeof claims !== "object") return null;
  const primary = claims.chatgpt_account_id;
  if (typeof primary === "string" && primary) return primary;
  const fallback = claims["https://api.openai.com/auth.chatgpt_account_id"];
  if (typeof fallback === "string" && fallback) return fallback;
  return null;
};

const extractEmailFromClaims = (claims) => {
  if (!claims || typeof claims !== "object") return null;
  const email = claims.email;
  if (typeof email === "string" && email) return email;
  return null;
};

const extractChatGptAccountId = (token) => {
  if (!token) return null;
  const claims = parseJwtPayload(token);
  return extractChatGptAccountIdFromClaims(claims);
};

const loadOpenAIOAuth = async () => {
  const authPath = resolveAuthPath();
  if (!authPath) return null;
  const data = await readJsonFile(authPath);
  const openaiEntry = findOpenAiEntry(data);
  if (!openaiEntry) return null;

  const accessToken = resolveValue(openaiEntry, ["access", "access_token", "accessToken"]);
  const refreshToken = resolveValue(openaiEntry, ["refresh", "refresh_token", "refreshToken"]);
  const hasTypeField = Object.prototype.hasOwnProperty.call(openaiEntry, "type");
  if (hasTypeField && openaiEntry.type !== "oauth") {
    return null;
  }
  if (!hasTypeField && !accessToken && !refreshToken) {
    return null;
  }
  const idToken = resolveValue(openaiEntry, ["id_token", "idToken"]);
  const idClaims = parseJwtPayload(idToken);
  
  // Fallback to fields directly on the entry if JWT fails
  const email = extractEmailFromClaims(idClaims) || resolveValue(openaiEntry, ["email", "userEmail", "user"]);
  const chatGptAccountId = 
    extractChatGptAccountIdFromClaims(idClaims) || 
    extractChatGptAccountId(accessToken) ||
    resolveValue(openaiEntry, ["chatGptAccountId", "chatgpt_account_id", "accountId", "id", "userId"]);

  return {
    access: accessToken,
    refresh: refreshToken,
    expires: normalizeString(openaiEntry.expires) ?? openaiEntry.expires,
    idToken,
    chatGptAccountId,
    email
  };
};

const loadGoogleOAuth = async () => {
  const authPath = resolveAuthPath();
  if (!authPath) return null;
  const data = await readJsonFile(authPath);
  const googleEntry = findGoogleEntry(data);
  if (!googleEntry) return null;

  const accessToken = resolveValue(googleEntry, ["access", "access_token", "accessToken"]);
  const refreshToken = resolveValue(googleEntry, ["refresh", "refresh_token", "refreshToken"]);
  const hasTypeField = Object.prototype.hasOwnProperty.call(googleEntry, "type");
  if (hasTypeField && googleEntry.type !== "oauth") {
    return null;
  }
  if (!hasTypeField && !accessToken && !refreshToken) {
    return null;
  }

  return {
    access: accessToken,
    refresh: refreshToken,
    expires: normalizeString(googleEntry.expires) ?? googleEntry.expires
  };
};

const toFiniteIndex = (value) => {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }
  return null;
};

const loadActiveAntigravityAccount = async () => {
  const accountsPath = resolveAntigravityAccountsPath();
  if (!accountsPath) return null;
  const data = await readJsonFile(accountsPath);
  if (!data || !Array.isArray(data.accounts) || !data.accounts.length) return null;

  const familyIndex = toFiniteIndex(data.activeIndexByFamily?.gemini);
  const fallbackIndex = toFiniteIndex(data.activeIndex);
  let chosenIndex = familyIndex ?? fallbackIndex;
  if (chosenIndex === null) {
    chosenIndex = 0;
  }
  if (!data.accounts[chosenIndex]) {
    chosenIndex = 0;
  }

  return {
    account: data.accounts[chosenIndex],
    index: chosenIndex,
    path: accountsPath
  };
};

module.exports = {
  loadOpenAIOAuth,
  loadGoogleOAuth,
  loadActiveAntigravityAccount,
  resolveAuthPath,
  resolveAntigravityAccountsPath
};
