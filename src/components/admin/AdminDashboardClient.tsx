"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  FileDown,
  Loader2,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { KpiGrid, type AdminKpis } from "@/components/admin/KpiGrid";
import { UsersTable, type AdminUserRow } from "@/components/admin/UsersTable";
import {
  DeveloperAnalyticsCharts,
  exportDeveloperReportToPdf,
  type DeveloperAnalyticsPayload,
  type DeveloperGraphId,
  type PeakHoursAnalyticsData,
} from "@/components/developer/DeveloperAnalyticsCharts";
import { formatLatencySeconds } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";
import type { ModelOption } from "@/lib/modelConfig";

interface FlaggedDangerousItem {
  id: string;
  createdAt: string;
  userId: string;
  username: string;
  userRole: string;
  isUserBlocked: boolean;
  ruleReason: string;
  flaggedText: string;
  model: string;
  latencyMs: number;
}

interface AdminMetricsResponse {
  generatedAt: string;
  modelConfig: {
    primaryModel: string;
    modelUpdatedBy: string | null;
    modelUpdatedAt: string | null;
    availableModels: ModelOption[];
  };
  kpis: AdminKpis;
  economics: {
    totalEvents: number;
    totalTokens: number;
    actualCostUsd: number;
    savedByCacheUsd: number;
    cacheHitRatePercent: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
    statusCounts: Record<string, number>;
  };
  models: Array<{
    model: string;
    calls: number;
    errors: number;
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    avgLatencyMs: number;
  }>;
  analytics: DeveloperAnalyticsPayload;
  hourlyDistribution: PeakHoursAnalyticsData["hourlyDistribution"];
  peakWindowSummary: PeakHoursAnalyticsData["peakWindowSummary"];
  dayOfWeekDistribution: PeakHoursAnalyticsData["dayOfWeekDistribution"];
  users: AdminUserRow[];
  flaggedDangerousFeed: FlaggedDangerousItem[];
}

