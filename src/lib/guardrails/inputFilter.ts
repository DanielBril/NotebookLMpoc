import crypto from "crypto";

export type GuardrailLang = "he" | "en";

export interface InputFilterResult {
  blocked: boolean;
  isDangerous: boolean;
  status?: "BLOCKED_INJECTION" | "BLOCKED_OUT_OF_SCOPE";
  layer?: string;
  rule?: string;
  reason?: string;
  matchedFragment?: string;
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
  messageHe: string;
  messageEn: string;
}

const INJECTION_AND_DANGEROUS_RULES: SignatureRule[] = [
  {
    id: "L1_IGNORE_INSTRUCTIONS",
    pattern:
      /\b(ignore|disregard|forget|override|bypass|skip)\b[\s\S]{0,36}\b(previous|prior|above|all|system|developer|original|safety|guardrail)\b[\s\S]{0,24}\b(instructions?|prompts?|rules?|directives?|constraints?|guidelines?)\b/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה ניסיון לעקוף הנחיות מערכת (שכבת סינון 1).",
    messageEn: "Direct prompt-override attempt detected (Layer 1 Regex Pre-Filter).",
  },
  {
    id: "L1_HEBREW_INJECTION",
    pattern:
      /(התעלם|תתעלם|שכח|תשכח|עקוף|תעקוף|בטל)[\s\S]{0,30}(מההוראות|מהנחיות|מהכללים|הוראות\s+קודמות|הנחיות\s+המערכת|הפרומפט)|((חשוף|תחשוף|הצג|תציג|הדפס|תגלה)[\s\S]{0,25}(הנחיות\s+המערכת|פרומפט\s+המערכת|הוראות\s+נסתרות|סיסמת\s+מנהל))/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה ניסיון להזרקת פרומפט או חשיפת הנחיות מערכת (שכבה 1).",
    messageEn: "Hebrew prompt-injection or instruction extraction attempt detected (Layer 1).",
  },
  {
    id: "L1_REVEAL_SYSTEM_PROMPT",
    pattern:
      /\b(reveal|show|print|dump|output|repeat|leak|disclose|display|tell\s+me)\b[\s\S]{0,30}\b(system\s+prompt|developer\s+prompt|hidden\s+instructions?|your\s+instructions?|initial\s+prompt|system\s+message|canary)\b/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה ניסיון לחלץ הנחיות מערכת נסתרות (שכבה 1).",
    messageEn: "Attempt to extract hidden system instructions detected (Layer 1).",
  },
  {
    id: "L1_JAILBREAK_PERSONA",
    pattern:
      /\b(you\s+are\s+now\s+(dan|an?\s+unrestricted|unfiltered|jailbroken|evil)|do\s+anything\s+now|developer\s+mode\s+(enabled|on|override)|act\s+as\s+(an?\s+)?unrestricted|pretend\s+you\s+have\s+no\s+(rules|restrictions|limits))\b/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהתה חתימת פריצת מגבלות / שינוי זהות (שכבה 1).",
    messageEn: "Jailbreak / persona override signature detected (Layer 1).",
  },
  {
    id: "L1_XML_TAG_SPOOFING",
    pattern:
      /(<\/?\s*(untrusted_source_context|user_query|system|developer|assistant|instructions?|prompt)\b|\[SYSTEM\s+OVERRIDE\]|CANARY_7749_CTXLM)/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה ניסיון זיוף תגיות XML או הזרקת תגיות בקרה (שכבה 1).",
    messageEn: "XML trust-boundary spoofing or control-tag injection detected (Layer 1).",
  },
  {
    id: "L1_ROLE_SPOOFING",
    pattern: /(^|\n)\s*(system|developer)\s*:\s*(ignore|override|new\s+instructions|you\s+must)/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה ניסיון התחזות לתפקיד מערכת (שכבה 1).",
    messageEn: "Message role-spoofing pattern detected (Layer 1).",
  },
  {
    id: "L1_DANGEROUS_PAYLOAD",
    pattern:
      /(<\s*script\b|;\s*drop\s+table\b|union\s+select\b|\b(ransomware|keylogger|exploit\s+payload|ddos\s+attack|steal\s+passwords?|build\s+a?\s*bomb|how\s+to\s+make\s+(explosives?|poison|malware))\b|להכין\s+(פצצה|חומר\s+נפץ|רעל|נוזקה)|לפרוץ\s+ל(מערכת|שרת|מסד\s+נתונים|חשבונות))/i,
    status: "BLOCKED_INJECTION",
    messageHe: "זוהה תוכן מסוכן או זדוני שנחסם אוטומטית על ידי מנגנון האבטחה.",
    messageEn: "Dangerous or malicious content detected and blocked by security guardrails.",
  },
];

