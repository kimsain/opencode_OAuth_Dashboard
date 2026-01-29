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
  loading: false
};

const editorState = {
  path: "",
  data: null,
  indent: 2,
  activeTab: "agents",
  filter: "",
  entries: [],
  allowedModels: [
    "opencode/gpt-5-nano",
    "opencode/big-pickle",
    "openai/gpt-5.2-codex",
    "openai/gpt-5.2",
    "openai/gpt-5.1-codex-mini",
    "google/antigravity-gemini-3-pro",
    "google/antigravity-gemini-3-flash"
  ]
};

const agentRoleMap = {
  sisyphus: "Default orchestrator for planning, delegation, and execution.",
  atlas: "Plan executor that delegates to specialists instead of doing everything directly.",
  oracle: "Read-only consultant for architecture, reviews, and debugging.",
  librarian: "External research specialist for docs and OSS examples.",
  explore: "Fast codebase exploration and contextual search agent.",
  "multimodal-looker": "Visual analysis for PDFs, images, and diagrams.",
  prometheus: "Strategic planner that builds detailed execution plans.",
  metis: "Pre-planning consultant for intent and ambiguity checks.",
  momus: "Plan reviewer for clarity, completeness, and verification.",
  "sisyphus-junior": "Dedicated executor focused on completing assigned work without re-delegation."
};

const categoryRoleMap = {
  "visual-engineering": "Frontend and UI/UX implementation and styling.",
  ultrabrain: "Deep reasoning for complex architecture decisions.",
  artistry: "Highly creative and artistic tasks.",
  quick: "Trivial fixes and small single-file changes.",
  "unspecified-low": "Low-effort tasks without a clear category.",
  "unspecified-high": "High-effort tasks without a clear category.",
  writing: "Documentation and technical writing tasks."
};

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

const viewToggle = initSegmented(document.querySelector(".segmented"), (view) => {
  state.view = view;
  renderCards();
});

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
loadConfig();
  }, state.refreshIntervalMs);
  state.countdownTimer = setInterval(updateTimers, 1000);
  updateTimers();
};

const computeViewData = () => {
  if (state.view === "model") {
    const decorated = state.items.map((item) => ({
      ...item,
      title: item.model,
      subtitle: `Category: ${item.category}`,
      models: [item.model]
    }));

    const desiredOrder = [
      // Column 1
      "5-hour usage cap",
      "Weekly usage cap",

      // Column 2
      "GPT-OSS 120B (Medium)",
      "Claude Opus 4.5 (Thinking)",
      "Claude Sonnet 4.5 (Thinking)",
      "Claude Sonnet 4.5",

      // Column 3
      "Gemini 3 Pro (High)",
      "Gemini 3 Pro (Low)",
      "Gemini 3 Flash",
      "tab_flash_lite_preview"
    ];

    const orderIndex = new Map(desiredOrder.map((name, i) => [name.toLowerCase(), i]));
    return decorated
      .slice()
      .sort((a, b) => {
        const ai = orderIndex.get(String(a.title).toLowerCase());
        const bi = orderIndex.get(String(b.title).toLowerCase());
        if (ai !== undefined || bi !== undefined) {
          return (ai ?? 9999) - (bi ?? 9999);
        }
        return String(a.title).localeCompare(String(b.title));
      });
  }

  const grouped = new Map();
  state.items.forEach((item) => {
    // By category: only Antigravity groups; Codex is excluded.
    if (item.category === "codex") {
      return;
    }

    const modelName = String(item.model || "");

    // By category: omit Codex and omit preview-only buckets.
    if (modelName === "tab_flash_lite_preview") {
      return;
    }
    let groupName = "Antigravity Premium";
    if (modelName.startsWith("Gemini 3 Pro")) {
      groupName = "Antigravity Pro";
    } else if (modelName === "Gemini 3 Flash") {
      groupName = "Antigravity Flash";
    }

    const entry = grouped.get(groupName) || {
      category: groupName,
      used: 0,
      limit: 0,
      models: [],
      resetAt: null
    };

    if (!entry.resetAt || (item.resetAt && item.resetAt < entry.resetAt)) {
      entry.resetAt = item.resetAt;
    }

    // For shared quota categories, we don't sum used/limit.
    // Instead, we take the max usage percentage among models.
    entry.used = Math.max(entry.used, item.used);
    entry.limit = 100; // Shared buckets are always 100% based here.
    entry.models.push(item.model);

    grouped.set(groupName, entry);
  });

  return Array.from(grouped.values()).map((entry) => ({
    category: entry.category,
    model: entry.category,
    used: entry.used,
    limit: entry.limit,
    resetAt: entry.resetAt,
    title: entry.category,
    subtitle: `Models: ${entry.models.join(", ")}`,
    models: entry.models
  }));
};

