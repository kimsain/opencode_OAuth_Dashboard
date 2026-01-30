const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const fs = require("fs/promises");

const {
  loadOpenAIOAuth,
  loadGoogleOAuth,
  loadActiveAntigravityAccount
} = require("./providers/credentials");
const { fetchAntigravityItems, fetchGeminiCliItems } = require("./providers/antigravity");
const { fetchCodexUsage, mapCodex } = require("./providers/codex");
const { computeViewData } = require("./providers/view_mapper");
const { connectAntigravity } = require("./providers/antigravity_connect");
const { connectCodex } = require("./providers/codex_connect");
const { resolveOhMyOpencodePath } = require("./providers/paths");

const {
  BASE_ALLOWED_MODELS,
  ALLOWED_VARIANTS
} = require("./providers/constants");

const ALLOWED_MODELS = new Set(BASE_ALLOWED_MODELS);

const ALLOWED_VARIANTS_SET = new Set(ALLOWED_VARIANTS);

const DEFAULT_VARIANT_CATALOG = {
  "openai/gpt-5.2-codex": ["low", "medium", "high", "xhigh"],
  "openai/gpt-5.2": ["low", "medium", "high", "xhigh"],
  "openai/gpt-5.1-codex-mini": ["low", "medium", "high"],
  "opencode/big-pickle": ["low", "medium", "high"]
};

const mergeVariantCatalog = (catalog) => ({
  ...DEFAULT_VARIANT_CATALOG,
  ...(catalog || {})
});

const refreshDefaults = {
  intervalMs: 60_000,
  requestTimeoutMs: 8_000
};

const getRootDir = () => {
  if (app.isPackaged) {
    return path.dirname(app.getPath("exe"));
  }
  return process.cwd();
};

const safeReadJson = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
};

const detectIndent = (raw) => {
  const match = raw.match(/\n([\t ]+)\S/);
  if (!match) return 2;
  if (match[1].includes("\t")) return "\t";
  return match[1].length || 2;
};

const readJsonWithIndent = async (filePath) => {
  const raw = await fs.readFile(filePath, "utf8");
  const indent = detectIndent(raw);
  return { data: JSON.parse(raw), indent };
};

const resolveOpencodeConfigCandidates = () => {
  const homeDir = os.homedir();
  const candidates = [
    path.join(homeDir, ".config", "opencode", "opencode.json"),
    path.join(homeDir, ".local", "share", "opencode", "opencode.json")
  ];
  if (process.env.APPDATA) {
    candidates.push(path.join(process.env.APPDATA, "opencode", "opencode.json"));
  }
  return candidates;
};

const loadOpencodeConfig = async () => {
  const candidates = resolveOpencodeConfigCandidates();
  for (const candidate of candidates) {
    try {
      const { data } = await readJsonWithIndent(candidate);
      return data;
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES" || error instanceof SyntaxError) {
        continue;
      }
    }
  }
  return null;
};

const buildVariantCatalog = (config) => {
  const catalog = {};
  if (!config || typeof config !== "object") return catalog;
  const providers = config.provider && typeof config.provider === "object" ? config.provider : {};
  Object.entries(providers).forEach(([providerKey, providerValue]) => {
    if (!providerValue || typeof providerValue !== "object") return;
    const models = providerValue.models && typeof providerValue.models === "object" ? providerValue.models : {};
    Object.entries(models).forEach(([modelKey, modelValue]) => {
      if (!modelValue || typeof modelValue !== "object") return;
      const variantsValue = modelValue.variants;
      let variants = [];
      if (Array.isArray(variantsValue)) {
        variants = variantsValue.filter((variant) => typeof variant === "string");
      } else if (variantsValue && typeof variantsValue === "object") {
        variants = Object.keys(variantsValue);
      }
      variants = variants.map((variant) => variant.trim()).filter(Boolean);
      if (!variants.length) return;
      const fullModel = modelKey.includes("/") ? modelKey : `${providerKey}/${modelKey}`;
      catalog[fullModel] = variants;
    });
  });
  return catalog;
};

