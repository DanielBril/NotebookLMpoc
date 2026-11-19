import crypto from "crypto";

export interface InputFilterResult {
  blocked: boolean;
  status?: "BLOCKED_INJECTION" | "BLOCKED_OUT_OF_SCOPE";
  layer?: string;
  rule?: string;
  reason?: string;
  sanitizedSnippet: string;
}

/**
 * Generates a fresh 8-character cryptographic hex nonce per request
 * to prevent untrusted data from escaping XML trust boundaries.
 */
export function generateNonce(): string {
  return crypto.randomBytes(4).toString("hex");
}

/**
 * Escapes XML special characters so neither uploaded documents nor user
 * queries can forge or prematurely close sandboxed XML tags.
 */
export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface SignatureRule {
  id: string;
  pattern: RegExp;
  status: "BLOCKED_INJECTION" | "BLOCKED_OUT_OF_SCOPE";
  message: string;
}

const INJECTION_RULES: SignatureRule[] = [
  {
    id: "L1_IGNORE_INSTRUCTIONS",
    pattern:
      /\b(ignore|disregard|forget|override|bypass|skip)\b[\s\S]{0,36}\b(previous|prior|above|all|system|developer|original|safety|guardrail)\b[\s\S]{0,24}\b(instructions?|prompts?|rules?|directives?|constraints?|guidelines?)\b/i,
    status: "BLOCKED_INJECTION",
    message: "Direct prompt-override attempt detected (Layer 1 Regex Pre-Filter).",
  },
  {
    id: "L1_REVEAL_SYSTEM_PROMPT",
    pattern:
      /\b(reveal|show|print|dump|output|repeat|leak|disclose|display|tell\s+me)\b[\s\S]{0,30}\b(system\s+prompt|developer\s+prompt|hidden\s+instructions?|your\s+instructions?|initial\s+prompt|system\s+message|canary)\b/i,
    status: "BLOCKED_INJECTION",
    message: "Attempt to extract hidden system instructions detected (Layer 1).",
  },
  {
    id: "L1_JAILBREAK_PERSONA",
    pattern:
      /\b(you\s+are\s+now\s+(dan|an?\s+unrestricted|unfiltered|jailbroken|evil)|do\s+anything\s+now|developer\s+mode\s+(enabled|on|override)|act\s+as\s+(an?\s+)?unrestricted|pretend\s+you\s+have\s+no\s+(rules|restrictions|limits))\b/i,
    status: "BLOCKED_INJECTION",
    message: "Jailbreak / persona override signature detected (Layer 1).",
  },
  {
    id: "L1_XML_TAG_SPOOFING",
    pattern:
      /(<\/?\s*(untrusted_source_context|user_query|system|developer|assistant|instructions?|prompt)\b|\[SYSTEM\s+OVERRIDE\]|CANARY_7749_CTXLM)/i,
    status: "BLOCKED_INJECTION",
    message: "XML trust-boundary spoofing or control-tag injection detected (Layer 1).",
  },
  {
    id: "L1_ROLE_SPOOFING",
    pattern: /(^|\n)\s*(system|developer)\s*:\s*(ignore|override|new\s+instructions|you\s+must)/i,
    status: "BLOCKED_INJECTION",
    message: "Message role-spoofing pattern detected (Layer 1).",
  },
];

