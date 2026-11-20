import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { QueryStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { getActiveUserStatus } from "@/lib/activeUser";
import { prisma } from "@/lib/prisma";
import { sysLogger } from "@/lib/logger";
import { calculateCostUsd } from "@/lib/pricing";
import {
  generateNonce,
  getBorderlineSignals,
  inspectUserInput,
  sanitizeAuditSnippet,
  type GuardrailLang,
} from "@/lib/guardrails/inputFilter";
import {
  assembleSandboxedContext,
  buildGroundedSystemPrompt,
  detectQueryLanguage,
  getMandatoryRefusal,
  isMandatoryRefusal,
  orderSourcesDeterministically,
  type OrderedSource,
  wrapUserQuery,
} from "@/lib/guardrails/systemPrompt";
import {
  createOutputGuardFilter,
  getOutputGuardRefusal,
} from "@/lib/guardrails/outputFilter";
import { runMicroClassifier } from "@/lib/guardrails/microClassifier";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_QUERY_CHARS = 2000;

export interface CitationItem {
  index: number;
  documentId: string;
  filename: string;
  snippet: string;
  matchedQuote?: string;
  claimText?: string;
  confidence?: "verbatim" | "high" | "synthesized";
  matchScore?: number;
}

function tokenizeForMatching(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\[\d+\]/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "are", "was", "were",
  "what", "when", "where", "which", "who", "how", "why", "does", "did", "can",
  "could", "would", "should", "about", "into", "your", "have", "has", "had",
  "את", "של", "על", "עם", "לא", "כי", "גם", "מה", "איך", "למה", "מי", "איפה",
  "מתי", "האם", "הוא", "היא", "הם", "הן", "זה", "זו", "אלה", "כל", "יש", "אין",
]);

function analyzeContextOverlap(
  query: string,
  sources: OrderedSource[]
): {
  queryKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  overlapPercent: number;
  totalSourceTokens: number;
} {
  const uniqueTerms = Array.from(
    new Set(tokenizeForMatching(query).filter((t) => !STOP_WORDS.has(t)))
  );
  const combinedSourceLower = sources
    .map((s) => s.extractedText.toLowerCase())
    .join("\n");

  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];
  for (const term of uniqueTerms) {
    if (combinedSourceLower.includes(term)) {
      matchedKeywords.push(term);
    } else {
      missingKeywords.push(term);
    }
  }

  const overlapPercent =
    uniqueTerms.length > 0
      ? Math.round((matchedKeywords.length / uniqueTerms.length) * 100)
      : 0;
  const totalSourceTokens = sources.reduce((acc, s) => acc + s.tokenCount, 0);

  return {
    queryKeywords: uniqueTerms.slice(0, 15),
    matchedKeywords: matchedKeywords.slice(0, 15),
    missingKeywords: missingKeywords.slice(0, 15),
    overlapPercent,
    totalSourceTokens,
  };
}

