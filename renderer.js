const refreshBtn = document.getElementById("refresh-btn");
const connectCodexBtn = document.getElementById("connect-codex-btn");
const connectAntigravityBtn = document.getElementById("connect-antigravity-btn");
const codexAccountEl = document.getElementById("codex-account");
const antigravityAccountEl = document.getElementById("antigravity-account");
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status-message");
const lastUpdatedEl = document.getElementById("last-updated");
const nextRefreshEl = document.getElementById("next-refresh");
const segments = document.querySelectorAll(".segment");
const slider = document.querySelector(".selection-slider");
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

const connectState = {
  codexConnecting: false,
  antigravityConnecting: false
};

const updateSlider = () => {
  if (!slider || segments.length === 0) return;
  const activeSegment = document.querySelector(".segment.active");
  if (activeSegment) {
    const index = Array.from(segments).indexOf(activeSegment);
    // Use the actual width of the segment to ensure pixel-perfect sync
    const width = activeSegment.getBoundingClientRect().width;
    slider.style.width = `${width}px`;
    slider.style.transform = `translateX(${index * width}px)`;
  }
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
    // Add shimmer class to all existing cards during manual refresh
    document.querySelectorAll('.card').forEach(card => card.classList.add('refreshing'));
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

segments.forEach((segment) => {
  segment.addEventListener("click", () => {
    segments.forEach((button) => {
      button.classList.remove("active");
      button.setAttribute("aria-selected", "false");
    });
    segment.classList.add("active");
    segment.setAttribute("aria-selected", "true");
    state.view = segment.dataset.view;
    updateSlider();
    renderCards();
  });
});

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
window.addEventListener("resize", updateSlider);
setTimeout(updateSlider, 100);

loadUsage(false);