const extractModelEntries = (sectionName, sectionValue) => {
  const entries = [];
  if (Array.isArray(sectionValue)) {
    sectionValue.forEach((value, index) => {
      const isObject = value && typeof value === "object";
      const model = isObject ? value.model : undefined;
      const variant = isObject ? value.variant : undefined;
      const hasModel = typeof model === "string";
      const hasVariant = typeof variant === "string";
      const label =
        (isObject && (value.name || value.id)) || `${sectionName}[${index}]`;
      entries.push({
        key: String(index),
        label: String(label),
        model: hasModel ? model : null,
        hasModel,
        variant: hasVariant ? variant : null,
        hasVariant,
        path: [sectionName, index, "model"],
        variantPath: [sectionName, index, "variant"],
        objectPath: [sectionName, index],
        invalid: !isObject
      });
    });
  } else if (sectionValue && typeof sectionValue === "object") {
    Object.entries(sectionValue).forEach(([key, value]) => {
      const isObject = value && typeof value === "object";
      const model = isObject ? value.model : undefined;
      const variant = isObject ? value.variant : undefined;
      const hasModel = typeof model === "string";
      const hasVariant = typeof variant === "string";
      entries.push({
        key,
        label: String(key),
        model: hasModel ? model : null,
        hasModel,
        variant: hasVariant ? variant : null,
        hasVariant,
        path: [sectionName, key, "model"],
        variantPath: [sectionName, key, "variant"],
        objectPath: [sectionName, key],
        invalid: !isObject
      });
    });
  }
  return entries;
};

const collectInvalidEntries = (data, variantCatalog) => {
  const invalid = [];
  const sections = [
    { name: "agents", value: data?.agents },
    { name: "categories", value: data?.categories }
  ];
  sections.forEach((section) => {
    const entries = extractModelEntries(section.name, section.value);
    entries.forEach((entry) => {
      if (entry.hasModel && !ALLOWED_MODELS.has(entry.model)) {
        invalid.push({
          section: section.name,
          label: entry.label,
          type: "model",
          value: entry.model
        });
      }
      if (entry.hasVariant) {
        const catalogVariants =
          entry.hasModel && variantCatalog && Array.isArray(variantCatalog[entry.model])
            ? variantCatalog[entry.model]
            : null;
        const allowedVariants = catalogVariants && catalogVariants.length
          ? catalogVariants
          : Array.from(ALLOWED_VARIANTS_SET);
        if (!allowedVariants.includes(entry.variant)) {
          invalid.push({
            section: section.name,
            label: entry.label,
            type: "variant",
            value: entry.variant
          });
        }
      }
    });
  });
  return invalid;
};

const writeJsonAtomicWithBackup = async (filePath, value, indent) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  let backupPath = null;
  try {
    await fs.access(filePath);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    backupPath = `${filePath}.${stamp}.bak`;
    await fs.copyFile(filePath, backupPath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  const tmp = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  const payload = JSON.stringify(value, null, indent);
  await fs.writeFile(tmp, payload, "utf8");
  await fs.rename(tmp, filePath);
  return backupPath;
};

const normalizeItems = (items) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      if (!item) return null;
      const category = String(item.category || "").trim();
      const model = String(item.model || "").trim();
      const used = Number(item.used);
      const limit = Number(item.limit);
      const resetAt = item.resetAt ? String(item.resetAt) : "";

      if (!category || !model) return null;
      if (!Number.isFinite(used) || !Number.isFinite(limit)) return null;

      return {
        category,
        model,
        used,
        limit,
        resetAt
      };
    })
    .filter(Boolean);
};

const loadConfig = async () => {
  const configPath = path.join(getRootDir(), "app.config.json");
  try {
    return await safeReadJson(configPath);
  } catch (error) {
    return null;
  }
};