const renderCards = () => {
  const viewData = computeViewData();
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
                         item.category.toLowerCase().includes("antigravity") ? "antigravity" : "";

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

  const take = (title) => {
    const key = String(title || "").toLowerCase();
    const list = pickBuckets.get(key);
    if (!list || list.length === 0) return null;
    return list.shift();
  };

  let index = 0;

  if (state.view === "model") {
    // Row-grouped layout (not column-grouped).
    const row1 = ["5-hour usage cap", "Weekly usage cap"].map(take).filter(Boolean);
    const row2 = [
      "GPT-OSS 120B (Medium)",
      "Claude Opus 4.5 (Thinking)",
      "Claude Sonnet 4.5 (Thinking)",
      "Claude Sonnet 4.5"
    ]
      .map(take)
      .filter(Boolean);
    const row3 = [
      "Gemini 3 Pro (High)",
      "Gemini 3 Pro (Low)",
      "Gemini 3 Flash",
      "tab_flash_lite_preview"
    ]
      .map(take)
      .filter(Boolean);

    const leftovers = [];
    for (const list of pickBuckets.values()) {
      leftovers.push(...list);
    }
    leftovers.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    const rows = [row1, row2, row3];
    if (leftovers.length) rows.push(leftovers);

    const colsForRowIndex = [2, 4, 4];

    html += rows
      .filter((row) => row.length > 0)
      .map((row, rowIndex) => {
        const cols = colsForRowIndex[rowIndex] || 3;
        return `<div class="row" style="--cols:${cols}">${row
          .map((it) => renderCard(it, index++))
          .join("")}</div>`;
      })
      .join("");

    cardsEl.innerHTML = html;
    return;
  }

  // Category view: 3 big rows (one card per row), fixed order
  const rows = ["Antigravity Premium", "Antigravity Pro", "Antigravity Flash"]
    .map((title) => take(title))
    .filter(Boolean)
    .map((item) => [item]);

  html += rows
    .map((row) => `<div class="row row-wide" style="--cols:1">${row
      .map((it) => renderCard(it, index++))
      .join("")}</div>`)
    .join("");
  cardsEl.innerHTML = html;
};

const applyPayload = (payload, message) => {
  state.items = payload.items || [];
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
  renderCards();
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
    applyPayload(payload);
  } else if (payload.fallback) {
    // Preserve providerErrors from top-level payload if available
    const fallbackData = {
      ...payload.fallback,
      providerErrors: payload.providerErrors || []
    };
    applyPayload(fallbackData, payload.message);
  } else {
    // Error with no fallback - render empty state with errors
    const errorData = {
      items: [],
      source: "none",
      providerErrors: payload.providerErrors || []
    };
    applyPayload(errorData, payload.message || "Unable to load usage data");
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
        invalid: entry.invalid,
        path: entry.path,
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
        invalid: entry.invalid,
        path: entry.path,
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

const renderEditorList = () => {
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
    .map((entry) => {
      const isReadOnly = !entry.hasModel || entry.invalid;
      const isUnsupported = entry.hasModel && !editorState.allowedModels.includes(entry.model || "");
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
        const label = entry.model ? `Unsupported (${entry.model})` : "Unsupported model";
        optionsHtml = `<option value="${entry.model || ""}" selected disabled>${label}</option>` + optionsHtml;
      }

      if (isReadOnly) {
        optionsHtml = `<option value="" selected disabled>model 없음</option>`;
      }

      return `
      <div class="editor-item">
        <div class="item-info">
          <div class="item-name">${escapeHtml(entry.name)}</div>
          ${metaLine ? `<div class="item-role">${escapeHtml(metaLine)}</div>` : ""}
        </div>
        <div class="item-select-wrapper">
          <select class="item-model-select" data-id="${entry.id}" data-type="${entry.type}" ${isReadOnly ? "disabled" : ""}>
            ${optionsHtml}
          </select>
        </div>
      </div>
    `;
    })
    .join("");

  editorListEl.querySelectorAll(".item-model-select").forEach((select) => {
    select.addEventListener("change", (e) => {
      const id = e.target.dataset.id;
      const type = e.target.dataset.type;
      const newModel = e.target.value;
      updateModel(id, type, newModel);
    });
  });
};

const updateModel = (id, type, newModel) => {
  if (!editorState.data) return;

  const entry = editorState.entries.find((e) => e.id === id && e.type === type);
  if (entry) {
    entry.model = newModel;
    setValueAtPath(editorState.data, entry.path, newModel);
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
    renderEditorList();
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

const applyBulkReplace = () => {
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
  renderEditorList();
};

const editorTabs = initSegmented(document.getElementById("editor-tabs"), (tab) => {
  editorState.activeTab = tab;
  renderEditorList();
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
editorFilterInput.addEventListener("input", (e) => {
  editorState.filter = e.target.value;
  renderEditorList();
});
bulkApplyBtn.addEventListener("click", applyBulkReplace);

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

// Auto load on start
setTimeout(loadConfig, 500);

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

// Ensure slider is in right position on load
window.addEventListener("resize", viewToggle.updateSlider);
setTimeout(viewToggle.updateSlider, 100);

loadUsage(false);
loadConfig();