const OUT_OF_SCOPE_RULES: SignatureRule[] = [
  {
    id: "L1_OUT_OF_SCOPE_CREATIVE",
    pattern:
      /^\s*(please\s+)?(write|compose|create|generate|invent|tell)\s+(me\s+)?(a|an|some)?\s*(joke|riddle|poem|haiku|song|lyrics|bedtime\s+story|short\s+story|fiction|fanfiction|motivational\s+quote)\b/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    message: "ContextLM only answers factual questions grounded in your uploaded sources.",
  },
  {
    id: "L1_OUT_OF_SCOPE_CODEGEN",
    pattern:
      /^\s*(please\s+)?(write|generate|build|create|code)\s+(me\s+)?(a|an)?\s*(python|javascript|typescript|java|c\+\+|rust|go|bash|sql|html|react)\s+(script|program|app|function|code|website|scraper)\b/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    message: "External code generation is disabled in Grounded Sources-Only mode.",
  },
  {
    id: "L1_OUT_OF_SCOPE_BRAINSTORM",
    pattern:
      /^\s*(please\s+)?(brainstorm|give\s+me\s+random\s+ideas|make\s+up|roleplay\s+as)\b(?!.*\b(document|source|file|upload|attached|pdf|text)\b)/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    message: "Open-ended brainstorming and roleplay are disabled; ask a question grounded in your sources.",
  },
];

function checkRulesAgainstText(text: string): SignatureRule | null {
  for (const rule of INJECTION_RULES) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  for (const rule of OUT_OF_SCOPE_RULES) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  return null;
}

/**
 * Detects Base64-encoded instruction smuggling (e.g. a user pasting encoded
 * "ignore previous instructions" strings to evade plain-text filters).
 */
function inspectBase64Smuggling(query: string): SignatureRule | null {
  const candidates = query.match(/[A-Za-z0-9+/]{24,}={0,2}/g);
  if (!candidates) return null;

  for (const token of candidates.slice(0, 5)) {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      // Only inspect printable decoded ASCII/UTF-8 text
      if (/^[\x20-\x7E\r\n\t]+$/.test(decoded) && decoded.length >= 16) {
        const hit = checkRulesAgainstText(decoded);
        if (hit && hit.status === "BLOCKED_INJECTION") {
          return {
            id: "L1_BASE64_SMUGGLING",
            pattern: hit.pattern,
            status: "BLOCKED_INJECTION",
            message: "Encoded Base64 prompt-injection payload detected and blocked (Layer 1).",
          };
        }
      }
    } catch {
      // Ignore malformed base64 segments
    }
  }
  return null;
}

export function sanitizeAuditSnippet(input: string, maxLen = 140): string {
  const collapsed = input.replace(/\s+/g, " ").trim();
  const truncated = collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed;
  return escapeXml(truncated);
}

/**
 * Layer 1 deterministic heuristic & signature pre-filter (< 2ms, 0 LLM tokens).
 */
export function inspectUserInput(query: string): InputFilterResult {
  const sanitizedSnippet = sanitizeAuditSnippet(query);

  const directHit = checkRulesAgainstText(query);
  if (directHit) {
    return {
      blocked: true,
      status: directHit.status,
      layer: "Layer 1 (Deterministic Pre-Filter)",
      rule: directHit.id,
      reason: directHit.message,
      sanitizedSnippet,
    };
  }

  const base64Hit = inspectBase64Smuggling(query);
  if (base64Hit) {
    return {
      blocked: true,
      status: base64Hit.status,
      layer: "Layer 1 (Base64 Smuggling Detector)",
      rule: base64Hit.id,
      reason: base64Hit.message,
      sanitizedSnippet,
    };
  }

  return {
    blocked: false,
    sanitizedSnippet,
  };
}

/**
 * Checks whether a query has subtle borderline signals worth double-checking
 * with the fast Layer 4 gpt-5-nano micro-classifier.
 */
export function shouldRunMicroClassifier(query: string): boolean {
  const lowered = query.toLowerCase();
  const borderlineSignals = [
    "instruction",
    "prompt",
    "system",
    "override",
    "ignore",
    "pretend",
    "hypothetical",
    "roleplay",
    "secret",
    "password",
    "admin",
    "hack",
    "bypass",
    "jailbreak",
    "write a ",
    "generate a ",
    "create a ",
    "poem",
    "joke",
    "story",
    "script",
    "code",
    "translate into",
    "from your own knowledge",
    "outside the document",
    "even if not in",
  ];
  return borderlineSignals.some((signal) => lowered.includes(signal));
}