const fetchWithTimeout = async (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchUsageFromApi = async (config) => {
  const url = config?.usageUrl;
  if (!url) {
    throw new Error("Missing usageUrl in app.config.json");
  }

  const method = config?.method || "GET";
  const headers = config?.headers || {};
  const timeoutMs = Number(config?.timeoutMs) || refreshDefaults.requestTimeoutMs;
  const body = config?.body;

  const response = await fetchWithTimeout(
    url,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    },
    timeoutMs
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
};

const loadSampleUsage = async () => {
  const samplePath = path.join(getRootDir(), "data", "sample-usage.json");
  return safeReadJson(samplePath);
};

const safeLoadSampleUsage = async () => {
  try {
    return await loadSampleUsage();
  } catch {
    return null;
  }
};

const buildSamplePayload = async () => {
  const sample = await safeLoadSampleUsage();
  if (!sample) return null;
  const items = normalizeItems(sample.items || []);
  return {
    fetchedAt: sample.fetchedAt || new Date().toISOString(),
    items
  };
};

const buildSampleFallback = async (refreshIntervalMs, enableSampleFallback) => {
  if (!enableSampleFallback) return null;
  const sample = await buildSamplePayload();
  if (!sample) return null;
  return {
    source: "sample",
    ...sample,
    refreshIntervalMs
  };
};

const resolveRefreshInterval = (config) => {
  const candidate = Number(config?.refreshIntervalMs);
  if (Number.isFinite(candidate) && candidate > 0) {
    return candidate;
  }
  return refreshDefaults.intervalMs;
};

const resolveDataMode = (config) => {
  const raw = String(config?.dataMode || "oauth").toLowerCase();
  if (["oauth", "api", "sample"].includes(raw)) {
    return raw;
  }
  return "oauth";
};

const resolveSampleFallbackFlag = (config) => {
  if (typeof config?.enableSampleFallback === "boolean") {
    return config.enableSampleFallback;
  }
  return true;
};

const resolveSampleMode = async (refreshIntervalMs) => {
  const sample = await buildSamplePayload();
  if (!sample) {
    return {
      status: "error",
      source: "sample",
      message: "Unable to load sample usage data",
      refreshIntervalMs
    };
  }
  return {
    status: "ok",
    source: "sample",
    ...sample,
    refreshIntervalMs
  };
};

const resolveApiMode = async (config, refreshIntervalMs, enableSampleFallback) => {
  try {
    const apiData = await fetchUsageFromApi(config);
    const items = normalizeItems(apiData.items || []);
    if (!items.length) {
      throw new Error("API response has no valid items");
    }
    return {
      status: "ok",
      source: "api",
      fetchedAt: apiData.fetchedAt || new Date().toISOString(),
      items,
      refreshIntervalMs
    };
  } catch (error) {
    const fallback = await buildSampleFallback(refreshIntervalMs, enableSampleFallback);
    const payload = {
      status: "error",
      source: "api",
      message: error?.message || "Failed to fetch usage from API",
      refreshIntervalMs
    };
    if (fallback) {
      payload.fallback = fallback;
    }
    return payload;
  }
};

const resolveOAuthMode = async (refreshIntervalMs, enableSampleFallback) => {
  const providerErrors = [];
  const aggregatedItems = [];
  const [auth, googleAuth, accountData] = await Promise.all([
    loadOpenAIOAuth().catch(() => null),
    loadGoogleOAuth().catch(() => null),
    loadActiveAntigravityAccount().catch(() => null)
  ]);

  const accountInfo = {
    codex: auth ? { email: auth.email, id: auth.chatGptAccountId } : null,
    antigravity: accountData?.account?.email ? { email: accountData.account.email } : null
  };

  if (!auth) {
    providerErrors.push({
      provider: "codex",
      message: "Codex not connected. Click 'Connect Codex'."
    });
  }

  const antigravityAccount = accountData && accountData.account ? accountData.account : null;

  if (!antigravityAccount) {
    providerErrors.push({
      provider: "antigravity",
      message: "Antigravity not connected. Click 'Connect Antigravity'."
    });
  } else if (googleAuth?.access) {
    // Keep lint-friendly reference so we don't treat it as an unused import.
    // OpenCode's google oauth can exist even when Antigravity isn't configured.
  }

  const tasks = [];
  if (auth) {
    tasks.push({ provider: "codex", promise: fetchCodexUsage(auth) });
  }
  if (antigravityAccount) {
    tasks.push({
      provider: "antigravity",
      promise: fetchAntigravityItems(antigravityAccount, {
        clientSecret: process.env.ANTIGRAVITY_CLIENT_SECRET
      })
    });
    tasks.push({
      provider: "gemini-cli",
      promise: fetchGeminiCliItems(antigravityAccount, {
        clientSecret: process.env.ANTIGRAVITY_CLIENT_SECRET
      })
    });
  }

  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const task = tasks[i];
    if (result.status === "fulfilled") {
      const payload = task.provider === "codex" ? mapCodex(result.value) : result.value;
      if (Array.isArray(payload)) {
        aggregatedItems.push(...payload);
      }
    } else {
      providerErrors.push({
        provider: task.provider,
        message: result.reason?.message || "Failed to load usage data"
      });
    }
  }

  const items = normalizeItems(aggregatedItems);
  if (items.length) {
    const response = {
      status: "ok",
      source: "oauth",
      fetchedAt: new Date().toISOString(),
      items,
      refreshIntervalMs,
      accountInfo
    };
    if (providerErrors.length) {
      response.providerErrors = providerErrors;
    }
    return response;
  }

  const fallback = await buildSampleFallback(refreshIntervalMs, enableSampleFallback);
  const errorPayload = {
    status: "error",
    source: "oauth",
    message: "No usage data available from OAuth providers",
    refreshIntervalMs,
    accountInfo
  };
  if (providerErrors.length) {
    errorPayload.providerErrors = providerErrors;
  }
  if (fallback) {
    errorPayload.fallback = fallback;
  }
  return errorPayload;
};