const OUT_OF_SCOPE_RULES: SignatureRule[] = [
  {
    id: "L1_OUT_OF_SCOPE_CREATIVE",
    pattern:
      /^\s*(please\s+)?(write|compose|create|generate|invent|tell)\s+(me\s+)?(a|an|some)?\s*(joke|riddle|poem|haiku|song|lyrics|bedtime\s+story|short\s+story|fiction|fanfiction|motivational\s+quote)\b/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    messageHe: "ContextLM עונה רק על שאלות עובדתיות המבוססות על המקורות שהעליתם.",
    messageEn: "ContextLM only answers factual questions grounded in your uploaded sources.",
  },
  {
    id: "L1_OUT_OF_SCOPE_CODEGEN",
    pattern:
      /^\s*(please\s+)?(write|generate|build|create|code)\s+(me\s+)?(a|an)?\s*(python|javascript|typescript|java|c\+\+|rust|go|bash|sql|html|react)\s+(script|program|app|function|code|website|scraper)\b/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    messageHe: "יצירת קוד חיצוני מושבתת במצב מבוסס מקורות בלבד.",
    messageEn: "External code generation is disabled in Grounded Sources-Only mode.",
  },
  {
    id: "L1_OUT_OF_SCOPE_BRAINSTORM",
    pattern:
      /^\s*(please\s+)?(brainstorm|give\s+me\s+random\s+ideas|make\s+up|roleplay\s+as)\b(?!.*\b(document|source|file|upload|attached|pdf|text)\b)/i,
    status: "BLOCKED_OUT_OF_SCOPE",
    messageHe: "סיעור מוחות כללי ומשחקי תפקידים מושבתים; אנא שאלו שאלה המבוססת על המקורות שלכם.",
    messageEn: "Open-ended brainstorming and roleplay are disabled; ask a question grounded in your sources.",
  },
];

import type { GuardrailConfig } from "@/lib/guardrailConfig";

function checkInjectionRules(
  text: string
): { rule: SignatureRule; matchedFragment: string } | null {
  for (const rule of INJECTION_AND_DANGEROUS_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return { rule, matchedFragment: match[0].slice(0, 120) };
    }
  }
  return null;
}

function checkOutOfScopeRules(
  text: string
): { rule: SignatureRule; matchedFragment: string } | null {
  for (const rule of OUT_OF_SCOPE_RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return { rule, matchedFragment: match[0].slice(0, 120) };
    }
  }
  return null;
}

/**
 * Checks whether a user query matches any developer-configured allowlist phrase.
 */
export function matchesCustomAllowTerm(
  query: string,
  config?: GuardrailConfig
): string | null {
  if (!config?.customAllowTerms?.length) return null;
  const lowered = query.toLowerCase();
  for (const term of config.customAllowTerms) {
    const t = term.trim().toLowerCase();
    if (t.length >= 2 && lowered.includes(t)) {
      return term;
    }
  }
  return null;
}

/**
 * Detects Base64-encoded instruction smuggling (e.g. a user pasting encoded
 * "ignore previous instructions" strings to evade plain-text filters).
 */
function inspectBase64Smuggling(
  query: string
): { rule: SignatureRule; matchedFragment: string } | null {
  const candidates = query.match(/[A-Za-z0-9+/]{24,}={0,2}/g);
  if (!candidates) return null;

  for (const token of candidates.slice(0, 5)) {
    try {
      const decoded = Buffer.from(token, "base64").toString("utf-8");
      if (/^[\x20-\x7E\r\n\t]+$/.test(decoded) && decoded.length >= 16) {
        const hit = checkInjectionRules(decoded);
        if (hit && hit.rule.status === "BLOCKED_INJECTION") {
          return {
            rule: {
              id: "L1_BASE64_SMUGGLING",
              pattern: hit.rule.pattern,
              status: "BLOCKED_INJECTION",
              messageHe: "זוהה ונחסם מטען הזרקה מקודד ב-Base64 (שכבה 1).",
              messageEn:
                "Encoded Base64 prompt-injection payload detected and blocked (Layer 1).",
            },
            matchedFragment: `base64 -> "${hit.matchedFragment}"`,
          };
        }
      }
    } catch {
      // Ignore malformed base64 segments
    }
  }
  return null;
}

