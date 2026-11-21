import { NextResponse } from "next/server";
import { LogLevel, QueryStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePdfDomPolyfills } from "@/lib/domMatrixPolyfill";
import { ensureDeveloperSchemaBootstrapped } from "@/lib/logger";
import { isGoogleOAuthConfigured } from "@/lib/auth.config";
import { getModelRate } from "@/lib/pricing";
import {
  getActivePrimaryModelInfo,
  getAvailableModels,
} from "@/lib/modelConfig";

export const runtime = "nodejs";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx];
}

function classifyFileType(filename: string, mimeType: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot >= 0 && dot < filename.length - 1) {
    const ext = filename.slice(dot + 1).toUpperCase().trim();
    if (ext && ext.length <= 6) return ext;
  }
  const m = mimeType.toLowerCase();
  if (m.includes("pdf")) return "PDF";
  if (m.includes("wordprocessingml") || m.includes("msword")) return "DOCX";
  if (m.includes("csv")) return "CSV";
  if (m.includes("markdown")) return "MD";
  if (m.includes("text/plain")) return "TXT";
  return "OTHER";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.DEVELOPER &&
    session.user.role !== Role.ADMIN
  ) {
    return NextResponse.json(
      { error: "Forbidden: Developer access required." },
      { status: 403 }
    );
  }

  const dbCheckStarted = performance.now();
  const polyfills = ensurePdfDomPolyfills();
  await ensureDeveloperSchemaBootstrapped();

  const [
    users,
    documents,
    usageLogs,
    systemLogs,
    userMessages,
    totalMessageCount,
    activeModelInfo,
  ] = await Promise.all([
    prisma.user.findMany({
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        provider: true,
        isBlocked: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.document.findMany({
      select: {
        id: true,
        userId: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        tokenCount: true,
        isSelected: true,
        createdAt: true,
      },
    }),
    prisma.usageLog.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        model: true,
        promptTokens: true,
        cachedTokens: true,
        completionTokens: true,
        totalTokens: true,
        estimatedCostUsd: true,
        latencyMs: true,
        status: true,
        guardrailReason: true,
        flaggedText: true,
        hourOfDay: true,
        dayOfWeek: true,
        createdAt: true,
      },
    }),
    prisma.systemLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 150,
    }),
    prisma.message.findMany({
      where: { role: "user" },
      orderBy: { createdAt: "desc" },
      take: 400,
      select: {
        id: true,
        userId: true,
        content: true,
        createdAt: true,
      },
    }),
    prisma.message.count(),
    getActivePrimaryModelInfo(),
  ]);

  const dbPingMs = Math.round(performance.now() - dbCheckStarted);

  // Latency percentiles
  const latencies = usageLogs
    .map((l) => l.latencyMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  const p50LatencyMs = percentile(latencies, 50);
  const p95LatencyMs = percentile(latencies, 95);
  const p99LatencyMs = percentile(latencies, 99);
  const avgLatencyMs =
    latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

  // Token & Cost Economics (Actual vs Uncached Savings)
  let totalPromptTokens = 0;
  let totalCachedTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let actualCostUsd = 0;
  let uncachedBaselineCostUsd = 0;

  const modelMap = new Map<
    string,
    {
      model: string;
      calls: number;
      errors: number;
      promptTokens: number;
      cachedTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
      totalLatencyMs: number;
    }
  >();

  const statusCounts: Record<string, number> = {
    SUCCESS: 0,
    NO_CONTEXT_FOUND: 0,
    BLOCKED_INJECTION: 0,
    BLOCKED_OUT_OF_SCOPE: 0,
    ERROR: 0,
  };

  const usernameById = new Map<string, string>(
    users.map((u) => [u.id, u.username])
  );

  // Per-user usage aggregation for analytics charts
  const userUsageMap = new Map<
    string,
    {
      username: string;
      total: number;
      success: number;
      noContext: number;
      blocked: number;
      errors: number;
      totalTokens: number;
      tokenCalls: number;
    }
  >();

  for (const u of users) {
    userUsageMap.set(u.id, {
      username: u.username,
      total: 0,
      success: 0,
      noContext: 0,
      blocked: 0,
      errors: 0,
      totalTokens: 0,
      tokenCalls: 0,
    });
  }

  let tokenBearingCalls = 0;
  let tokenBearingSum = 0;

  for (const log of usageLogs) {
    totalPromptTokens += log.promptTokens;
    totalCachedTokens += log.cachedTokens;
    totalCompletionTokens += log.completionTokens;
    totalTokens += log.totalTokens;
    actualCostUsd += log.estimatedCostUsd;

    if (log.totalTokens > 0) {
      tokenBearingCalls += 1;
      tokenBearingSum += log.totalTokens;
    }

    const rate = getModelRate(log.model);
    uncachedBaselineCostUsd +=
      (log.promptTokens / 1_000_000) * rate.inputPer1M +
      (log.completionTokens / 1_000_000) * rate.outputPer1M;

    statusCounts[log.status] = (statusCounts[log.status] ?? 0) + 1;

    const entry = modelMap.get(log.model) ?? {
      model: log.model,
      calls: 0,
      errors: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      costUsd: 0,
      totalLatencyMs: 0,
    };
    entry.calls += 1;
    if (log.status === QueryStatus.ERROR) entry.errors += 1;
    entry.promptTokens += log.promptTokens;
    entry.cachedTokens += log.cachedTokens;
    entry.completionTokens += log.completionTokens;
    entry.totalTokens += log.totalTokens;
    entry.costUsd += log.estimatedCostUsd;
    entry.totalLatencyMs += log.latencyMs;
    modelMap.set(log.model, entry);

    const uStats = userUsageMap.get(log.userId) ?? {
      username: usernameById.get(log.userId) ?? "unknown",
      total: 0,
      success: 0,
      noContext: 0,
      blocked: 0,
      errors: 0,
      totalTokens: 0,
      tokenCalls: 0,
    };
    uStats.total += 1;
    if (log.status === QueryStatus.SUCCESS) uStats.success += 1;
    else if (log.status === QueryStatus.NO_CONTEXT_FOUND) uStats.noContext += 1;
    else if (
      log.status === QueryStatus.BLOCKED_INJECTION ||
      log.status === QueryStatus.BLOCKED_OUT_OF_SCOPE
    ) {
      uStats.blocked += 1;
    } else if (log.status === QueryStatus.ERROR) uStats.errors += 1;
    if (log.totalTokens > 0) {
      uStats.totalTokens += log.totalTokens;
      uStats.tokenCalls += 1;
    }
    userUsageMap.set(log.userId, uStats);
  }

  const savedByCacheUsd = Math.max(0, uncachedBaselineCostUsd - actualCostUsd);
  const cacheHitRatePercent =
    totalPromptTokens > 0
      ? Math.round((totalCachedTokens / totalPromptTokens) * 100)
      : 0;

  // Document format distribution, per-type counts, per-user counts & anomaly detection
  const formatBreakdown: Record<
    string,
    { count: number; bytes: number; tokens: number }
  > = {};
  const fileTypeMap = new Map<
    string,
    { type: string; count: number; bytes: number; tokens: number }
  >();
  const filesByUserMap = new Map<
    string,
    { username: string; count: number; bytes: number }
  >();

  for (const u of users) {
    filesByUserMap.set(u.id, { username: u.username, count: 0, bytes: 0 });
  }

  let corruptedOrEmptyDocs = 0;
  let totalStorageBytes = 0;
  let totalDocumentTokens = 0;
  const activeTokensByUser = new Map<string, number>();

  for (const doc of documents) {
    totalStorageBytes += doc.sizeBytes;
    totalDocumentTokens += doc.tokenCount;
    if (doc.tokenCount <= 0 || doc.sizeBytes <= 0) {
      corruptedOrEmptyDocs += 1;
    }
    if (doc.isSelected) {
      activeTokensByUser.set(
        doc.userId,
        (activeTokensByUser.get(doc.userId) ?? 0) + doc.tokenCount
      );
    }

    const bucket = formatBreakdown[doc.mimeType] ?? {
      count: 0,
      bytes: 0,
      tokens: 0,
    };
    bucket.count += 1;
    bucket.bytes += doc.sizeBytes;
    bucket.tokens += doc.tokenCount;
    formatBreakdown[doc.mimeType] = bucket;

    const extType = classifyFileType(doc.filename, doc.mimeType);
    const typeBucket = fileTypeMap.get(extType) ?? {
      type: extType,
      count: 0,
      bytes: 0,
      tokens: 0,
    };
    typeBucket.count += 1;
    typeBucket.bytes += doc.sizeBytes;
    typeBucket.tokens += doc.tokenCount;
    fileTypeMap.set(extType, typeBucket);

    const userFiles = filesByUserMap.get(doc.userId) ?? {
      username: usernameById.get(doc.userId) ?? "unknown",
      count: 0,
      bytes: 0,
    };
    userFiles.count += 1;
    userFiles.bytes += doc.sizeBytes;
    filesByUserMap.set(doc.userId, userFiles);
  }

  const usersOverTokenCap = Array.from(activeTokensByUser.values()).filter(
    (tok) => tok > 150_000
  ).length;

  const errorsCount = systemLogs.filter(
    (l) => l.level === LogLevel.ERROR || l.level === LogLevel.CRITICAL
  ).length;

  // Build quick lookup structures to recover the exact user message that triggered each decision
  const systemLogsByUser = new Map<
    string,
    Array<{ createdAtMs: number; queryPreview: string }>
  >();
  for (const sl of systemLogs) {
    if (!sl.userId || !sl.meta || typeof sl.meta !== "object") continue;
    const metaObj = sl.meta as Record<string, unknown>;
    const preview =
      typeof metaObj.queryPreview === "string"
        ? metaObj.queryPreview.trim()
        : "";
    if (!preview) continue;
    const arr = systemLogsByUser.get(sl.userId) ?? [];
    arr.push({ createdAtMs: sl.createdAt.getTime(), queryPreview: preview });
    systemLogsByUser.set(sl.userId, arr);
  }

  const messagesByUser = new Map<
    string,
    Array<{ createdAtMs: number; content: string }>
  >();
  for (const msg of userMessages) {
    const arr = messagesByUser.get(msg.userId) ?? [];
    arr.push({ createdAtMs: msg.createdAt.getTime(), content: msg.content });
    messagesByUser.set(msg.userId, arr);
  }

  function findTriggeredUserMessage(
    userId: string,
    logCreatedAt: Date,
    flaggedText: string | null
  ): string | null {
    if (flaggedText && flaggedText.trim()) return flaggedText.trim();

    const logMs = logCreatedAt.getTime();

    // 1. Check matching SystemLog.meta.queryPreview within ±10 seconds
    const userSysLogs = systemLogsByUser.get(userId);
    if (userSysLogs) {
      let bestPreview: string | null = null;
      let bestDelta = 10_000;
      for (const entry of userSysLogs) {
        const delta = Math.abs(entry.createdAtMs - logMs);
        if (delta <= bestDelta) {
          bestDelta = delta;
          bestPreview = entry.queryPreview;
        }
      }
      if (bestPreview) return bestPreview;
    }

    // 2. Fallback to nearest user Message created shortly before the UsageLog (within 90s before to 5s after)
    const userMsgs = messagesByUser.get(userId);
    if (userMsgs) {
      let bestMsg: string | null = null;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const m of userMsgs) {
        const diff = logMs - m.createdAtMs; // positive means message came before usageLog
        if (diff >= -5000 && diff <= 90_000) {
          const score = Math.abs(diff);
          if (score < bestScore) {
            bestScore = score;
            bestMsg = m.content;
          }
        }
      }
      if (bestMsg) return bestMsg;
    }

    return null;
  }

  const decisionLogs = usageLogs
    .filter((l) => l.status !== QueryStatus.SUCCESS)
    .slice(0, 80)
    .map((l) => ({
      id: l.id,
      userId: l.userId,
      username: usernameById.get(l.userId) ?? "unknown",
      status: l.status,
      model: l.model,
      reason: l.guardrailReason,
      flaggedText: l.flaggedText,
      userMessage: findTriggeredUserMessage(
        l.userId,
        l.createdAt,
        l.flaggedText
      ),
      promptTokens: l.promptTokens,
      latencyMs: l.latencyMs,
      createdAt: l.createdAt.toISOString(),
    }));

  const modelsArray = Array.from(modelMap.values()).map((m) => ({
    ...m,
    costUsd: Number(m.costUsd.toFixed(6)),
    avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
  }));

  const totalEvents = usageLogs.length;
  const overallSuccessRatePct =
    totalEvents > 0
      ? Number(((statusCounts.SUCCESS / totalEvents) * 100).toFixed(1))
      : 0;
  const avgFilesPerUser =
    users.length > 0
      ? Number((documents.length / users.length).toFixed(2))
      : 0;
  const avgTokensPerQuestionOverall =
    tokenBearingCalls > 0 ? Math.round(tokenBearingSum / tokenBearingCalls) : 0;

  const analytics = {
    filesByType: Array.from(fileTypeMap.values()).sort(
      (a, b) => b.count - a.count
    ),
    avgFilesPerUser,
    filesPerUser: Array.from(filesByUserMap.values()).sort(
      (a, b) => b.count - a.count
    ),
    avgTokensPerQuestionOverall,
    avgTokensPerQuestionByModel: modelsArray
      .filter((m) => m.calls > 0 && m.totalTokens > 0)
      .map((m) => ({
        model: m.model,
        avgTokens: Math.round(m.totalTokens / m.calls),
        avgPromptTokens: Math.round(m.promptTokens / m.calls),
        avgCompletionTokens: Math.round(m.completionTokens / m.calls),
        calls: m.calls,
      }))
      .sort((a, b) => b.avgTokens - a.avgTokens),
    avgTokensPerQuestionByUser: Array.from(userUsageMap.values())
      .filter((u) => u.tokenCalls > 0)
      .map((u) => ({
        username: u.username,
        avgTokens: Math.round(u.totalTokens / u.tokenCalls),
        calls: u.tokenCalls,
      }))
      .sort((a, b) => b.avgTokens - a.avgTokens),
    overallSuccessRatePct,
    outcomeBreakdown: Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
      pct:
        totalEvents > 0 ? Number(((count / totalEvents) * 100).toFixed(1)) : 0,
    })),
    successRateByUser: Array.from(userUsageMap.values())
      .filter((u) => u.total > 0)
      .map((u) => ({
        username: u.username,
        total: u.total,
        success: u.success,
        noContext: u.noContext,
        blocked: u.blocked,
        errors: u.errors,
        successRatePct: Number(((u.success / u.total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.total - a.total),
    avgLatencySecByModel: modelsArray
      .filter((m) => m.calls > 0 && m.avgLatencyMs > 0)
      .map((m) => ({
        model: m.model,
        avgLatencySec: Number((m.avgLatencyMs / 1000).toFixed(2)),
        calls: m.calls,
      }))
      .sort((a, b) => b.avgLatencySec - a.avgLatencySec),
    costByModel: modelsArray
      .filter((m) => m.calls > 0)
      .map((m) => ({
        model: m.model,
        costUsd: m.costUsd,
        calls: m.calls,
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };

  const mem = process.memoryUsage();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health: {
      dbConnected: true,
      dbPingMs,
      openAiConfigured: Boolean((process.env.OPENAI_API_KEY ?? "").trim()),
      primaryModel: activeModelInfo.model,
      modelUpdatedBy: activeModelInfo.updatedBy,
      modelUpdatedAt: activeModelInfo.updatedAt,
      availableModels: getAvailableModels(),
      guardrailModel: process.env.OPENAI_GUARDRAIL_MODEL || "gpt-5-nano",
      googleOAuthConfigured: isGoogleOAuthConfigured,
      authSecretConfigured: Boolean(
        process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET
      ),
      domMatrixPolyfillActive: polyfills.domMatrixInstalled,
      imageDataPolyfillActive: polyfills.imageDataInstalled,
      path2DPolyfillActive: polyfills.path2DInstalled,
      nodeVersion: process.version,
      platform: process.platform,
      uptimeSeconds: Math.round(process.uptime()),
      rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
      heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
    },
    anomalies: {
      errorsCount,
      failedQueryLogsCount: statusCounts.ERROR ?? 0,
      corruptedOrEmptyDocs,
      usersOverTokenCap,
      blockedUsersCount: users.filter((u) => u.isBlocked).length,
    },
    economics: {
      totalEvents,
      totalMessages: totalMessageCount,
      totalPromptTokens,
      totalCachedTokens,
      totalCompletionTokens,
      totalTokens,
      cacheHitRatePercent,
      actualCostUsd: Number(actualCostUsd.toFixed(6)),
      uncachedBaselineCostUsd: Number(uncachedBaselineCostUsd.toFixed(6)),
      savedByCacheUsd: Number(savedByCacheUsd.toFixed(6)),
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      statusCounts,
    },
    models: modelsArray,
    storage: {
      totalUsers: users.length,
      totalDocuments: documents.length,
      totalStorageBytes,
      totalDocumentTokens,
      formatBreakdown,
    },
    analytics,
    decisionLogs,
    systemLogs: systemLogs.map((l) => ({
      id: l.id,
      level: l.level,
      source: l.source,
      message: l.message,
      stack: l.stack,
      meta: l.meta,
      userId: l.userId,
      username: l.username,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