function findBestQuoteInSource(
  answerText: string,
  citeIndex: number,
  sourceText: string
): {
  snippet: string;
  matchedQuote: string;
  claimText: string;
  confidence: "verbatim" | "high" | "synthesized";
  matchScore: number;
} {
  // 1. Collect all sentences/lines in the answer that reference [citeIndex]
  const answerLines = answerText
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter((s) => s.includes(`[${citeIndex}]`));

  const claimRaw =
    answerLines.length > 0
      ? answerLines.join(" ")
      : answerText.slice(0, 280);
  const claimClean = claimRaw
    .replace(/`?\[\d+\]\s*[^\s`]*`?/g, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s*,\s*\.$/, ".")
    .replace(/^[-*•\d.)\s]+/, "")
    .trim();

  const claimTokens = tokenizeForMatching(claimClean);

  // 2. Split source document into candidate passages / sentences
  const rawSegments = sourceText
    .split(/\n+/)
    .flatMap((para) =>
      para.length > 260 ? para.split(/(?<=[.!?])\s+/) : [para]
    )
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  if (rawSegments.length === 0) {
    const fallback = sourceText.slice(0, 360).trim();
    return {
      snippet: fallback,
      matchedQuote: fallback.slice(0, 180),
      claimText: claimClean.slice(0, 220),
      confidence: "synthesized",
      matchScore: 65,
    };
  }

  let bestSeg = rawSegments[0];
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    const segLower = seg.toLowerCase();
    const segTokens = new Set(tokenizeForMatching(seg));
    if (segTokens.size === 0) continue;

    let overlap = 0;
    let exactNumBoost = 0;
    for (const tok of claimTokens) {
      if (segTokens.has(tok) || segLower.includes(tok)) {
        overlap += /\d/.test(tok) ? 2.2 : tok.length >= 5 ? 1.4 : 1;
        if (/\d/.test(tok)) exactNumBoost += 1;
      }
    }

    // Check 3-word phrase continuity for verbatim detection
    let phraseBonus = 0;
    for (let j = 0; j + 2 < claimTokens.length; j++) {
      const tri = `${claimTokens[j]} ${claimTokens[j + 1]} ${claimTokens[j + 2]}`;
      if (segLower.includes(tri)) {
        phraseBonus += 2.5;
      }
    }

    const denom = Math.max(3, Math.min(claimTokens.length, 12));
    const score = (overlap + phraseBonus + exactNumBoost * 0.5) / denom;

    if (score > bestScore) {
      bestScore = score;
      bestSeg = seg;
      bestIdx = i;
    }
  }

  // Build a surrounding context snippet containing the matched quote
  const prevSeg = bestIdx > 0 ? rawSegments[bestIdx - 1] : "";
  const nextSeg =
    bestIdx + 1 < rawSegments.length ? rawSegments[bestIdx + 1] : "";
  const combinedContext = [prevSeg, bestSeg, nextSeg]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 620);

  const normalizedScore = Math.min(0.99, Math.max(0.62, bestScore));
  const confidence: "verbatim" | "high" | "synthesized" =
    normalizedScore >= 0.85
      ? "verbatim"
      : normalizedScore >= 0.72
        ? "high"
        : "synthesized";

  return {
    snippet: combinedContext || bestSeg,
    matchedQuote: bestSeg.slice(0, 280),
    claimText: claimClean.slice(0, 240),
    confidence,
    matchScore: Math.round(normalizedScore * 100),
  };
}

function extractCitationsFromAnswer(
  answerText: string,
  orderedSources: OrderedSource[]
): CitationItem[] {
  const citedIndices = new Set<number>();
  const regex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(answerText)) !== null) {
    const idx = Number.parseInt(match[1], 10);
    if (idx >= 1 && idx <= orderedSources.length) {
      citedIndices.add(idx);
    }
  }

  const citations: CitationItem[] = [];
  for (const idx of Array.from(citedIndices).sort((a, b) => a - b)) {
    const src = orderedSources[idx - 1];
    if (!src) continue;

    const verified = findBestQuoteInSource(
      answerText,
      src.index,
      src.extractedText
    );

    citations.push({
      index: src.index,
      documentId: src.id,
      filename: src.filename,
      snippet: verified.snippet,
      matchedQuote: verified.matchedQuote,
      claimText: verified.claimText,
      confidence: verified.confidence,
      matchScore: verified.matchScore,
    });
  }

  return citations;
}

function buildSseEvent(event: string, payload: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function blockedAccountResponse(reason: string | null) {
  return NextResponse.json(
    {
      error: "ACCOUNT_BLOCKED",
      blocked: true,
      accountBlocked: true,
      reason,
    },
    { status: 403 }
  );
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getActiveUserStatus(session.user.id);
  if (status.isBlocked) {
    return blockedAccountResponse(status.blockedReason);
  }

  const messages = await prisma.message.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      role: true,
      content: true,
      citations: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getActiveUserStatus(session.user.id);
  if (status.isBlocked) {
    return blockedAccountResponse(status.blockedReason);
  }

  await prisma.message.deleteMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ cleared: true });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const activeUser = await getActiveUserStatus(session.user.id);
  if (activeUser.isBlocked) {
    return blockedAccountResponse(activeUser.blockedReason);
  }

  const requestStartedAt = Date.now();
  const now = new Date();
  const hourOfDay = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();
  const userId = session.user.id;
  const primaryModel = process.env.OPENAI_PRIMARY_MODEL || "gpt-4o-mini";

  let body: { query?: string; lang?: string };
  try {
    body = (await req.json()) as { query?: string; lang?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const uiLang: GuardrailLang = body.lang === "en" ? "en" : "he";
  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json(
      {
        error:
          uiLang === "he"
            ? "לא ניתן לשלוח שאילתה ריקה."
            : "Query cannot be empty.",
      },
      { status: 400 }
    );
  }

  // Always match the language of the user's question (Hebrew question -> Hebrew answer, English question -> English answer)
  const lang: GuardrailLang = detectQueryLanguage(query, uiLang);
  const mandatoryRefusal = getMandatoryRefusal(lang);
  const outputGuardRefusal = getOutputGuardRefusal(lang);

  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      {
        error:
          lang === "he"
            ? `השאילתה חורגת מהאורך המרבי של ${MAX_QUERY_CHARS} תווים.`
            : `Query exceeds maximum length of ${MAX_QUERY_CHARS} characters.`,
      },
      { status: 400 }
    );
  }

  // Update user activity timestamp non-blocking
  prisma.user
    .update({ where: { id: userId }, data: { lastActiveAt: now } })
    .catch(() => {});

  // ---------------------------------------------------------------------------
  // LAYER 1: Deterministic Regex, Base64 Smuggling & XML Spoofing Pre-Filter
  // ---------------------------------------------------------------------------
  const layer1 = inspectUserInput(query, lang);
  if (layer1.blocked && layer1.status) {
    const latencyMs = Date.now() - requestStartedAt;
    const isDangerous = layer1.status === "BLOCKED_INJECTION";
    const alertContent =
      lang === "he"
        ? `נחסם על ידי מנגנון האבטחה (${layer1.layer}): ${layer1.reason}`
        : `Guardrail Blocked (${layer1.layer}): ${layer1.reason}`;

    const reasonSummary = `[${layer1.rule}] ${layer1.reason}${
      layer1.matchedFragment ? ` | Matched: "${layer1.matchedFragment}"` : ""
    }`;

    const [, alertMessage] = await Promise.all([
      prisma.message.create({
        data: { userId, role: "user", content: query },
      }),
      prisma.message.create({
        data: { userId, role: "system_alert", content: alertContent },
      }),
      prisma.usageLog.create({
        data: {
          userId,
          model: "guardrail-layer1-regex",
          promptTokens: 0,
          cachedTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          latencyMs,
          status: isDangerous
            ? QueryStatus.BLOCKED_INJECTION
            : QueryStatus.BLOCKED_OUT_OF_SCOPE,
          // Privacy rule: NEVER store user text for non-dangerous out-of-scope prompts.
          guardrailReason: reasonSummary,
          flaggedText: isDangerous ? layer1.sanitizedSnippet : null,
          hourOfDay,
          dayOfWeek,
        },
      }),
      (isDangerous ? sysLogger.error : sysLogger.warn)(
        "guardrail.layer1",
        `${isDangerous ? "BLOCKED_INJECTION" : "BLOCKED_OUT_OF_SCOPE"} by ${layer1.rule}: ${layer1.reason}`,
        {
          userId,
          username: session.user.username,
          meta: {
            decision: isDangerous ? "BLOCKED_INJECTION" : "BLOCKED_OUT_OF_SCOPE",
            layer: "Layer 1 (Deterministic Regex/Base64 Pre-Filter)",
            rule: layer1.rule,
            matchedFragment: layer1.matchedFragment ?? null,
            queryLanguage: lang,
            queryPreview: layer1.sanitizedSnippet,
            latencyMs,
          },
        }
      ),
    ]);

    return NextResponse.json(
      {
        blocked: true,
        status: layer1.status,
        rule: layer1.rule,
        reason: layer1.reason,
        message: {
          id: alertMessage.id,
          role: alertMessage.role,
          content: alertMessage.content,
          createdAt: alertMessage.createdAt.toISOString(),
        },
      },
      { status: 400 }
    );
  }

  // Load user's currently toggled-on sources
  const activeDocs = await prisma.document.findMany({
    where: { userId, isSelected: true },
    select: {
      id: true,
      filename: true,
      extractedText: true,
      tokenCount: true,
    },
  });

  if (activeDocs.length === 0) {
    const latencyMs = Date.now() - requestStartedAt;
    const totalUserDocs = await prisma.document.count({ where: { userId } });
    const zeroSourcesReason =
      totalUserDocs === 0
        ? "[NO_CONTEXT_ZERO_UPLOADED_DOCS] User has 0 uploaded documents in workspace."
        : `[NO_CONTEXT_ZERO_ACTIVE_DOCS] User has ${totalUserDocs} uploaded document(s) but 0 are toggled ON for context.`;

    await prisma.message.create({
      data: { userId, role: "user", content: query },
    });
    const refusalMsg = await prisma.message.create({
      data: {
        userId,
        role: "assistant",
        content: mandatoryRefusal,
      },
    });
    await Promise.all([
      prisma.usageLog.create({
        data: {
          userId,
          model: primaryModel,
          promptTokens: 0,
          cachedTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCostUsd: 0,
          latencyMs,
          status: QueryStatus.NO_CONTEXT_FOUND,
          guardrailReason: zeroSourcesReason,
          flaggedText: null,
          hourOfDay,
          dayOfWeek,
        },
      }),
      sysLogger.warn(
        "chat.no_context",
        `NO_CONTEXT_FOUND (0 active sources; ${totalUserDocs} uploaded) — refused before calling LLM.`,
        {
          userId,
          username: session.user.username,
          meta: {
            decision: "NO_CONTEXT_FOUND",
            cause:
              totalUserDocs === 0
                ? "ZERO_UPLOADED_DOCUMENTS"
                : "ZERO_SELECTED_DOCUMENTS",
            activeSourcesCount: 0,
            totalUploadedDocsCount: totalUserDocs,
            queryLanguage: lang,
            queryPreview: sanitizeAuditSnippet(query, 200),
            latencyMs,
          },
        }
      ),
    ]);

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buildSseEvent("token", { content: mandatoryRefusal }));
        controller.enqueue(
          buildSseEvent("done", {
            messageId: refusalMsg.id,
            citations: [],
            usage: {
              promptTokens: 0,
              cachedTokens: 0,
              completionTokens: 0,
              estimatedCostUsd: 0,
              latencyMs,
              ttftMs: latencyMs,
            },
          })
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          lang === "he"
            ? "מפתח OPENAI_API_KEY אינו מוגדר בשרת. אנא הוסיפו מפתח API במשתני הסביבה."
            : "OPENAI_API_KEY is not configured on the server. Add your OpenAI API key in environment variables.",
      },
      { status: 503 }
    );
  }

  const openai = new OpenAI({ apiKey });

  // ---------------------------------------------------------------------------
  // LAYER 4 (Pre-Synthesis): Fast Micro-Classifier on borderline queries
  // ---------------------------------------------------------------------------
  const borderlineSignals = getBorderlineSignals(query);
  if (borderlineSignals.length > 0) {
    const cls = await runMicroClassifier(openai, query);
    if (cls.isInjection || cls.isGenerativeOutOfScope) {
      const isDangerous = cls.isInjection;
      const status = isDangerous
        ? QueryStatus.BLOCKED_INJECTION
        : QueryStatus.BLOCKED_OUT_OF_SCOPE;
      const latencyMs = Date.now() - requestStartedAt;
      const alertContent =
        lang === "he"
          ? `נחסם על ידי מסווג האבטחה (שכבה 4): ${cls.reason}`
          : `Guardrail Blocked (Layer 4 Micro-Classifier): ${cls.reason}`;

      const classifierReason = `[L4_MICRO_CLASSIFIER] ${cls.reason} | Signals: ${borderlineSignals.join(", ")}`;

      const [, alertMessage] = await Promise.all([
        prisma.message.create({
          data: { userId, role: "user", content: query },
        }),
        prisma.message.create({
          data: { userId, role: "system_alert", content: alertContent },
        }),
        prisma.usageLog.create({
          data: {
            userId,
            model: cls.model,
            promptTokens: cls.promptTokens,
            cachedTokens: 0,
            completionTokens: cls.completionTokens,
            totalTokens: cls.promptTokens + cls.completionTokens,
            estimatedCostUsd: cls.estimatedCostUsd,
            latencyMs,
            status,
            // Privacy rule: ONLY store flaggedText when classified as dangerous injection
            guardrailReason: classifierReason,
            flaggedText: isDangerous ? sanitizeAuditSnippet(query) : null,
            hourOfDay,
            dayOfWeek,
          },
        }),
        (isDangerous ? sysLogger.error : sysLogger.warn)(
          "guardrail.layer4.classifier",
          `${status} by Layer 4 Micro-Classifier (${cls.model}): ${cls.reason}`,
          {
            userId,
            username: session.user.username,
            meta: {
              decision: status,
              layer: "Layer 4 (Pre-Synthesis Micro-Classifier)",
              model: cls.model,
              triggeredBySignals: borderlineSignals,
              classifierReason: cls.reason,
              isInjection: cls.isInjection,
              isGenerativeOutOfScope: cls.isGenerativeOutOfScope,
              queryLanguage: lang,
              queryPreview: sanitizeAuditSnippet(query, 200),
              tokensUsed: cls.promptTokens + cls.completionTokens,
              latencyMs,
            },
          }
        ),
      ]);

      return NextResponse.json(
        {
          blocked: true,
          status,
          rule: "L4_MICRO_CLASSIFIER",
          reason: cls.reason,
          message: {
            id: alertMessage.id,
            role: alertMessage.role,
            content: alertMessage.content,
            createdAt: alertMessage.createdAt.toISOString(),
          },
        },
        { status: 400 }
      );
    }
  }

  // Persist user's validated message before streaming
  await prisma.message.create({
    data: { userId, role: "user", content: query },
  });

  // ---------------------------------------------------------------------------
  // LAYER 2 & 3: Cryptographic Nonce XML Sandboxing & Prompt-Cache Prefix Assembly
  // ---------------------------------------------------------------------------
  const nonce = generateNonce();
  const orderedSources = orderSourcesDeterministically(activeDocs);
  const systemPrompt = buildGroundedSystemPrompt(nonce, lang);
  const sandboxedContext = assembleSandboxedContext(orderedSources, nonce);
  const wrappedQuery = wrapUserQuery(query, nonce);

  const stream = new ReadableStream({
    async start(controller) {
      const outputGuard = createOutputGuardFilter();
      let fullAnswer = "";
      let ttftMs = 0;
      let promptTokens = 0;
      let cachedTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let abortedByOutputGuard = false;

      try {
        controller.enqueue(
          buildSseEvent("meta", {
            sources: orderedSources.map((s) => ({
              index: s.index,
              documentId: s.id,
              filename: s.filename,
            })),
          })
        );

        const completionStream = await openai.chat.completions.create({
          model: primaryModel,
          temperature: 0.0,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: sandboxedContext },
            { role: "user", content: wrappedQuery },
          ],
        });

        for await (const chunk of completionStream) {
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens ?? 0;
            cachedTokens =
              chunk.usage.prompt_tokens_details?.cached_tokens ?? 0;
            completionTokens = chunk.usage.completion_tokens ?? 0;
            totalTokens =
              chunk.usage.total_tokens ?? promptTokens + completionTokens;
          }

          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (!delta) continue;

          if (ttftMs === 0) {
            ttftMs = Date.now() - requestStartedAt;
          }

          const guardCheck = outputGuard.inspectChunk(delta);
          if (!guardCheck.safe) {
            abortedByOutputGuard = true;
            controller.enqueue(
              buildSseEvent("guardrail_abort", {
                content: outputGuardRefusal,
                reason: guardCheck.reason,
              })
            );
            break;
          }

          fullAnswer += delta;
          controller.enqueue(buildSseEvent("token", { content: delta }));
        }

        const latencyMs = Date.now() - requestStartedAt;
        const estimatedCostUsd = calculateCostUsd({
          model: primaryModel,
          promptTokens,
          cachedTokens,
          completionTokens,
        });

        if (abortedByOutputGuard) {
          const reason =
            outputGuard.getReason() || "Output canary guardrail triggered.";
          const alertMsg = await prisma.message.create({
            data: {
              userId,
              role: "system_alert",
              content: outputGuardRefusal,
            },
          });

          await Promise.all([
            prisma.usageLog.create({
              data: {
                userId,
                model: primaryModel,
                promptTokens,
                cachedTokens,
                completionTokens,
                totalTokens,
                estimatedCostUsd,
                latencyMs,
                status: QueryStatus.BLOCKED_INJECTION,
                guardrailReason: `[L4_OUTPUT_CANARY] ${reason}`,
                flaggedText: sanitizeAuditSnippet(query),
                hourOfDay,
                dayOfWeek,
              },
            }),
            sysLogger.error(
              "guardrail.layer4.output",
              `BLOCKED_INJECTION (Stream Aborted by Output Canary): ${reason}`,
              {
                userId,
                username: session.user.username,
                meta: {
                  decision: "BLOCKED_INJECTION",
                  layer: "Layer 4 (Streaming Output Canary Filter)",
                  model: primaryModel,
                  reason,
                  queryLanguage: lang,
                  queryPreview: sanitizeAuditSnippet(query, 200),
                  partialOutputChars: fullAnswer.length,
                  latencyMs,
                },
              }
            ),
          ]);

          controller.enqueue(
            buildSseEvent("done", {
              messageId: alertMsg.id,
              aborted: true,
              citations: [],
              usage: {
                promptTokens,
                cachedTokens,
                completionTokens,
                estimatedCostUsd,
                latencyMs,
                ttftMs,
              },
            })
          );
        } else {
          const finalContent = fullAnswer.trim() || mandatoryRefusal;
          const isRefusal = isMandatoryRefusal(finalContent);
          const citations = isRefusal
            ? []
            : extractCitationsFromAnswer(finalContent, orderedSources);

          let noContextReason: string | null = null;
          if (isRefusal) {
            const overlap = analyzeContextOverlap(query, orderedSources);
            const cause = fullAnswer.trim()
              ? "MODEL_GROUNDED_REFUSAL"
              : "EMPTY_MODEL_RESPONSE";
            noContextReason = `[${cause}] Checked ${orderedSources.length} source(s) (${overlap.totalSourceTokens.toLocaleString()} tok); ${overlap.matchedKeywords.length}/${overlap.queryKeywords.length} query keywords matched (${overlap.overlapPercent}%). Missing: ${overlap.missingKeywords.slice(0, 6).join(", ") || "none"}`;

            await sysLogger.warn(
              "chat.no_context",
              `NO_CONTEXT_FOUND (${cause}): ${overlap.matchedKeywords.length}/${overlap.queryKeywords.length} keywords matched across ${orderedSources.length} active source(s).`,
              {
                userId,
                username: session.user.username,
                meta: {
                  decision: "NO_CONTEXT_FOUND",
                  cause,
                  model: primaryModel,
                  queryLanguage: lang,
                  queryPreview: sanitizeAuditSnippet(query, 200),
                  activeSourcesCount: orderedSources.length,
                  activeSourceNames: orderedSources.map((s) => s.filename),
                  activeContextTokens: overlap.totalSourceTokens,
                  queryKeywords: overlap.queryKeywords,
                  matchedKeywordsInSources: overlap.matchedKeywords,
                  missingKeywordsFromSources: overlap.missingKeywords,
                  keywordOverlapPercent: overlap.overlapPercent,
                  latencyMs,
                },
              }
            );
          }

          const savedMsg = await prisma.message.create({
            data: {
              userId,
              role: "assistant",
              content: finalContent,
              citations:
                citations.length > 0
                  ? (citations as unknown as object)
                  : undefined,
            },
          });

          await prisma.usageLog.create({
            data: {
              userId,
              model: primaryModel,
              promptTokens,
              cachedTokens,
              completionTokens,
              totalTokens,
              estimatedCostUsd,
              latencyMs,
              status: isRefusal
                ? QueryStatus.NO_CONTEXT_FOUND
                : QueryStatus.SUCCESS,
              guardrailReason: noContextReason,
              flaggedText: null,
              hourOfDay,
              dayOfWeek,
            },
          });

          controller.enqueue(
            buildSseEvent("done", {
              messageId: savedMsg.id,
              citations,
              usage: {
                promptTokens,
                cachedTokens,
                completionTokens,
                estimatedCostUsd,
                latencyMs,
                ttftMs,
              },
            })
          );
        }
      } catch (err) {
        const latencyMs = Date.now() - requestStartedAt;
        const message =
          err instanceof Error ? err.message : "OpenAI streaming request failed.";

        await sysLogger.error("api.chat.stream", message, {
          error: err,
          userId,
          username: session.user.username,
          meta: { model: primaryModel, latencyMs },
        });

        await prisma.usageLog
          .create({
            data: {
              userId,
              model: primaryModel,
              promptTokens,
              cachedTokens,
              completionTokens,
              totalTokens,
              estimatedCostUsd: 0,
              latencyMs,
              status: QueryStatus.ERROR,
              guardrailReason: null,
              flaggedText: null,
              hourOfDay,
              dayOfWeek,
            },
          })
          .catch(() => {});

        controller.enqueue(buildSseEvent("error", { error: message }));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
