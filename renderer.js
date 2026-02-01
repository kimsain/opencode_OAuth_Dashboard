const refreshBtn = document.getElementById("refresh-btn");
const connectCodexBtn = document.getElementById("connect-codex-btn");
const connectAntigravityBtn = document.getElementById("connect-antigravity-btn");
const codexAccountEl = document.getElementById("codex-account");
const antigravityAccountEl = document.getElementById("antigravity-account");
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status-message");
const lastUpdatedEl = document.getElementById("last-updated");
const nextRefreshEl = document.getElementById("next-refresh");
const themeToggleBtn = document.getElementById("theme-toggle");

const state = {
  view: "model",
  items: [],
  source: "sample",
  providerErrors: [],
  lastUpdated: null,
  refreshIntervalMs: 60_000,
  nextRefreshAt: null,
  refreshTimer: null,
  countdownTimer: null,
  loading: false,
  viewData: { model: [], category: [] }
};

const editorState = {
  path: "",
  data: null,
  indent: 2,
  activeTab: "agents",
  filter: "",
  entries: [],
  variantCatalog: {},
  allowedModels: [],
  allowedVariants: []
};

let agentRoleMap = {};
let categoryRoleMap = {};

const connectState = {
  codexConnecting: false,
  antigravityConnecting: false
};

const initSegmented = (container, onSelect) => {
  const segments = container.querySelectorAll(".segment");
  const slider = container.querySelector(".selection-slider");

  const updateSlider = () => {
    const activeSegment = container.querySelector(".segment.active");
    if (activeSegment && slider) {
      const index = Array.from(segments).indexOf(activeSegment);
      const width = activeSegment.getBoundingClientRect().width;
      slider.style.width = `${width}px`;
      slider.style.transform = `translateX(${index * width}px)`;
    }
  };

  segments.forEach((segment) => {
    segment.addEventListener("click", () => {
      segments.forEach((btn) => {
        btn.classList.remove("active");
        btn.setAttribute("aria-selected", "false");
      });
      segment.classList.add("active");
      segment.setAttribute("aria-selected", "true");
      updateSlider();
      if (onSelect) onSelect(segment.dataset.view || segment.dataset.tab);
    });
  });

  window.addEventListener("resize", updateSlider);
  setTimeout(updateSlider, 100);
  return { updateSlider };
};

const setAccountInfo = (accountInfo) => {
  if (codexAccountEl) {
    codexAccountEl.textContent = accountInfo?.codex?.email || accountInfo?.codex?.id || "--";
  }
  if (antigravityAccountEl) {
    antigravityAccountEl.textContent = accountInfo?.antigravity?.email || "--";
  }
};

const formatter = new Intl.NumberFormat("en-US");

const escapeHtml = (value) => {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
};

const formatNumber = (value) => {
  if (!Number.isFinite(value)) return "-";
  return formatter.format(value);
};

const formatTime = (iso) => {
  if (!iso) return "--";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
};

const formatDuration = (ms) => {
  if (!Number.isFinite(ms)) return "--";
  if (ms <= 0) return "Resetting now";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
};

const setStatus = (message, isError = true) => {
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "var(--warn)" : "var(--success)";
};

const updateTimers = () => {
  if (!state.nextRefreshAt) {
    nextRefreshEl.textContent = "Next refresh in --:--";
    return;
  }
  const msLeft = state.nextRefreshAt - Date.now();
  const label = formatDuration(msLeft);
  nextRefreshEl.textContent = `Next refresh in ${label}`;
};

const scheduleAutoRefresh = () => {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }
  if (state.countdownTimer) {
    clearInterval(state.countdownTimer);
  }

  state.nextRefreshAt = Date.now() + state.refreshIntervalMs;
  state.refreshTimer = setInterval(() => {
    loadUsage(false);
  }, state.refreshIntervalMs);
  state.countdownTimer = setInterval(updateTimers, 1000);
  updateTimers();
};



