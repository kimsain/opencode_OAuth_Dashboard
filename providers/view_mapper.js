/**
 * View Mapper Utility
 * Normalizes and groups quota data for different dashboard views.
 */

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
  "Gemini 3 Pro (Antigravity)",
  "Gemini 3 Pro",
  "Gemini 3 Pro (High)",
  "Gemini 3 Pro (Low)",
  "Gemini 3 Flash (Antigravity)",
  "Gemini 3 Flash",
  "tab_flash_lite_preview"
];

const orderIndex = new Map(desiredOrder.map((name, i) => [name.toLowerCase(), i]));

/**
 * Maps items to Model View (decorated and sorted)
 */
const mapToModelView = (items) => {
  const decorated = items.map((item) => ({
    ...item,
    title: item.model,
    subtitle: `Category: ${item.category}`,
    models: [item.model]
  }));

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
};

/**
 * Maps items to Category View (grouped and aggregated)
 */
const mapToCategoryView = (items) => {
  const grouped = new Map();
  items.forEach((item) => {
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
    const isCli = item.category === "gemini-cli";
    
    // Normalize matching to be robust against variations
    if (modelName.includes("Gemini 3 Pro")) {
      groupName = isCli ? "Gemini CLI Pro" : "Antigravity Pro";
    } else if (modelName.includes("Gemini 3 Flash")) {
      groupName = isCli ? "Gemini CLI Flash" : "Antigravity Flash";
    } else if (isCli) {
      groupName = "Gemini CLI";
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

/**
 * Main entry point for view mapping
 */
const computeViewData = (items) => {
  if (!Array.isArray(items)) {
    return { model: [], category: [] };
  }
  return {
    model: mapToModelView(items),
    category: mapToCategoryView(items)
  };
};

module.exports = {
  computeViewData
};
