import { NextResponse } from "next/server";
import { QueryStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getModelRate } from "@/lib/pricing";
import {
  getActivePrimaryModelInfo,
  getAvailableModels,
} from "@/lib/modelConfig";

export const runtime = "nodejs";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length))
  );
  return sorted[idx];
}

function classifyMimeType(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("pdf")) return "PDF";
  if (m.includes("wordprocessingml") || m.includes("msword")) return "DOCX";
  if (m.includes("csv")) return "CSV";
  if (m.includes("markdown")) return "MD";
  if (m.includes("text/plain")) return "TXT";
  return "OTHER";
}

/**
 * Extracts a legacy snippet if an older BLOCKED_INJECTION row encoded
 * `| Snippet: "..."` inside guardrailReason before flaggedText existed.
 */
function extractLegacyFlaggedText(guardrailReason: string | null): {
  ruleReason: string;
  legacyText: string | null;
} {
  if (!guardrailReason) {
    return {
      ruleReason: "Flagged as dangerous by security guardrails",
      legacyText: null,
    };
  }
  const match = guardrailReason.match(/^(.*?)\s*\|\s*Snippet:\s*"([\s\S]*)"$/);
  if (match) {
    return {
      ruleReason: match[1].trim(),
      legacyText: match[2].trim() || null,
    };
  }
  return { ruleReason: guardrailReason, legacyText: null };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.ADMIN &&
    session.user.role !== Role.DEVELOPER
  ) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // PRIVACY GUARANTEE:
  // - Never query prisma.message (users' chat texts are inaccessible to admins).
  // - Never select Document.extractedText or Document.filename (only numeric quota & mimeType metadata).
  // - Expose flaggedText ONLY for rows flagged as dangerous (QueryStatus.BLOCKED_INJECTION).
  const [users, documents, usageLogs, activeModelInfo] = await Promise.all([
    prisma.user.findMany({
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        provider: true,
        isBlocked: true,
        blockedAt: true,
        blockedReason: true,
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
    getActivePrimaryModelInfo(),
  ]);

  const userMap = new Map<
    string,
    { username: string; isBlocked: boolean; role: Role }
  >();
  for (const u of users) {
    userMap.set(u.id, {
      username: u.username,
      isBlocked: u.isBlocked,
      role: u.role,
    });
  }

  // Aggregate documents per user & per file type (counts, mimeType & sizes only — zero filenames/text)
  const docsByUser = new Map<
    string,
    { activeFiles: number; totalFiles: number; totalBytes: number }
  >();
  const fileTypeMap = new Map<
    string,
    { type: string; count: number; bytes: number; tokens: number }
  >();
  const filesByUserAnalytics = new Map<
    string,
    { username: string; count: number; bytes: number }
  >();
  for (const u of users) {
    filesByUserAnalytics.set(u.id, {
      username: u.username,
      count: 0,
      bytes: 0,
    });
  }

  let totalStorageBytes = 0;

  for (const doc of documents) {
    totalStorageBytes += doc.sizeBytes;
    const entry = docsByUser.get(doc.userId) ?? {
      activeFiles: 0,
      totalFiles: 0,
      totalBytes: 0,
    };
    entry.totalFiles += 1;
    if (doc.isSelected) entry.activeFiles += 1;
    entry.totalBytes += doc.sizeBytes;
    docsByUser.set(doc.userId, entry);

    const extType = classifyMimeType(doc.mimeType);
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

    const uf = filesByUserAnalytics.get(doc.userId) ?? {
      username: userMap.get(doc.userId)?.username ?? "unknown",
      count: 0,
      bytes: 0,
    };
    uf.count += 1;
    uf.bytes += doc.sizeBytes;
    filesByUserAnalytics.set(doc.userId, uf);
  }

  let totalPromptTokens = 0;
  let totalCachedTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let uncachedBaselineCostUsd = 0;
  let totalLatencyMs = 0;
  let latencySamples = 0;
  let dangerousFlags = 0;
  let validQueries = 0;
  let tokenBearingCalls = 0;
  let tokenBearingSum = 0;

  const statusCounts: Record<string, number> = {
    SUCCESS: 0,
    NO_CONTEXT_FOUND: 0,
    BLOCKED_INJECTION: 0,
    BLOCKED_OUT_OF_SCOPE: 0,
    ERROR: 0,
  };

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

  const userOutcomeMap = new Map<
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
    userOutcomeMap.set(u.id, {
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

  const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${hour.toString().padStart(2, "0")}:00`,
    queries: 0,
    tokens: 0,
    isPeak: false,
  }));

  const dayBuckets = Array.from({ length: 7 }, (_, idx) => ({
    dayIndex: idx,
    day: DAY_LABELS[idx],
    queries: 0,
    tokens: 0,
    totalLatencyMs: 0,
    latencyCount: 0,
  }));

  const usageByUser = new Map<
    string,
    {
      validQueries: number;
      dangerousFlags: number;
      promptTokens: number;
      cachedTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }
  >();

  // ONLY texts flagged as dangerous (BLOCKED_INJECTION) are included here.
  const flaggedDangerousFeed: Array<{
    id: string;
    createdAt: string;
    userId: string;
    username: string;
    userRole: Role;
    isUserBlocked: boolean;
    ruleReason: string;
    flaggedText: string;
    model: string;
    latencyMs: number;
  }> = [];

  for (const log of usageLogs) {
    totalPromptTokens += log.promptTokens;
    totalCachedTokens += log.cachedTokens;
    totalCompletionTokens += log.completionTokens;
    totalTokens += log.totalTokens;
    totalCostUsd += log.estimatedCostUsd;

    if (log.totalTokens > 0) {
      tokenBearingCalls += 1;
      tokenBearingSum += log.totalTokens;
    }

    const rate = getModelRate(log.model);
    uncachedBaselineCostUsd +=
      (log.promptTokens / 1_000_000) * rate.inputPer1M +
      (log.completionTokens / 1_000_000) * rate.outputPer1M;

    statusCounts[log.status] = (statusCounts[log.status] ?? 0) + 1;

    const mEntry = modelMap.get(log.model) ?? {
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
    mEntry.calls += 1;
    if (log.status === QueryStatus.ERROR) mEntry.errors += 1;
    mEntry.promptTokens += log.promptTokens;
    mEntry.cachedTokens += log.cachedTokens;
    mEntry.completionTokens += log.completionTokens;
    mEntry.totalTokens += log.totalTokens;
    mEntry.costUsd += log.estimatedCostUsd;
    mEntry.totalLatencyMs += log.latencyMs;
    modelMap.set(log.model, mEntry);

    const uOut = userOutcomeMap.get(log.userId) ?? {
      username: userMap.get(log.userId)?.username ?? "unknown",
      total: 0,
      success: 0,
      noContext: 0,
      blocked: 0,
      errors: 0,
      totalTokens: 0,
      tokenCalls: 0,
    };
    uOut.total += 1;
    if (log.status === QueryStatus.SUCCESS) uOut.success += 1;
    else if (log.status === QueryStatus.NO_CONTEXT_FOUND) uOut.noContext += 1;
    else if (
      log.status === QueryStatus.BLOCKED_INJECTION ||
      log.status === QueryStatus.BLOCKED_OUT_OF_SCOPE
    ) {
      uOut.blocked += 1;
    } else if (log.status === QueryStatus.ERROR) uOut.errors += 1;
    if (log.totalTokens > 0) {
      uOut.totalTokens += log.totalTokens;
      uOut.tokenCalls += 1;
    }
    userOutcomeMap.set(log.userId, uOut);

    const isDangerous = log.status === QueryStatus.BLOCKED_INJECTION;

    if (isDangerous) {
      dangerousFlags += 1;
      if (flaggedDangerousFeed.length < 30) {
        const userMeta = userMap.get(log.userId);
        const { ruleReason, legacyText } = extractLegacyFlaggedText(
          log.guardrailReason
        );
        const text = log.flaggedText ?? legacyText ?? "—";
        flaggedDangerousFeed.push({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          userId: log.userId,
          username: userMeta?.username ?? "unknown",
          userRole: userMeta?.role ?? Role.USER,
          isUserBlocked: userMeta?.isBlocked ?? false,
          ruleReason,
          flaggedText: text,
          model: log.model,
          latencyMs: log.latencyMs,
        });
      }
    } else if (
      log.status === QueryStatus.SUCCESS ||
      log.status === QueryStatus.NO_CONTEXT_FOUND
    ) {
      validQueries += 1;
    }

    if (log.latencyMs > 0) {
      totalLatencyMs += log.latencyMs;
      latencySamples += 1;
    }

    const hourBucket = hourlyBuckets[log.hourOfDay];
    if (hourBucket) {
      hourBucket.queries += 1;
      hourBucket.tokens += log.totalTokens;
    }

    const dayBucket = dayBuckets[log.dayOfWeek];
    if (dayBucket) {
      dayBucket.queries += 1;
      dayBucket.tokens += log.totalTokens;
      if (log.latencyMs > 0) {
        dayBucket.totalLatencyMs += log.latencyMs;
        dayBucket.latencyCount += 1;
      }
    }

    const userStat = usageByUser.get(log.userId) ?? {
      validQueries: 0,
      dangerousFlags: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };

    if (isDangerous) {
      userStat.dangerousFlags += 1;
    } else if (
      log.status === QueryStatus.SUCCESS ||
      log.status === QueryStatus.NO_CONTEXT_FOUND
    ) {
      userStat.validQueries += 1;
    }

    userStat.promptTokens += log.promptTokens;
    userStat.cachedTokens += log.cachedTokens;
    userStat.completionTokens += log.completionTokens;
    userStat.totalTokens += log.totalTokens;
    userStat.estimatedCostUsd += log.estimatedCostUsd;
    usageByUser.set(log.userId, userStat);
  }

  // Highlight top 3 non-zero peak usage hours
  const sortedHours = [...hourlyBuckets]
    .filter((b) => b.queries > 0)
    .sort((a, b) => b.queries - a.queries || b.tokens - a.tokens);
  const top3PeakHours = sortedHours.slice(0, 3);
  const peakHourSet = new Set(top3PeakHours.map((b) => b.hour));

  for (const bucket of hourlyBuckets) {
    bucket.isPeak = peakHourSet.has(bucket.hour);
  }

  const totalLogEvents = usageLogs.length;
  let peakWindowSummary: {
    label: string;
    sharePercent: number;
    peakQueries: number;
  } | null = null;

  if (top3PeakHours.length > 0 && totalLogEvents > 0) {
    const peakHoursOrdered = [...top3PeakHours].sort((a, b) => a.hour - b.hour);
    const peakQueries = peakHoursOrdered.reduce((acc, h) => acc + h.queries, 0);
    const sharePercent = Math.round((peakQueries / totalLogEvents) * 100);
    const startLabel = peakHoursOrdered[0].label;
    const endHour =
      (peakHoursOrdered[peakHoursOrdered.length - 1].hour + 1) % 24;
    const endLabel = `${endHour.toString().padStart(2, "0")}:00`;
    peakWindowSummary = {
      label: `${startLabel} – ${endLabel} UTC`,
      sharePercent,
      peakQueries,
    };
  }

  const dayOfWeekDistribution = MON_FIRST_ORDER.map((idx) => {
    const b = dayBuckets[idx];
    return {
      day: b.day,
      queries: b.queries,
      tokens: b.tokens,
      avgLatencyMs:
        b.latencyCount > 0 ? Math.round(b.totalLatencyMs / b.latencyCount) : 0,
    };
  });

  const latencies = usageLogs
    .map((l) => l.latencyMs)
    .filter((ms) => ms > 0)
    .sort((a, b) => a - b);
  const p50LatencyMs = percentile(latencies, 50);
  const p95LatencyMs = percentile(latencies, 95);
  const p99LatencyMs = percentile(latencies, 99);
  const avgLatencyMs =
    latencySamples > 0 ? Math.round(totalLatencyMs / latencySamples) : 0;
  const savedByCacheUsd = Math.max(0, uncachedBaselineCostUsd - totalCostUsd);
  const cacheHitRatePercent =
    totalPromptTokens > 0
      ? Math.round((totalCachedTokens / totalPromptTokens) * 100)
      : 0;

  const modelsArray = Array.from(modelMap.values()).map((m) => ({
    ...m,
    costUsd: Number(m.costUsd.toFixed(6)),
    avgLatencyMs: m.calls > 0 ? Math.round(m.totalLatencyMs / m.calls) : 0,
  }));

  const overallSuccessRatePct =
    totalLogEvents > 0
      ? Number(((statusCounts.SUCCESS / totalLogEvents) * 100).toFixed(1))
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
    filesPerUser: Array.from(filesByUserAnalytics.values()).sort(
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
    avgTokensPerQuestionByUser: Array.from(userOutcomeMap.values())
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
        totalLogEvents > 0
          ? Number(((count / totalLogEvents) * 100).toFixed(1))
          : 0,
    })),
    successRateByUser: Array.from(userOutcomeMap.values())
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

  const newUsers24h = users.filter(
    (u) => u.createdAt >= twentyFourHoursAgo
  ).length;
  const blockedUsers = users.filter((u) => u.isBlocked).length;

  const perUserBreakdown = users.map((u) => {
    const docStat = docsByUser.get(u.id) ?? {
      activeFiles: 0,
      totalFiles: 0,
      totalBytes: 0,
    };
    const uStat = usageByUser.get(u.id) ?? {
      validQueries: 0,
      dangerousFlags: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };

    return {
      id: u.id,
      username: u.username,
      name: u.name ?? u.username,
      email: u.email,
      provider: u.provider,
      role: u.role,
      isBlocked: u.isBlocked,
      blockedAt: u.blockedAt ? u.blockedAt.toISOString() : null,
      blockedReason: u.blockedReason,
      activeFiles: docStat.activeFiles,
      totalFiles: docStat.totalFiles,
      storageBytes: docStat.totalBytes,
      validQueries: uStat.validQueries,
      dangerousFlags: uStat.dangerousFlags,
      promptTokens: uStat.promptTokens,
      cachedTokens: uStat.cachedTokens,
      completionTokens: uStat.completionTokens,
      totalTokens: uStat.totalTokens,
      estimatedCostUsd: Number(uStat.estimatedCostUsd.toFixed(6)),
      createdAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt.toISOString(),
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    modelConfig: {
      primaryModel: activeModelInfo.model,
      modelUpdatedBy: activeModelInfo.updatedBy,
      modelUpdatedAt: activeModelInfo.updatedAt,
      availableModels: getAvailableModels(),
    },
    kpis: {
      totalUsers: users.length,
      nonAdminUsers: users.filter((u) => u.role === Role.USER).length,
      blockedUsers,
      newUsers24h,
      totalFilesUploaded: documents.length,
      totalStorageBytes,
      totalTokens,
      totalPromptTokens,
      totalCachedTokens,
      totalCompletionTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      avgLatencyMs,
      dangerousFlags,
      totalQueries: validQueries,
    },
    economics: {
      totalEvents: totalLogEvents,
      totalTokens,
      actualCostUsd: Number(totalCostUsd.toFixed(6)),
      savedByCacheUsd: Number(savedByCacheUsd.toFixed(6)),
      cacheHitRatePercent,
      avgLatencyMs,
      p50LatencyMs,
      p95LatencyMs,
      p99LatencyMs,
      statusCounts,
    },
    models: modelsArray,
    analytics,
    hourlyDistribution: hourlyBuckets,
    peakWindowSummary,
    dayOfWeekDistribution,
    users: perUserBreakdown,
    flaggedDangerousFeed,
  });
}