export function sanitizeAuditSnippet(input: string, maxLen = 280): string {
  const collapsed = input.replace(/\s+/g, " ").trim();
  const truncated =
    collapsed.length > maxLen ? `${collapsed.slice(0, maxLen)}…` : collapsed;
  return escapeXml(truncated);
}

/**
 * Layer 1 deterministic heuristic & signature pre-filter (< 2ms, 0 LLM tokens).
 * Respects live developer GuardrailConfig for custom allow/block lists and out-of-scope toggles.
 */
export function inspectUserInput(
  query: string,
  lang: GuardrailLang = "he",
  config?: GuardrailConfig
): InputFilterResult {
  const sanitizedSnippet = sanitizeAuditSnippet(query);

  // 1. Developer custom block phrases (checked first)
  if (config?.customBlockTerms?.length) {
    const lowered = query.toLowerCase();
    for (const term of config.customBlockTerms) {
      const cleanTerm = term.trim().toLowerCase();
      if (cleanTerm.length >= 2 && lowered.includes(cleanTerm)) {
        return {
          blocked: true,
          isDangerous: true,
          status: "BLOCKED_INJECTION",
          layer:
            lang === "he"
              ? "שכבה 1 (חוק חסימה מותאם)"
              : "Layer 1 (Custom Developer Block Rule)",
          rule: "L1_CUSTOM_BLOCK_TERM",
          reason:
            lang === "he"
              ? `השאילתה תאמה לביטוי חסום מותאם שהוגדר במנהרת האבטחה.`
              : `Query matched a custom blocked phrase configured in the Security Pipeline.`,
          matchedFragment: term,
          sanitizedSnippet,
        };
      }
    }
  }

  // 2. Core injection & dangerous rules (always active)
  const injHit = checkInjectionRules(query);
  if (injHit) {
    return {
      blocked: true,
      isDangerous: true,
      status: injHit.rule.status,
      layer:
        lang === "he"
          ? "שכבה 1 (סינון דטרמיניסטי)"
          : "Layer 1 (Deterministic Pre-Filter)",
      rule: injHit.rule.id,
      reason:
        lang === "he" ? injHit.rule.messageHe : injHit.rule.messageEn,
      matchedFragment: injHit.matchedFragment,
      sanitizedSnippet,
    };
  }

  // 3. Base64 smuggling check (always active)
  const base64Hit = inspectBase64Smuggling(query);
  if (base64Hit) {
    return {
      blocked: true,
      isDangerous: true,
      status: base64Hit.rule.status,
      layer:
        lang === "he"
          ? "שכבה 1 (זיהוי Base64)"
          : "Layer 1 (Base64 Smuggling Detector)",
      rule: base64Hit.rule.id,
      reason:
        lang === "he" ? base64Hit.rule.messageHe : base64Hit.rule.messageEn,
      matchedFragment: base64Hit.matchedFragment,
      sanitizedSnippet,
    };
  }

  // 4. Out-of-scope pre-filter (configurable via Developer Security Pipeline & allowlist)
  const outOfScopeEnabled = config ? config.enableLayer1OutOfScope : true;
  const allowMatch = matchesCustomAllowTerm(query, config);
  if (outOfScopeEnabled && !allowMatch) {
    const oosHit = checkOutOfScopeRules(query);
    if (oosHit) {
      return {
        blocked: true,
        isDangerous: false,
        status: oosHit.rule.status,
        layer:
          lang === "he"
            ? "שכבה 1 (סינון מחוץ לתחום)"
            : "Layer 1 (Out-of-Scope Pre-Filter)",
        rule: oosHit.rule.id,
        reason:
          lang === "he" ? oosHit.rule.messageHe : oosHit.rule.messageEn,
        matchedFragment: oosHit.matchedFragment,
        sanitizedSnippet,
      };
    }
  }

  return {
    blocked: false,
    isDangerous: false,
    sanitizedSnippet,
  };
}

const BORDERLINE_SIGNALS = [
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
  "הנחיות",
  "פרומפט",
  "התעלם",
  "סיסמה",
  "פריצה",
  "לפרוץ",
  "מחוץ למסמך",
];

/**
 * Returns the exact borderline signals matched in a query for transparent logging.
 */
export function getBorderlineSignals(query: string): string[] {
  const lowered = query.toLowerCase();
  return BORDERLINE_SIGNALS.filter((signal) => lowered.includes(signal));
}

/**
 * Checks whether a query has subtle borderline signals worth double-checking
 * with the fast Layer 4 micro-classifier.
 */
export function shouldRunMicroClassifier(query: string): boolean {
  return getBorderlineSignals(query).length > 0;
}
