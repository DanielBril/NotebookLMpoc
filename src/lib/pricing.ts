export interface ModelRateCard {
  inputPer1M: number;
  cachedInputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING: Record<string, ModelRateCard> = {
  "gpt-6-luna": {
    inputPer1M: 0.10,
    cachedInputPer1M: 0.01,
    outputPer1M: 0.50,
  },
  "gpt-5-nano": {
    inputPer1M: 0.05,
    cachedInputPer1M: 0.005,
    outputPer1M: 0.20,
  },
};

const DEFAULT_RATE = MODEL_PRICING["gpt-6-luna"];

export function getModelRate(model: string): ModelRateCard {
  const normalized = model.toLowerCase().trim();
  if (MODEL_PRICING[normalized]) {
    return MODEL_PRICING[normalized];
  }
  if (normalized.includes("nano")) {
    return MODEL_PRICING["gpt-5-nano"];
  }
  return DEFAULT_RATE;
}

export interface TokenUsageCostInput {
  model: string;
  promptTokens: number;
  cachedTokens?: number;
  completionTokens: number;
}

/**
 * Computes exact USD cost accounting for OpenAI prompt-cache discounts.
 * Uncached input tokens = max(0, promptTokens - cachedTokens).
 */
export function calculateCostUsd({
  model,
  promptTokens,
  cachedTokens = 0,
  completionTokens,
}: TokenUsageCostInput): number {
  const rate = getModelRate(model);
  const safePrompt = Math.max(0, promptTokens);
  const safeCached = Math.min(safePrompt, Math.max(0, cachedTokens));
  const uncachedInput = safePrompt - safeCached;
  const safeCompletion = Math.max(0, completionTokens);

  const cost =
    (uncachedInput / 1_000_000) * rate.inputPer1M +
    (safeCached / 1_000_000) * rate.cachedInputPer1M +
    (safeCompletion / 1_000_000) * rate.outputPer1M;

  return Number(cost.toFixed(8));
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0.00";
  if (amount < 0.0001) return "<$0.0001";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(4)}`;
}

export function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}k`;
  return tokens.toLocaleString("en-US");
}
