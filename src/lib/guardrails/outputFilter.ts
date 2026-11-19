import { CANARY_TOKEN } from "@/lib/guardrails/systemPrompt";

export interface OutputFilterCheckResult {
  safe: boolean;
  reason?: string;
}

const LEAK_PATTERNS: Array<{ id: string; pattern: RegExp; reason: string }> = [
  {
    id: "L4_CANARY_LEAK",
    pattern: new RegExp(CANARY_TOKEN, "i"),
    reason: "Output security canary triggered: attempted disclosure of protected system context.",
  },
  {
    id: "L4_CANARY_PREFIX_LEAK",
    pattern: /INTERNAL_SECURITY_CANARY|CANARY_7749/i,
    reason: "Output security canary fragment detected and stream aborted.",
  },
  {
    id: "L4_SANDBOX_TAG_LEAK",
    pattern: /<\/?(untrusted_source_context|user_query)\b/i,
    reason: "Internal XML trust-boundary tag disclosure detected in model output.",
  },
  {
    id: "L4_SYSTEM_POLICY_LEAK",
    pattern: /HARD TRUST HIERARCHY & ANTI-INJECTION POLICY/i,
    reason: "System instruction hierarchy leakage detected in model output.",
  },
];

export const OUTPUT_GUARD_SAFE_REFUSAL =
  "Response blocked by ContextLM Output Guardrails because the generated content attempted to disclose protected system instructions. Please ask a factual question about your uploaded sources.";

/**
 * Stateful streaming output inspector that keeps a sliding tail buffer so
 * canary tokens or XML tags split across SSE chunk boundaries are still caught.
 */
export function createOutputGuardFilter() {
  let slidingWindow = "";
  let trippedReason: string | null = null;

  return {
    inspectChunk(chunk: string): OutputFilterCheckResult {
      if (trippedReason) {
        return { safe: false, reason: trippedReason };
      }

      // Keep the last 120 characters plus current chunk to catch split tokens
      slidingWindow = (slidingWindow + chunk).slice(-Math.max(240, chunk.length + 120));

      for (const rule of LEAK_PATTERNS) {
        if (rule.pattern.test(slidingWindow)) {
          trippedReason = rule.reason;
          return { safe: false, reason: rule.reason };
        }
      }

      return { safe: true };
    },
    isTripped(): boolean {
      return trippedReason !== null;
    },
    getReason(): string | null {
      return trippedReason;
    },
  };
}
