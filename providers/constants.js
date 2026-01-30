/**
 * Shared constants for both Main and Renderer processes.
 */

const BASE_ALLOWED_MODELS = [
  "opencode/big-pickle",
  "openai/gpt-5.2-codex",
  "openai/gpt-5.2",
  "openai/gpt-5.1-codex-mini",
  "openai/gpt-5.1-codex-max",
  "openai/gpt-5.1-codex",
  "openai/gpt-5.1",
  "google/antigravity-gemini-3-pro",
  "google/antigravity-gemini-3-flash",
  "google/antigravity-claude-sonnet-4-5",
  "google/antigravity-claude-sonnet-4-5-thinking",
  "google/antigravity-claude-opus-4-5-thinking",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro"
];

const ALLOWED_VARIANTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "minimal",
  "max",
  "none"
];

module.exports = {
  BASE_ALLOWED_MODELS,
  ALLOWED_VARIANTS
};