const renderCards = async () => {
  const currentCards = cardsEl.querySelectorAll(".card");
  if (currentCards.length > 0) {
    currentCards.forEach((card, i) => {
      card.classList.add("exiting");
      card.style.animationDelay = `${i * 40}ms`;
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  const viewData = state.viewData.model || [];
  let html = "";

  // Render Provider Errors Banner
  if (state.providerErrors && state.providerErrors.length > 0) {
    html += `
      <div class="error-banner">
        <strong>Provider Errors Detected</strong>
        <ul class="error-list">
          ${state.providerErrors
            .map((err) => {
              const text =
                typeof err === "object" && err !== null
                  ? `${err.provider || "provider"}: ${
                      err.message || "Unknown error"
                    }`
                  : String(err);
              return `<li>${escapeHtml(text)}</li>`;
            })
            .join("")}
        </ul>
      </div>
    `;
  }

  if (!viewData.length) {
    html += `
      <div class="empty-state">
        <h3>No Quota Data Available</h3>
        <p>
          We couldn't retrieve usage details. This usually means OAuth credentials are missing, invalid, or expired.
          Please check your provider configuration in the main process.
        </p>
      </div>
    `;
    cardsEl.innerHTML = html;
    return;
  }

  const now = Date.now();

  const renderCard = (item, index) => {
      const isPercent = item.unit === "percent" || item.limit === 100;
      const remaining = Math.max(item.limit - item.used, 0);
      const percent = item.limit
        ? Math.min((item.used / item.limit) * 100, 100)
        : 0;
      const resetIn = item.resetAt
        ? new Date(item.resetAt).getTime() - now
        : NaN;

      const remainingPercent = 100 - percent;
      let healthClass = "health-warn";
      if (remainingPercent >= 80) healthClass = "health-safe";
      else if (remainingPercent < 30) healthClass = "health-danger";

      const brandClass = item.category.toLowerCase().includes("codex") ? "codex" : 
                         item.category.toLowerCase().includes("antigravity") || item.category.toLowerCase().includes("gemini") ? "antigravity" : "";

      let statsHtml;
      if (isPercent) {
        statsHtml = `
          <div class="stats">
            <div class="stat"><strong>${Math.round(
              remainingPercent
            )}%</strong> remaining</div>
            <div class="stat"><strong>${Math.round(percent)}%</strong> used</div>
          </div>
          <div class="stats">
             <div class="reset" style="margin-left: auto;">Reset in ${formatDuration(
               resetIn
             )}</div>
          </div>
        `;
      } else {
        statsHtml = `
          <div class="stats">
            <div class="stat"><strong>${formatNumber(
              remaining
            )}</strong> remaining</div>
            <div class="stat"><strong>${formatNumber(
              item.used
            )}</strong> used</div>
          </div>
          <div class="stats">
            <div class="stat">Limit: ${formatNumber(item.limit)}</div>
            <div class="reset">Reset in ${formatDuration(resetIn)}</div>
          </div>
        `;
      }

      return `
        <article class="card ${brandClass}" style="--index:${index}">
          <div class="card-header">
            <div>
              <h3 class="card-title">${escapeHtml(item.title)}</h3>
              <p class="card-subtitle">${escapeHtml(item.subtitle)}</p>
            </div>
          </div>
          <div class="progress">
             <div class="progress-fill ${healthClass}" style="width:${Math.max(0, remainingPercent).toFixed(1)}%">
               ${remainingPercent > 20 ? Math.round(remainingPercent) + '%' : ''}
             </div>
          </div>
          ${statsHtml}
        </article>
      `;
  };

  const pickBuckets = new Map();
  viewData.forEach((item) => {
    const key = String(item.title || "").toLowerCase();
    const list = pickBuckets.get(key) || [];
    list.push(item);
    pickBuckets.set(key, list);
  });

  let index = 0;

  // Group items by category for cleaner layout
  const codexItems = [];
  const googleItems = []; // Combined Antigravity + Google
  const others = [];

  // Flatten pickBuckets to get all items
  const allItems = [];
  for (const list of pickBuckets.values()) {
    allItems.push(...list);
  }
  
  // Define models that should be labeled as "google" category
  const googleCategoryModels = new Set([
    "Gemini 2.5 Flash",
    "Gemini 2.5 Flash (Thinking)",
    "Gemini 2.5 Flash Lite",
    "Gemini 2.5 Pro"
  ]);

  allItems.forEach(item => {
    let cat = (item.category || "").toLowerCase();
    
    // 1. Skip Gemini CLI entirely
    if (cat.includes("gemini-cli")) {
      return; 
    }

    // 2. Rename category for specific models
    // Check exact model name match or partial match if needed. 
    // The user list was specific, so we check exact title first.
    if (googleCategoryModels.has(item.title)) {
      item.category = "google";
      cat = "google";
      // Also update subtitle to reflect change
      item.subtitle = `Category: google`; 
    }

    if (cat.includes("codex")) {
      codexItems.push(item);
    } else if (cat.includes("antigravity") || cat.includes("google")) {
      googleItems.push(item);
    } else {
      others.push(item);
    }
  });

  // Helper to sort items
  const sortGoogleItems = (items) => {
    return items.sort((a, b) => {
      // 3. GPT-OSS 120B (Medium) first
      const aGptOss = a.title.includes("GPT-OSS 120B (Medium)");
      const bGptOss = b.title.includes("GPT-OSS 120B (Medium)");
      if (aGptOss && !bGptOss) return -1;
      if (!aGptOss && bGptOss) return 1;

      // Caps first
      const aCap = a.title.toLowerCase().includes("cap");
      const bCap = b.title.toLowerCase().includes("cap");
      if (aCap && !bCap) return -1;
      if (!aCap && bCap) return 1;

      return String(a.title).localeCompare(String(b.title));
    });
  };
  
  const sortGeneric = (items) => {
      return items.sort((a, b) => {
      const aCap = a.title.toLowerCase().includes("cap");
      const bCap = b.title.toLowerCase().includes("cap");
      if (aCap && !bCap) return -1;
      if (!aCap && bCap) return 1;
      return String(a.title).localeCompare(String(b.title));
    });
  }

  const renderSection = (title, items, sortFn) => {
    if (!items.length) return "";
    const sorted = sortFn ? sortFn(items) : sortGeneric(items);
    const cols = Math.min(items.length, 4); // Max 4 cols
    return `
      ${title ? `<h3 class="section-header">${title}</h3>` : ""}
      <div class="row" style="--cols:${cols}">
        ${sorted.map((it) => renderCard(it, index++)).join("")}
      </div>
    `;
  };

  html += renderSection("OpenAI / Codex", codexItems);
  html += renderSection("Google Antigravity", googleItems, sortGoogleItems);
  html += renderSection("Others", others);

  cardsEl.innerHTML = html;
};

const applyPayload = async (payload, message) => {
  state.items = payload.items || [];
  state.viewData = payload.viewData || { model: [], category: [] };
  state.source = payload.source || "sample";
  state.providerErrors = payload.providerErrors || [];
  setAccountInfo(payload.accountInfo);
  state.lastUpdated = payload.fetchedAt || new Date().toISOString();
  state.refreshIntervalMs = payload.refreshIntervalMs || 60_000;
  lastUpdatedEl.textContent = `Last updated: ${formatTime(state.lastUpdated)}`;
  if (message) {
    setStatus(message, true);
  } else {
    setStatus("", false);
  }
  await renderCards();
  scheduleAutoRefresh();
};

const loadUsage = async (manual) => {
  if (state.loading) return;
  state.loading = true;
  refreshBtn.disabled = true;
  if (connectCodexBtn) {
    connectCodexBtn.disabled = true;
  }
  if (connectAntigravityBtn) {
    connectAntigravityBtn.disabled = true;
  }
  
  if (manual) {
    refreshBtn.classList.add("spinning");
    document.querySelectorAll(".card").forEach((card) => {
      card.classList.add("refreshing");
    });
  }

  const payload = await window.usageApi.fetchUsage();

  if (payload.status === "ok") {
    await applyPayload(payload);
  } else if (payload.fallback) {
    // Preserve providerErrors from top-level payload if available
    const fallbackData = {
      ...payload.fallback,
      providerErrors: payload.providerErrors || []
    };
    await applyPayload(fallbackData, payload.message);
  } else {
    // Error with no fallback - render empty state with errors
    const errorData = {
      items: [],
      source: "none",
      providerErrors: payload.providerErrors || []
    };
    await applyPayload(errorData, payload.message || "Unable to load usage data");
  }

  state.loading = false;
  refreshBtn.disabled = false;
  refreshBtn.classList.remove("spinning");
  // Shimmer will be removed automatically as cards are re-rendered by renderCards() via applyPayload()
  
  if (connectCodexBtn && !connectState.codexConnecting) {
    connectCodexBtn.disabled = false;
  }
  if (connectAntigravityBtn && !connectState.antigravityConnecting) {
    connectAntigravityBtn.disabled = false;
  }
};

const connectCodex = async () => {
  if (!connectCodexBtn || connectState.codexConnecting) return;
  connectState.codexConnecting = true;
  connectCodexBtn.disabled = true;
  refreshBtn.disabled = true;
  if (connectAntigravityBtn) connectAntigravityBtn.disabled = true;
  const originalText = connectCodexBtn.textContent;
  connectCodexBtn.textContent = "Connecting...";
  setStatus("Complete the login in your browser...", false);
  try {
    const result = await window.usageApi.connectCodex();
    if (result?.status !== "ok") {
      setStatus(result?.message || "Codex connect failed", true);
      return;
    }
    setStatus("Codex connected. Refreshing...", false);
    await loadUsage(true);
  } finally {
    connectState.codexConnecting = false;
    refreshBtn.disabled = false;
    if (connectAntigravityBtn && !connectState.antigravityConnecting) {
      connectAntigravityBtn.disabled = false;
    }
    connectCodexBtn.disabled = false;
    connectCodexBtn.textContent = originalText || "Connect Codex";
  }
};

const connectAntigravity = async () => {
  if (!connectAntigravityBtn || connectState.antigravityConnecting) return;
  connectState.antigravityConnecting = true;
  connectAntigravityBtn.disabled = true;
  refreshBtn.disabled = true;
  const originalText = connectAntigravityBtn.textContent;
  connectAntigravityBtn.textContent = "Connecting...";
  setStatus("Complete the login in your browser...", false);
  try {
    const result = await window.usageApi.connectAntigravity();
    if (result?.status !== "ok") {
      setStatus(result?.message || "Antigravity connect failed", true);
      return;
    }
    setStatus("Antigravity connected. Refreshing...", false);
    await loadUsage(true);
  } finally {
    connectState.antigravityConnecting = false;
    refreshBtn.disabled = false;
    connectAntigravityBtn.disabled = false;
    connectAntigravityBtn.textContent = originalText || "Connect Antigravity";
  }
};

const configPathInput = document.getElementById("config-path");
const loadConfigBtn = document.getElementById("load-config-btn");
const saveConfigBtn = document.getElementById("save-config-btn");
const changePathBtn = document.getElementById("change-path-btn");
const cancelPathBtn = document.getElementById("cancel-path-btn");
const pathDisplayEl = document.getElementById("path-display");
const pathEditEl = document.getElementById("path-edit");
const pathLabelEl = document.getElementById("path-label");
const editorListEl = document.getElementById("editor-list");
const editorStatusEl = document.getElementById("editor-status");
const editorFilterInput = document.getElementById("editor-filter");
const bulkSourceSelect = document.getElementById("bulk-source-model");
const bulkTargetSelect = document.getElementById("bulk-target-model");
const bulkScopeSelect = document.getElementById("bulk-scope");
const bulkApplyBtn = document.getElementById("bulk-apply-btn");
const bulkToastEl = document.getElementById("bulk-toast");
let bulkToastTimer = null;

// Modal Elements
const jsonModal = document.getElementById("json-modal");
const jsonEditorTextarea = document.getElementById("json-editor-textarea");
const jsonErrorEl = document.getElementById("json-error");
const modalTitle = document.getElementById("modal-title");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalCancelBtn = document.getElementById("modal-cancel-btn");
const modalSaveBtn = document.getElementById("modal-save-btn");

let currentEditingId = null;
let currentEditingType = null;

const getValueAtPath = (obj, path) => {
  if (!obj || !Array.isArray(path)) return undefined;
  let cursor = obj;
  for (const key of path) {
    if (cursor == null) return undefined;
    cursor = cursor[key];
  }
  return cursor;
};

const openJsonEditor = (id, type) => {
  const entry = editorState.entries.find((e) => e.id === id && e.type === type);
  if (!entry) return;

  // Use objectPath if available (from new backend), fallback to parent of path for robustness
  // But strictly, we expect objectPath now.
  const targetPath = entry.objectPath || (entry.path ? entry.path.slice(0, -1) : null);
  
  const data = getValueAtPath(editorState.data, targetPath);
  if (data === undefined) {
    setEditorStatus("Error: Could not find data for this item", true);
    return;
  }

  currentEditingId = id;
  currentEditingType = type;
  
  modalTitle.textContent = `Edit ${entry.name}`;
  jsonEditorTextarea.value = JSON.stringify(data, null, editorState.indent);
  jsonErrorEl.classList.add("hidden");
  
  jsonModal.classList.remove("hidden");
  // Small delay to allow display:block to apply before opacity transition
  requestAnimationFrame(() => {
    jsonModal.classList.add("visible");
    jsonEditorTextarea.focus();
  });
};

const closeJsonEditor = () => {
  jsonModal.classList.remove("visible");
  setTimeout(() => {
    jsonModal.classList.add("hidden");
    currentEditingId = null;
    currentEditingType = null;
    jsonEditorTextarea.value = "";
  }, 300); // Match transition duration
};

const saveJsonEditor = async () => {
  try {
    const raw = jsonEditorTextarea.value;
    const parsed = JSON.parse(raw);
    
    const entry = editorState.entries.find((e) => e.id === currentEditingId && e.type === currentEditingType);
    if (!entry) throw new Error("Item not found");

    const targetPath = entry.objectPath || (entry.path ? entry.path.slice(0, -1) : null);

    // Update the main data object
    setValueAtPath(editorState.data, targetPath, parsed);
    
    // If the model changed in the JSON, update the entry's model property too so the list reflects it
    // We might need to re-scan or at least check if 'model' key exists in the new object
    if (parsed && typeof parsed === 'object') {
       // This is a simplification; ideally we'd re-run buildEntries logic for this item
       // But for now, let's just assume we want to refresh the UI
       // Update entry model if it exists in the new JSON
       if (parsed.model) entry.model = parsed.model;
       if (parsed.variant) entry.variant = parsed.variant;
    }

    closeJsonEditor();
    await renderEditorList(false); // Refresh list to show changes
    saveConfigBtn.disabled = false; // Enable global save
    setEditorStatus("Item updated. Click Save to persist.", false);
    
  } catch (e) {
    jsonErrorEl.textContent = "Invalid JSON: " + e.message;
    jsonErrorEl.classList.remove("hidden");
  }
};

// Modal Event Listeners
modalCloseBtn.addEventListener("click", closeJsonEditor);
modalCancelBtn.addEventListener("click", closeJsonEditor);
modalSaveBtn.addEventListener("click", saveJsonEditor);
jsonModal.addEventListener("click", (e) => {
  if (e.target === jsonModal) closeJsonEditor();
});
jsonEditorTextarea.addEventListener("input", () => {
  jsonErrorEl.classList.add("hidden");
});

const setEditorStatus = (message, isError = true) => {
  editorStatusEl.textContent = message || "";
  editorStatusEl.style.color = isError ? "var(--warn)" : "var(--success)";
};

const togglePathEdit = (showEdit) => {
  if (showEdit) {
    pathDisplayEl.classList.add("hidden");
    pathEditEl.classList.remove("hidden");
    configPathInput.focus();
  } else {
    pathEditEl.classList.add("hidden");
    pathDisplayEl.classList.remove("hidden");
  }
};

const showBulkToast = (message) => {
  if (!bulkToastEl) return;
  bulkToastEl.textContent = message;
  bulkToastEl.classList.add("visible");
  if (bulkToastTimer) {
    clearTimeout(bulkToastTimer);
  }
  bulkToastTimer = setTimeout(() => {
    bulkToastEl.classList.remove("visible");
  }, 2200);
};

const buildEntries = (entries) => {
  const list = [];
  if (entries?.agents) {
    entries.agents.forEach((entry) => {
      list.push({
        type: "agents",
        id: entry.key,
        name: entry.label,
        model: entry.model,
        hasModel: entry.hasModel,
        variant: entry.variant,
        hasVariant: entry.hasVariant,
        invalid: entry.invalid,
        path: entry.path,
        variantPath: entry.variantPath,
        objectPath: entry.objectPath,
        role: agentRoleMap[String(entry.key).toLowerCase()] || null
      });
    });
  }
  if (entries?.categories) {
    entries.categories.forEach((entry) => {
      list.push({
        type: "categories",
        id: entry.key,
        name: entry.label,
        model: entry.model,
        hasModel: entry.hasModel,
        variant: entry.variant,
        hasVariant: entry.hasVariant,
        invalid: entry.invalid,
        path: entry.path,
        variantPath: entry.variantPath,
        objectPath: entry.objectPath,
        role: categoryRoleMap[String(entry.key).toLowerCase()] || null
      });
    });
  }
  return list;
};

const setValueAtPath = (obj, path, value) => {
  if (!obj || !Array.isArray(path)) return;
  let cursor = obj;
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i];
    if (cursor == null) return;
    cursor = cursor[key];
  }
  const lastKey = path[path.length - 1];
  if (cursor != null) {
    cursor[lastKey] = value;
  }
};

const getAllowedVariantsForModel = (model) => {
  if (!model) return [];
  const catalog = editorState.variantCatalog || {};
  const variants = catalog[model];
  return Array.isArray(variants) ? variants : [];
};

const renderEditorList = async (animate = false) => {
  editorListEl.classList.toggle("editor-list--animate", animate);
  const currentItems = editorListEl.querySelectorAll(".editor-item");
  if (animate && currentItems.length > 0) {
    currentItems.forEach((item, i) => {
      item.classList.add("exiting");
      item.style.animationDelay = `${i * 20}ms`;
    });

    setTimeout(() => {
      editorListEl.classList.remove("editor-list--animate");
    }, 2000);

    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  const filter = editorState.filter.toLowerCase();
  const filtered = editorState.entries.filter((entry) => {
    if (entry.type !== editorState.activeTab) return false;
    if (filter && !entry.name.toLowerCase().includes(filter)) return false;
    return true;
  });

  if (filtered.length === 0) {
    editorListEl.innerHTML = `
      <div class="empty-state editor-empty">
        <h3>${editorState.data ? "No matches" : "Configuration not loaded"}</h3>
        <p>${editorState.data ? "Try a different filter." : "Load a configuration file to start editing."}</p>
      </div>
    `;
    return;
  }

  editorListEl.innerHTML = filtered
    .map((entry, index) => {
      const isReadOnly = !entry.hasModel || entry.invalid;
      const isUnsupported = entry.hasModel && !editorState.allowedModels.includes(entry.model || "");
      const modelVariants = getAllowedVariantsForModel(entry.model);
      const allowedVariants = modelVariants.length ? modelVariants : editorState.allowedVariants;
      const isVariantUnsupported = entry.hasVariant && !allowedVariants.includes(entry.variant || "");
      
      const metaParts = [];
      if (entry.role) {
        metaParts.push(entry.role);
      } else if (entry.id && entry.id !== entry.name) {
        metaParts.push(entry.id);
      }
      if (entry.invalid) {
        metaParts.push("Unsupported structure");
      }
      const metaLine = metaParts.length ? metaParts.join(" · ") : "";

      let optionsHtml = editorState.allowedModels
        .map(
          (m) => `<option value="${m}" ${m === entry.model ? "selected" : ""}>${m}</option>`
        )
        .join("");

      if (isUnsupported) {
        const label = entry.model ? `Unsupported (${escapeHtml(entry.model)})` : "Unsupported model";
        optionsHtml = `<option value="${escapeHtml(entry.model || "")}" selected disabled>${label}</option>` + optionsHtml;
      }

      let variantOptionsHtml = allowedVariants
        .map(
          (v) => `<option value="${v}" ${v === entry.variant ? "selected" : ""}>${v}</option>`
        )
        .join("");

      if (isVariantUnsupported) {
        const label = entry.variant ? `Unsupported (${escapeHtml(entry.variant)})` : "Unsupported variant";
        variantOptionsHtml = `<option value="${escapeHtml(entry.variant || "")}" selected disabled>${label}</option>` + variantOptionsHtml;
      }

      const style = animate ? `style="--index:${index}"` : "";

      return `
      <div class="editor-item ${entry.type}" ${style} data-id="${entry.id}" data-type="${entry.type}">
        <div class="item-info">
          <div class="item-name">${escapeHtml(entry.name)}</div>
          ${metaLine ? `<div class="item-role">${escapeHtml(metaLine)}</div>` : ""}
        </div>
        <div class="item-selectors">
          <div class="item-select-wrapper model">
            <select class="item-model-select" data-id="${entry.id}" data-type="${entry.type}" ${isReadOnly ? "disabled" : ""}>
              ${optionsHtml}
            </select>
          </div>
          <div class="item-select-wrapper variant">
            <select class="item-variant-select" data-id="${entry.id}" data-type="${entry.type}" ${isReadOnly ? "disabled" : ""}>
              ${variantOptionsHtml}
            </select>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
  
  // Add click listeners to items for JSON editing
  editorListEl.querySelectorAll(".editor-item").forEach(item => {
    item.addEventListener("click", (e) => {
      // Don't trigger if clicking select boxes
      if (e.target.closest("select")) return;
      
      const id = item.dataset.id;
      const type = item.dataset.type;
      openJsonEditor(id, type);
    });
  });

  editorListEl.querySelectorAll(".item-model-select").forEach(select => {
    select.addEventListener("change", async (e) => {
      await updateModel(e.target.dataset.id, e.target.dataset.type, e.target.value);
    });
  });

  editorListEl.querySelectorAll(".item-variant-select").forEach(select => {
    select.addEventListener("change", async (e) => {
      await updateVariant(e.target.dataset.id, e.target.dataset.type, e.target.value);
    });
  });
};

const updateModel = async (id, type, newModel) => {
  if (!editorState.data) return;

  const entry = editorState.entries.find((e) => e.id === id && e.type === type);
  if (entry) {
    entry.model = newModel;
    setValueAtPath(editorState.data, entry.path, newModel);
    await renderEditorList(false);
  }
};

const updateVariant = async (id, type, newVariant) => {
  if (!editorState.data) return;

  const entry = editorState.entries.find((e) => e.id === id && e.type === type);
  if (entry) {
    entry.variant = newVariant;
    setValueAtPath(editorState.data, entry.variantPath, newVariant);
    await renderEditorList(false);
  }
};

const loadConfig = async () => {
  const path = configPathInput.value.trim();
  loadConfigBtn.disabled = true;
  setEditorStatus("Loading...", false);

  try {
    const res = await window.usageApi.loadOhMyOpencode(path || "");
    if (res.status !== "ok") {
      setEditorStatus(res.message || "Failed to load config");
      if (pathLabelEl && !pathEditEl.classList.contains("hidden")) {
        // Stay in edit mode if manual load failed
      } else if (pathLabelEl) {
        pathLabelEl.textContent = "Configuration not found (auto-detect failed)";
      }
      return;
    }

    editorState.path = res.path;
    editorState.data = res.data;
    editorState.indent = res.indent || 2;
    editorState.entries = buildEntries(res.entries);
    editorState.variantCatalog = res.variantCatalog || {};
    if (configPathInput) {
      configPathInput.value = res.path || path;
    }
    if (pathLabelEl) {
      pathLabelEl.textContent = res.path || "Loaded from default path";
      pathLabelEl.title = res.path || "";
    }
    if (bulkToastEl) {
      bulkToastEl.textContent = "";
      bulkToastEl.classList.remove("visible");
    }
    
    saveConfigBtn.disabled = false;
    setEditorStatus("Loaded successfully", false);
    await renderEditorList(false);
  } catch (err) {
    setEditorStatus("Error: " + err.message);
    if (pathLabelEl) {
      pathLabelEl.textContent = "Load failed. Click Change to edit path.";
    }
  } finally {
    loadConfigBtn.disabled = false;
  }
};

const saveConfig = async () => {
  if (!editorState.data || !editorState.path) return;

  saveConfigBtn.disabled = true;
  setEditorStatus("Saving...", false);

  try {
    const res = await window.usageApi.saveOhMyOpencode({
      path: editorState.path,
      data: editorState.data,
      indent: editorState.indent
    });

    if (res.status !== "ok") {
      setEditorStatus(res.message || "Failed to save config");
      return;
    }

    setEditorStatus(`Saved successfully${res.backupPath ? " (Backup created)" : ""}`, false);
  } catch (err) {
    setEditorStatus("Error: " + err.message);
  } finally {
    saveConfigBtn.disabled = false;
  }
};

const applyBulkReplace = async () => {
  const sourceModel = bulkSourceSelect.value;
  const targetModel = bulkTargetSelect.value;
  const scope = bulkScopeSelect.value;
  if (!sourceModel || !targetModel || !editorState.data) return;
  if (sourceModel === targetModel) {
    setEditorStatus("Source and target models are the same", true);
    return;
  }

  const candidates = editorState.entries.filter((entry) => {
    if (scope !== "both" && entry.type !== scope) return false;
    if (!entry.hasModel || entry.invalid) return false;
    return entry.model === sourceModel;
  });

  candidates.forEach((entry) => {
    entry.model = targetModel;
    setValueAtPath(editorState.data, entry.path, targetModel);
  });

  const total = candidates.length;
  const changed = candidates.length;
  showBulkToast(`총 ${total}개 중 ${changed}개 변경됨`);
  setEditorStatus("", false);
  await renderEditorList(false);
};

const editorTabs = initSegmented(document.getElementById("editor-tabs"), async (tab) => {
  editorState.activeTab = tab;
  await renderEditorList(true);
});

if (changePathBtn) {
  changePathBtn.addEventListener("click", () => togglePathEdit(true));
}
if (cancelPathBtn) {
  cancelPathBtn.addEventListener("click", () => togglePathEdit(false));
}

loadConfigBtn.addEventListener("click", async () => {
  togglePathEdit(false);
  await loadConfig();
});
saveConfigBtn.addEventListener("click", saveConfig);
editorFilterInput.addEventListener("input", async (e) => {
  editorState.filter = e.target.value;
  await renderEditorList(false);
});
bulkApplyBtn.addEventListener("click", applyBulkReplace);

const populateBulkDropdowns = () => {
  bulkSourceSelect.innerHTML = "";
  bulkTargetSelect.innerHTML = "";

  editorState.allowedModels.forEach((m) => {
    const sourceOpt = document.createElement("option");
    sourceOpt.value = m;
    sourceOpt.textContent = m;
    bulkSourceSelect.appendChild(sourceOpt);

    const targetOpt = document.createElement("option");
    targetOpt.value = m;
    targetOpt.textContent = m;
    bulkTargetSelect.appendChild(targetOpt);
  });
};

const initAppConstants = async () => {
  try {
    const res = await window.usageApi.getConstants();
    if (res.status === "ok") {
      editorState.allowedModels = res.baseAllowedModels;
      editorState.allowedVariants = res.allowedVariants;
      agentRoleMap = res.agentRoleMap || {};
      categoryRoleMap = res.categoryRoleMap || {};
      populateBulkDropdowns();
    }
  } catch (err) {
    console.error("Failed to fetch app constants:", err);
  }
};

// Auto load on start
initAppConstants().then(() => {
  setTimeout(loadConfig, 500);
});

// Theme management
const initTheme = () => {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
  } else if (savedTheme === "light") {
    document.body.classList.add("light");
  }
};

const toggleTheme = () => {
  if (document.body.classList.contains("dark")) {
    document.body.classList.remove("dark");
    document.body.classList.add("light");
    localStorage.setItem("theme", "light");
  } else if (document.body.classList.contains("light")) {
    document.body.classList.remove("light");
    document.body.classList.add("dark");
    localStorage.setItem("theme", "dark");
  } else {
    // Current is system default
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (isDark) {
      document.body.classList.add("light");
      localStorage.setItem("theme", "light");
    } else {
      document.body.classList.add("dark");
      localStorage.setItem("theme", "dark");
    }
  }
};

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", toggleTheme);
}

initTheme();

refreshBtn.addEventListener("click", () => {
  state.nextRefreshAt = Date.now() + state.refreshIntervalMs;
  loadUsage(true);
});

if (connectAntigravityBtn) {
  connectAntigravityBtn.addEventListener("click", () => {
    connectAntigravity();
  });
}

if (connectCodexBtn) {
  connectCodexBtn.addEventListener("click", () => {
    connectCodex();
  });
}

loadUsage(false);
loadConfig();