interface AdminDashboardClientProps {
  user: {
    id: string;
    username: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
}

export function AdminDashboardClient({ user }: AdminDashboardClientProps) {
  const { lang, t } = useLanguage();
  const isHe = lang === "he";

  const [data, setData] = useState<AdminMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingBlockUserId, setPendingBlockUserId] = useState<string | null>(
    null
  );
  const [pendingDeleteUserId, setPendingDeleteUserId] = useState<string | null>(
    null
  );
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelResult, setModelResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [userActionNote, setUserActionNote] = useState<string | null>(null);
  const [graph1, setGraph1] = useState<DeveloperGraphId>("filesByType");
  const [graph2, setGraph2] = useState<DeveloperGraphId>("overallSuccessRate");
  const [error, setError] = useState<string | null>(null);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/metrics", { cache: "no-store" });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        setError(json.error || t.admin.errLoadTelemetry);
        return;
      }
      const metrics = (await res.json()) as AdminMetricsResponse;
      setData(metrics);
      setSelectedModel(metrics.modelConfig.primaryModel);
    } catch {
      setError(t.admin.errNetworkTelemetry);
    } finally {
      setIsRefreshing(false);
    }
  }, [t.admin.errLoadTelemetry, t.admin.errNetworkTelemetry]);

  useEffect(() => {
    let cancelled = false;

    async function fetchInitialMetrics() {
      try {
        const res = await fetch("/api/admin/metrics", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setError(json.error || t.admin.errLoadTelemetry);
          return;
        }
        const metrics = (await res.json()) as AdminMetricsResponse;
        setData(metrics);
        setSelectedModel(metrics.modelConfig.primaryModel);
      } catch {
        if (!cancelled) {
          setError(t.admin.errNetworkTelemetry);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchInitialMetrics();
    return () => {
      cancelled = true;
    };
  }, [t.admin.errLoadTelemetry, t.admin.errNetworkTelemetry]);

  async function handleSaveGlobalModel() {
    if (!selectedModel || isSavingModel) return;
    setIsSavingModel(true);
    setModelResult(null);
    try {
      const res = await fetch("/api/developer/model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        primaryModel?: string;
        error?: string;
      };
      if (!res.ok) {
        setModelResult({
          ok: false,
          message:
            json.error ||
            (isHe ? "עדכון המודל נכשל." : "Failed to update model."),
        });
      } else {
        setModelResult({
          ok: true,
          message: isHe
            ? `המודל הגלובלי הוחלף ל-${json.primaryModel} עבור כל המשתמשים.`
            : `Global active model switched to "${json.primaryModel}" for all users.`,
        });
        await handleManualRefresh();
      }
    } catch {
      setModelResult({
        ok: false,
        message: isHe
          ? "שגיאת רשת בעדכון המודל."
          : "Network error while updating model.",
      });
    } finally {
      setIsSavingModel(false);
    }
  }

  async function handleToggleBlockUser(
    targetUserId: string,
    isBlocked: boolean,
    reason?: string
  ) {
    setError(null);
    setUserActionNote(null);
    setPendingBlockUserId(targetUserId);
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/block`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isBlocked, reason }),
      });

      const json = (await res.json()) as {
        error?: string;
        user?: {
          id: string;
          isBlocked: boolean;
          blockedAt: string | null;
          blockedReason: string | null;
        };
      };

      if (!res.ok || !json.user) {
        setError(json.error || t.admin.errBlockAction);
        return;
      }

      const updatedUser = json.user;
      setData((prev) => {
        if (!prev) return prev;
        const nextUsers = prev.users.map((u) =>
          u.id === updatedUser.id
            ? {
                ...u,
                isBlocked: updatedUser.isBlocked,
                blockedAt: updatedUser.blockedAt,
                blockedReason: updatedUser.blockedReason,
              }
            : u
        );
        const nextFeed = prev.flaggedDangerousFeed.map((item) =>
          item.userId === updatedUser.id
            ? { ...item, isUserBlocked: updatedUser.isBlocked }
            : item
        );
        const blockedUsers = nextUsers.filter((u) => u.isBlocked).length;
        return {
          ...prev,
          kpis: { ...prev.kpis, blockedUsers },
          users: nextUsers,
          flaggedDangerousFeed: nextFeed,
        };
      });
    } catch {
      setError(t.admin.errBlockAction);
    } finally {
      setPendingBlockUserId(null);
    }
  }

  async function handleDeleteUserPermanently(targetUserId: string) {
    setError(null);
    setUserActionNote(null);
    setPendingDeleteUserId(targetUserId);
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}`, {
        method: "DELETE",
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        deletedUsername?: string;
        deletedCounts?: {
          documents: number;
          messages: number;
          usageLogs: number;
        };
      };

      if (!res.ok) {
        setError(
          json.error ||
            (isHe ? "מחיקת המשתמש נכשלה." : "Failed to permanently delete user.")
        );
        return;
      }

      setUserActionNote(
        isHe
          ? `המשתמש @${json.deletedUsername} וכל המידע שלו (${json.deletedCounts?.documents ?? 0} מסמכים, ${json.deletedCounts?.messages ?? 0} הודעות) נמחקו לצמיתות מהאתר.`
          : `User @${json.deletedUsername} and all of their data (${json.deletedCounts?.documents ?? 0} docs, ${json.deletedCounts?.messages ?? 0} messages) were permanently erased.`
      );
      await handleManualRefresh();
    } catch {
      setError(
        isHe
          ? "שגיאת רשת במחיקת המשתמש."
          : "Network error while permanently deleting user."
      );
    } finally {
      setPendingDeleteUserId(null);
    }
  }

  const pdfReportData = useMemo(() => {
    if (!data) return null;
    return {
      generatedAt: data.generatedAt,
      primaryModel: data.modelConfig.primaryModel,
      dbPingMs: 0,
      totalUsers: data.kpis.totalUsers,
      totalDocuments: data.kpis.totalFilesUploaded,
      totalStorageBytes: data.kpis.totalStorageBytes,
      economics: {
        totalEvents: data.economics.totalEvents,
        totalTokens: data.economics.totalTokens,
        actualCostUsd: data.economics.actualCostUsd,
        savedByCacheUsd: data.economics.savedByCacheUsd,
        cacheHitRatePercent: data.economics.cacheHitRatePercent,
        p50LatencyMs: data.economics.p50LatencyMs,
        p95LatencyMs: data.economics.p95LatencyMs,
        p99LatencyMs: data.economics.p99LatencyMs,
      },
      models: data.models,
      analytics: data.analytics,
      peakHours: {
        hourlyDistribution: data.hourlyDistribution,
        peakWindowSummary: data.peakWindowSummary,
        dayOfWeekDistribution: data.dayOfWeekDistribution,
      },
      decisionLogs: data.flaggedDangerousFeed.map((ev) => ({
        username: ev.username,
        status: "BLOCKED_INJECTION",
        model: ev.model,
        userMessage: ev.flaggedText,
        reason: ev.ruleReason,
        latencyMs: ev.latencyMs,
        createdAt: ev.createdAt,
      })),
    };
  }, [data]);

  return (
    <div className="min-h-screen flex flex-col glass-canvas">
      <Navbar mode="admin" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1140px] px-3 sm:px-8 py-6 sm:py-10 space-y-8 sm:space-y-12">
        {/* Header: title + Export PDF + Refresh */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end justify-between gap-3 sm:gap-4">
          <div dir={isHe ? "rtl" : "ltr"} className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {t.admin.pageTitle}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 leading-relaxed">
              {t.admin.pageSubtitle}
              {data && (
                <span className="font-mono text-[11px] sm:text-xs text-slate-400" dir="ltr">
                  {" "}
                  ·{" "}
                  {new Date(data.generatedAt).toLocaleTimeString(
                    lang === "he" ? "he-IL" : "en-US"
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            {pdfReportData && (
              <button
                id="admin-export-pdf-btn"
                type="button"
                onClick={() =>
                  exportDeveloperReportToPdf(
                    pdfReportData,
                    graph1,
                    graph2,
                    isHe ? "he" : "en"
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap rounded-xl sm:rounded-lg border border-blue-200 bg-blue-50/90 hover:bg-blue-100 px-3 sm:px-3.5 py-2.5 sm:py-2 text-xs sm:text-sm font-medium text-blue-900 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5 shrink-0" />
                <span>{isHe ? "ייצוא PDF" : "Export PDF"}</span>
              </button>
            )}
            <button
              id="admin-refresh-btn"
              type="button"
              disabled={isRefreshing}
              onClick={() => void handleManualRefresh()}
              className={`btn-jet inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap rounded-xl sm:rounded-lg px-3.5 sm:px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-medium cursor-pointer ${
                !pdfReportData ? "col-span-2" : ""
              }`}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{t.admin.refreshTelemetry}</span>
            </button>
          </div>
        </div>

        {/* Privacy notice: calm Blue info callout */}
        <p
          dir={isHe ? "rtl" : "ltr"}
          className="text-xs leading-relaxed text-slate-600 bg-blue-50/60 border border-blue-200/70 border-s-4 border-s-blue-600 rounded-xl sm:rounded-lg px-3.5 sm:px-4 py-3 max-w-3xl"
        >
          <strong className="font-semibold text-blue-950">
            {t.admin.privacyBannerTitle}
          </strong>{" "}
          {t.admin.privacyBannerDesc}
        </p>

        {error && (
          <div className="rounded-lg border border-rose-200 border-s-4 border-s-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {isLoading || !data ? (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <p className="text-sm">{t.admin.loadingMetrics}</p>
          </div>
        ) : (
          <>
            <KpiGrid kpis={data.kpis} />

            {/* Global Active LLM Model Switcher (moved to Admin Portal) */}
            <section className="glass-panel rounded-2xl border p-4 sm:p-5 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.1)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3.5 sm:gap-4">
                <div dir={isHe ? "rtl" : "ltr"} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Cpu className="h-4.5 w-4.5 text-teal-600 shrink-0" />
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                      {isHe
                        ? "מודל AI פעיל לכל המשתמשים"
                        : "Global Active LLM Model (All Users)"}
                    </h2>
                    <span
                      dir="ltr"
                      className="rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-teal-800"
                    >
                      {data.modelConfig.primaryModel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                    {isHe
                      ? "שינוי המודל כאן מתעדכן מיידית בבסיס הנתונים ומשפיע על כל המשתמשים באתר."
                      : "Switching the model here persists globally and immediately applies to Q&A chat and Studio tools for every user."}
                    {data.modelConfig.modelUpdatedBy &&
                      data.modelConfig.modelUpdatedAt && (
                        <span
                          dir="ltr"
                          className="ms-1.5 font-mono text-[11px] text-slate-400"
                        >
                          · {isHe ? "עודכן ע״י" : "Updated by"} @
                          {data.modelConfig.modelUpdatedBy} (
                          {new Date(
                            data.modelConfig.modelUpdatedAt
                          ).toLocaleString()}
                          )
                        </span>
                      )}
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 shrink-0 w-full sm:w-auto">
                  <select
                    id="global-model-select"
                    value={selectedModel || data.modelConfig.primaryModel}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setModelResult(null);
                    }}
                    dir="ltr"
                    className="w-full sm:w-auto sm:min-w-[230px] max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 sm:py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 cursor-pointer"
                  >
                    {data.modelConfig.availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label} ({m.id}) — ${m.inputPer1M}/${m.outputPer1M} per 1M
                      </option>
                    ))}
                  </select>

                  <button
                    id="save-global-model-btn"
                    type="button"
                    disabled={
                      isSavingModel ||
                      !selectedModel ||
                      selectedModel === data.modelConfig.primaryModel
                    }
                    onClick={() => void handleSaveGlobalModel()}
                    className="btn-jet w-full sm:w-auto inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 sm:py-2 text-xs font-semibold cursor-pointer"
                  >
                    {isSavingModel && (
                      <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                    )}
                    <span>
                      {isHe ? "החל לכל המשתמשים" : "Apply to All Users"}
                    </span>
                  </button>
                </div>
              </div>

              {selectedModel && (
                <p
                  dir={isHe ? "rtl" : "ltr"}
                  className="text-[11px] text-slate-500"
                >
                  {(() => {
                    const opt = data.modelConfig.availableModels.find(
                      (m) => m.id === selectedModel
                    );
                    if (!opt) return null;
                    return isHe ? opt.descriptionHe : opt.descriptionEn;
                  })()}
                </p>
              )}

              {modelResult && (
                <div
                  dir={isHe ? "rtl" : "ltr"}
                  className={`animate-fade-in flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
                    modelResult.ok
                      ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
                      : "bg-rose-50/90 border-rose-200 text-rose-950"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {modelResult.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-rose-600 shrink-0" />
                    )}
                    <span className="break-words">{modelResult.message}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModelResult(null)}
                    className="shrink-0 text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </section>

            {/* Single Unified Analytics & Charts Section (All 10 metrics + PDF Export) */}
            {pdfReportData && (
              <DeveloperAnalyticsCharts
                analytics={data.analytics}
                peakHours={pdfReportData.peakHours}
                reportData={pdfReportData}
                isHe={isHe}
                graph1={graph1}
                graph2={graph2}
                onChangeGraph1={setGraph1}
                onChangeGraph2={setGraph2}
              />
            )}

            {/* Flagged Dangerous Texts Only Feed */}
            <section className="space-y-3 sm:space-y-4">
              <div dir={isHe ? "rtl" : "ltr"}>
                <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 flex flex-wrap items-center gap-2">
                  <span>{t.admin.dangerousFeedTitle}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${
                      data.flaggedDangerousFeed.length > 0
                        ? "bg-rose-100 text-rose-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {t.admin.dangerousEventsCount(
                      data.flaggedDangerousFeed.length
                    )}
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                  {t.admin.dangerousFeedSubtitle}
                </p>
              </div>

              {data.flaggedDangerousFeed.length === 0 ? (
                <div
                  dir={isHe ? "rtl" : "ltr"}
                  className="py-8 border-t border-slate-200"
                >
                  <p className="text-sm font-medium text-emerald-800">
                    {t.admin.zeroDangerousTitle}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 max-w-md leading-relaxed">
                    {t.admin.zeroDangerousDesc}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 border-t border-slate-200">
                  {data.flaggedDangerousFeed.map((ev) => {
                    const canBlock =
                      ev.userRole !== "ADMIN" &&
                      ev.userRole !== "DEVELOPER" &&
                      ev.userId !== user.id;
                    const isBusy = pendingBlockUserId === ev.userId;
                    return (
                      <div
                        key={ev.id}
                        className="py-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4"
                      >
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p
                            dir="ltr"
                            className="font-mono text-[11px] text-slate-500 break-words"
                          >
                            <span className="font-semibold text-slate-900">
                              @{ev.username}
                            </span>{" "}
                            ·{" "}
                            {new Date(ev.createdAt).toLocaleString(
                              lang === "he" ? "he-IL" : "en-US"
                            )}{" "}
                            · {formatLatencySeconds(ev.latencyMs)}
                          </p>
                          <p
                            dir="auto"
                            className="rounded-lg bg-rose-50/70 border border-rose-200/70 px-3 py-2 text-xs sm:text-sm font-mono text-rose-950 break-words"
                          >
                            {ev.flaggedText}
                          </p>
                          <p className="text-xs text-rose-700 font-medium break-words">
                            {ev.ruleReason}
                          </p>
                        </div>
                        <div className="shrink-0">
                          {!canBlock ? null : ev.isUserBlocked ? (
                            <span className="inline-flex rounded-md bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                              {t.admin.userBlockedPill}
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() =>
                                void handleToggleBlockUser(
                                  ev.userId,
                                  true,
                                  ev.ruleReason
                                )
                              }
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-xl sm:rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-600 hover:text-white hover:border-rose-600 px-3.5 sm:px-3 py-2 sm:py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
                            >
                              {isBusy && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              {t.admin.blockUserQuick}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* User Management with Block -> Restore OR Permanent Delete */}
            <div className="space-y-3">
              {userActionNote && (
                <div
                  dir={isHe ? "rtl" : "ltr"}
                  className="animate-fade-in flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs text-emerald-950"
                >
                  <span>{userActionNote}</span>
                  <button
                    type="button"
                    onClick={() => setUserActionNote(null)}
                    className="shrink-0 text-emerald-700 hover:text-emerald-950 cursor-pointer"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <UsersTable
                users={data.users}
                currentAdminId={user.id}
                pendingBlockUserId={pendingBlockUserId}
                pendingDeleteUserId={pendingDeleteUserId}
                onToggleBlockUser={handleToggleBlockUser}
                onDeleteUserPermanently={handleDeleteUserPermanently}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
