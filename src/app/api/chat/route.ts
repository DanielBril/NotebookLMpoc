import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { QueryStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCostUsd } from "@/lib/pricing";
import {
  generateNonce,
  inspectUserInput,
  sanitizeAuditSnippet,
  shouldRunMicroClassifier,
} from "@/lib/guardrails/inputFilter";
import {
  assembleSandboxedContext,
  buildGroundedSystemPrompt,
  MANDATORY_REFUSAL,
  orderSourcesDeterministically,
  type OrderedSource,
  wrapUserQuery,
} from "@/lib/guardrails/systemPrompt";
import {
  createOutputGuardFilter,
  OUTPUT_GUARD_SAFE_REFUSAL,
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

    // Pick a clean excerpt from the cited document
    const snippet =
      src.extractedText.length > 360
        ? `${src.extractedText.slice(0, 360).trim()}…`
        : src.extractedText;

    citations.push({
      index: src.index,
      documentId: src.id,
      filename: src.filename,
      snippet,
    });
  }

  return citations;
}

function buildSseEvent(event: string, payload: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const requestStartedAt = Date.now();
  const now = new Date();
  const hourOfDay = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();
  const userId = session.user.id;
  const primaryModel = process.env.OPENAI_PRIMARY_MODEL || "gpt-6-luna";

  let body: { query?: string };
  try {
    body = (await req.json()) as { query?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const query = (body.query ?? "").trim();
  if (!query) {
    return NextResponse.json({ error: "Query cannot be empty." }, { status: 400 });
  }
  if (query.length > MAX_QUERY_CHARS) {
    return NextResponse.json(
      { error: `Query exceeds maximum length of ${MAX_QUERY_CHARS} characters.` },
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
  const layer1 = inspectUserInput(query);
  if (layer1.blocked && layer1.status) {
    const latencyMs = Date.now() - requestStartedAt;
    const alertContent = `Guardrail Blocked (${layer1.layer}): ${layer1.reason}`;

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
          status:
            layer1.status === "BLOCKED_INJECTION"
              ? QueryStatus.BLOCKED_INJECTION
              : QueryStatus.BLOCKED_OUT_OF_SCOPE,
          guardrailReason: `[${layer1.rule}] ${layer1.reason} | Snippet: "${layer1.sanitizedSnippet}"`,
          hourOfDay,
          dayOfWeek,
        },
      }),
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
    await prisma.message.create({
      data: { userId, role: "user", content: query },
    });
    const refusalMsg = await prisma.message.create({
      data: {
        userId,
        role: "assistant",
        content: MANDATORY_REFUSAL,
      },
    });
    await prisma.usageLog.create({
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
        hourOfDay,
        dayOfWeek,
      },
    });

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(buildSseEvent("token", { content: MANDATORY_REFUSAL }));
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

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "OPENAI_API_KEY is not configured on the server. Add your OpenAI API key in environment variables.",
      },
      { status: 503 }
    );
  }

  const openai = new OpenAI({ apiKey });

  // ---------------------------------------------------------------------------
  // LAYER 4 (Pre-Synthesis): Fast Micro-Classifier (gpt-5-nano) on borderline queries
  // ---------------------------------------------------------------------------
  if (shouldRunMicroClassifier(query)) {
    const cls = await runMicroClassifier(openai, query);
    if (cls.isInjection || cls.isGenerativeOutOfScope) {
      const status = cls.isInjection
        ? QueryStatus.BLOCKED_INJECTION
        : QueryStatus.BLOCKED_OUT_OF_SCOPE;
      const alertContent = `Guardrail Blocked (Layer 4 Micro-Classifier): ${cls.reason}`;

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
            latencyMs: Date.now() - requestStartedAt,
            status,
            guardrailReason: `[L4_MICRO_CLASSIFIER] ${cls.reason} | Snippet: "${sanitizeAuditSnippet(query)}"`,
            hourOfDay,
            dayOfWeek,
          },
        }),
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
  const systemPrompt = buildGroundedSystemPrompt(nonce);
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
        // Send ordered source index map immediately so client can resolve citations live
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

          // LAYER 4 Output Canary & System-Tag Leakage Check
          const guardCheck = outputGuard.inspectChunk(delta);
          if (!guardCheck.safe) {
            abortedByOutputGuard = true;
            controller.enqueue(
              buildSseEvent("guardrail_abort", {
                content: OUTPUT_GUARD_SAFE_REFUSAL,
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
              content: OUTPUT_GUARD_SAFE_REFUSAL,
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
              status: QueryStatus.BLOCKED_INJECTION,
              guardrailReason: `[L4_OUTPUT_CANARY] ${reason} | Snippet: "${sanitizeAuditSnippet(query)}"`,
              hourOfDay,
              dayOfWeek,
            },
          });

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
          const finalContent = fullAnswer.trim() || MANDATORY_REFUSAL;
          const isRefusal = finalContent.includes(
            "I could not find the answer to that question in your uploaded sources"
          );
          const citations = isRefusal
            ? []
            : extractCitationsFromAnswer(finalContent, orderedSources);

          const savedMsg = await prisma.message.create({
            data: {
              userId,
              role: "assistant",
              content: finalContent,
              citations: citations.length > 0 ? (citations as unknown as object) : undefined,
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
              guardrailReason: message.slice(0, 240),
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