const resolveUsagePayload = async () => {
  const config = await loadConfig();
  const refreshIntervalMs = resolveRefreshInterval(config);
  const enableSampleFallback = resolveSampleFallbackFlag(config);
  const dataMode = resolveDataMode(config);

  let payload;
  if (dataMode === "api") {
    payload = await resolveApiMode(config, refreshIntervalMs, enableSampleFallback);
  } else if (dataMode === "sample") {
    payload = await resolveSampleMode(refreshIntervalMs);
  } else {
    payload = await resolveOAuthMode(refreshIntervalMs, enableSampleFallback);
  }

  if (payload && payload.status === "ok" && Array.isArray(payload.items)) {
    payload.viewData = computeViewData(payload.items);
  } else if (payload && payload.fallback && payload.fallback.status === "ok") {
    payload.fallback.viewData = computeViewData(payload.fallback.items);
  }

  return payload;
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#f2efe8",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

  ipcMain.handle("usage:fetch", () => resolveUsagePayload());

  ipcMain.handle("app:get-constants", async () => {
    let metadata = { agentRoleMap: {}, categoryRoleMap: {} };
    try {
      const metadataPath = path.join(__dirname, "data", "metadata.json");
      metadata = await safeReadJson(metadataPath);
    } catch (err) {
      console.error("Failed to load metadata.json:", err);
    }

    return {
      status: "ok",
      baseAllowedModels: BASE_ALLOWED_MODELS,
      allowedVariants: ALLOWED_VARIANTS,
      agentRoleMap: metadata.agentRoleMap || {},
      categoryRoleMap: metadata.categoryRoleMap || {}
    };
  });

  ipcMain.handle("ohmyopencode:load", async (event, payload) => {

  const requestedPath = typeof payload?.path === "string" ? payload.path.trim() : "";
  const resolvedPath = requestedPath || resolveOhMyOpencodePath();
  try {
    const { data, indent } = await readJsonWithIndent(resolvedPath);
    const opencodeConfig = await loadOpencodeConfig();
    const variantCatalog = mergeVariantCatalog(buildVariantCatalog(opencodeConfig));
    const entries = {
      agents: extractModelEntries("agents", data?.agents),
      categories: extractModelEntries("categories", data?.categories)
    };
    return {
      status: "ok",
      path: resolvedPath,
      data,
      indent,
      entries,
      variantCatalog
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        status: "error",
        code: "parse_error",
        path: resolvedPath,
        message: "JSON parse failed. Remove comments and fix syntax.",
        detail: error.message
      };
    }
    if (error?.code === "ENOENT") {
      return {
        status: "error",
        code: "not_found",
        path: resolvedPath,
        message: "File not found. Check the path or create oh-my-opencode.json.",
        detail: resolvedPath
      };
    }
    if (error?.code === "EACCES") {
      return {
        status: "error",
        code: "permission_denied",
        path: resolvedPath,
        message: "Permission denied. Check file permissions.",
        detail: error.message
      };
    }
    return {
      status: "error",
      code: "read_error",
      path: resolvedPath,
      message: error?.message || "Failed to load config",
      detail: error?.stack || ""
    };
  }
});

