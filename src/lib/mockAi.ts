import type { OrderedSource } from "@/lib/guardrails/systemPrompt";
import type { GuardrailLang } from "@/lib/guardrails/inputFilter";

interface ScoredLine {
  source: OrderedSource;
  line: string;
  score: number;
}

const SUMMARY_HINT_REGEX =
  /(סכם|סיכום|עיקרי|נקודות|תאריכים|מועדים|נתונים|מספרים|השווה|השוואה|פרט|סיכונים|משימות|מה כתוב|מה יש|summarize|summary|key|list|compare|extract|dates|figures|risks|main points|overview)/i;

/**
 * Generates a realistic, strictly-grounded mock response with inline `[N] filename`
 * citations directly extracted from the user's currently selected documents.
 */
export function buildMockGroundedAnswer(
  query: string,
  orderedSources: OrderedSource[],
  lang: GuardrailLang
): { content: string; isRefusal: boolean } {
  const queryTerms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  const scoredLines: ScoredLine[] = [];

  for (const src of orderedSources) {
    const lines = src.extractedText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 8);

    for (const line of lines) {
      const lower = line.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (lower.includes(term)) {
          score += term.length >= 4 ? 2 : 1;
        }
      }
      if (score > 0) {
        scoredLines.push({ source: src, line, score });
      }
    }
  }

  scoredLines.sort((a, b) => b.score - a.score);

  // If strong keyword matches exist, ground the answer directly on them
  if (scoredLines.length > 0) {
    const topMatches = scoredLines.slice(0, 4);
    const bullets = topMatches.map(
      (m) => `- ${m.line.replace(/^[-*•\d.)\s]+/, "")} \`[${m.source.index}] ${m.source.filename}\``
    );

    const header =
      lang === "he"
        ? "על בסיס המקורות שסימנתם, להלן הממצאים המדויקים:"
        : "Based strictly on your selected sources, here are the grounded findings:";

    return {
      content: `${header}\n\n${bullets.join("\n")}`,
      isRefusal: false,
    };
  }

  // For broad summary / list / comparison questions, synthesize from the active sources
  if (SUMMARY_HINT_REGEX.test(query)) {
    const bullets: string[] = [];
    for (const src of orderedSources.slice(0, 3)) {
      const lines = src.extractedText
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 10)
        .slice(0, 2);

      for (const line of lines) {
        bullets.push(
          `- ${line.replace(/^[-*•\d.)\s]+/, "")} \`[${src.index}] ${src.filename}\``
        );
      }
    }

    if (bullets.length > 0) {
      const header =
        lang === "he"
          ? `סיכום הנקודות המרכזיות מתוך ${orderedSources.length} המקורות המסומנים:`
          : `Summary of key points across your ${orderedSources.length} selected sources:`;
      return {
        content: `${header}\n\n${bullets.join("\n")}`,
        isRefusal: false,
      };
    }
  }

  // Otherwise demonstrate strict grounding refusal
  return {
    content: "",
    isRefusal: true,
  };
}
