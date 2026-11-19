import { NextResponse } from "next/server";
import { QueryStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MON_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [users, documents, usageLogs] = await Promise.all([
    prisma.user.findMany({
      orderBy: { lastActiveAt: "desc" },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        role: true,
        provider: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
    prisma.document.findMany({
      select: {
        id: true,
        userId: true,
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
        hourOfDay: true,
        dayOfWeek: true,
        createdAt: true,
      },
    }),
  ]);

  // Aggregate documents per user
  const docsByUser = new Map<
    string,
    { activeFiles: number; totalFiles: number; totalBytes: number }
  >();
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
  }

  // Aggregate usage logs globally, hourly, daily, and per-user
  let totalPromptTokens = 0;
  let totalCachedTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let totalCostUsd = 0;
  let totalLatencyMs = 0;
  let latencySamples = 0;
  let guardrailBlocks = 0;
  let validQueries = 0;

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
      blockedAttempts: number;
      promptTokens: number;
      cachedTokens: number;
      completionTokens: number;
      totalTokens: number;
      estimatedCostUsd: number;
    }
  >();

  const userNameById = new Map<string, string>();
  for (const u of users) {
    userNameById.set(u.id, u.username);
  }

  const guardrailFeed: Array<{
    id: string;
    createdAt: string;
    username: string;
    status: QueryStatus;
    guardrailReason: string;
    model: string;
    latencyMs: number;
  }> = [];

  for (const log of usageLogs) {
    totalPromptTokens += log.promptTokens;
    totalCachedTokens += log.cachedTokens;
    totalCompletionTokens += log.completionTokens;
    totalTokens += log.totalTokens;
    totalCostUsd += log.estimatedCostUsd;

    const isBlocked =
      log.status === QueryStatus.BLOCKED_INJECTION ||
      log.status === QueryStatus.BLOCKED_OUT_OF_SCOPE;

    if (isBlocked) {
      guardrailBlocks += 1;
      if (guardrailFeed.length < 25) {
        guardrailFeed.push({
          id: log.id,
          createdAt: log.createdAt.toISOString(),
          username: userNameById.get(log.userId) ?? "unknown",
          status: log.status,
          guardrailReason: log.guardrailReason ?? "Blocked by guardrail pipeline",
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
      blockedAttempts: 0,
      promptTokens: 0,
      cachedTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    };

    if (isBlocked) {
      userStat.blockedAttempts += 1;
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
    const endHour = (peakHoursOrdered[peakHoursOrdered.length - 1].hour + 1) % 24;
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

  const newUsers24h = users.filter((u) => u.createdAt >= twentyFourHoursAgo).length;

  const perUserBreakdown = users.map((u) => {
    const docStat = docsByUser.get(u.id) ?? {
      activeFiles: 0,
      totalFiles: 0,
      totalBytes: 0,
    };
    const uStat = usageByUser.get(u.id) ?? {
      validQueries: 0,
      blockedAttempts: 0,
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
      activeFiles: docStat.activeFiles,
      totalFiles: docStat.totalFiles,
      storageBytes: docStat.totalBytes,
      validQueries: uStat.validQueries,
      blockedAttempts: uStat.blockedAttempts,
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
    kpis: {
      totalUsers: users.length,
      nonAdminUsers: users.filter((u) => u.role !== Role.ADMIN).length,
      newUsers24h,
      totalFilesUploaded: documents.length,
      totalStorageBytes,
      totalTokens,
      totalPromptTokens,
      totalCachedTokens,
      totalCompletionTokens,
      totalCostUsd: Number(totalCostUsd.toFixed(6)),
      avgLatencyMs:
        latencySamples > 0 ? Math.round(totalLatencyMs / latencySamples) : 0,
      guardrailBlocks,
      totalQueries: validQueries,
    },
    hourlyDistribution: hourlyBuckets,
    peakWindowSummary,
    dayOfWeekDistribution,
    users: perUserBreakdown,
    guardrailFeed,
  });
}