ipcMain.handle("ohmyopencode:save", async (event, payload) => {
  const requestedPath = typeof payload?.path === "string" ? payload.path.trim() : "";
  const resolvedPath = requestedPath || resolveOhMyOpencodePath();
  const data = payload?.data;
  const indent = payload?.indent ?? 2;

  if (!data || typeof data !== "object") {
    return {
      status: "error",
      code: "invalid_payload",
      path: resolvedPath,
      message: "Invalid config payload"
    };
  }

  const opencodeConfig = await loadOpencodeConfig();
  const variantCatalog = mergeVariantCatalog(buildVariantCatalog(opencodeConfig));
  const invalid = collectInvalidEntries(data, variantCatalog);
  if (invalid.length) {
    return {
      status: "error",
      code: "invalid_entries",
      path: resolvedPath,
      message: "Invalid model or variant values detected",
      invalid
    };
  }

  try {
    const backupPath = await writeJsonAtomicWithBackup(resolvedPath, data, indent);
    return {
      status: "ok",
      path: resolvedPath,
      backupPath: backupPath || null
    };
  } catch (error) {
    return {
      status: "error",
      code: "write_error",
      path: resolvedPath,
      message: error?.message || "Failed to save config"
    };
  }
});

let antigravityConnectInFlight = null;
ipcMain.handle("antigravity:connect", async () => {
  if (antigravityConnectInFlight) {
    return antigravityConnectInFlight;
  }
  antigravityConnectInFlight = (async () => {
    try {
      const result = await connectAntigravity({
        openExternal: (url) => shell.openExternal(url)
      });
      return { status: "ok", ...result };
    } catch (error) {
      return { status: "error", message: error?.message || "Antigravity connect failed" };
    } finally {
      antigravityConnectInFlight = null;
    }
  })();
  return antigravityConnectInFlight;
});

let codexConnectInFlight = null;
ipcMain.handle("codex:connect", async () => {
  if (codexConnectInFlight) {
    return codexConnectInFlight;
  }
  codexConnectInFlight = (async () => {
    try {
      const result = await connectCodex({
        openExternal: (url) => shell.openExternal(url)
      });
      return { status: "ok", ...result };
    } catch (error) {
      return { status: "error", message: error?.message || "Codex connect failed" };
    } finally {
      codexConnectInFlight = null;
    }
  })();
  return codexConnectInFlight;
});
