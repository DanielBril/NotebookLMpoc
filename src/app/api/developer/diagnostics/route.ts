import { NextResponse } from "next/server";
import { LogLevel, QueryStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePdfDomPolyfills } from "@/lib/domMatrixPolyfill";
import { ensureDeveloperSchemaBootstrapped } from "@/lib/logger";
import { isGoogleOAuthConfigured } from "@/lib/auth.config";
import { MODEL_PRICING } from "@/lib/pricing";

export const runtime = "nodejs";

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx];
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

  const [users, documents, usageLogs, systemLogs, totalMessageCount] =
    await Promise.all([
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
        take: 120,
      }),
      prisma.message.count(),
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

  for (const log of usageLogs) {
    totalPromptTokens += log.promptTokens;
    totalCachedTokens += log.cachedTokens;
    totalCompletionTokens += log.completionTokens;
    totalTokens += log.totalTokens;
    actualCostUsd += log.estimatedCostUsd;

    const rate =
      MODEL_PRICING[log.model.toLowerCase()] ?? MODEL_PRICING["gpt-6-luna"];
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
  }

  const savedByCacheUsd = Math.max(0, uncachedBaselineCostUsd - actualCostUsd);
  const cacheHitRatePercent =
    totalPromptTokens > 0
      ? Math.round((totalCachedTokens / totalPromptTokens) * 100)
      : 0;

  // Document format distribution & anomaly detection
  const formatBreakdown: Record<string, { count: number; bytes: number; tokens: number }> =
    {};
  let corruptedOrEmptyDocs = 0;
  let totalStorageBytes = 0;
  let totalDocumentTokens = 0;

  // Detect users whose active tokens exceed the 150k cap
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
  }

  const usersOverTokenCap = Array.from(activeTokensByUser.values()).filter(
    (tok) => tok > 150_000
  ).length;

  const unresolvedErrorsCount = systemLogs.filter(
    (l) =>
      !l.resolved &&
      (l.level === LogLevel.ERROR || l.level === LogLevel.CRITICAL)
  ).length;

  const usernameById = new Map<string, string>(
    users.map((u) => [u.id, u.username])
  );

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
      promptTokens: l.promptTokens,
      latencyMs: l.latencyMs,
      createdAt: l.createdAt.toISOString(),
    }));

  const mem = process.memoryUsage();

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    health: {
      dbConnected: true,
      dbPingMs,
      openAiConfigured: Boolean((process.env.OPENAI_API_KEY ?? "").trim()),
      primaryModel: process.env.OPENAI_PRIMARY_MODEL || "gpt-4o-mini",
      guardrailModel: process.env.OPENAI_GUARDRAIL_MODEL || "gpt-4o-mini",
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
      unresolvedErrorsCount,
      failedQueryLogsCount: statusCounts.ERROR ?? 0,
      corruptedOrEmptyDocs,
      usersOverTokenCap,
      blockedUsersCount: users.filter((u) => u.isBlocked).length,
    },
    economics: {
      totalEvents: usageLogs.length,
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
    models: Array.from(modelMap.values()).map((m) => ({
      ...m,
      costUsd: Number(m.costUsd.toFixed(6)),
      avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
    })),
    storage: {
      totalUsers: users.length,
      totalDocuments: documents.length,
      totalStorageBytes,
      totalDocumentTokens,
      formatBreakdown,
    },
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
      resolved: l.resolved,
      createdAt: l.createdAt.toISOString(),
    })),
  });
}
