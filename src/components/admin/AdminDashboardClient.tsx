"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { KpiGrid, type AdminKpis } from "@/components/admin/KpiGrid";
import {
  PeakHoursChart,
  type DayOfWeekBucket,
  type HourlyBucket,
  type PeakWindowSummary,
} from "@/components/admin/PeakHoursChart";
import { UsersTable, type AdminUserRow } from "@/components/admin/UsersTable";
import { PipelineInspectorPanel } from "@/components/admin/PipelineInspectorPanel";
import { useLanguage } from "@/lib/i18n";

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
  kpis: AdminKpis;
  hourlyDistribution: HourlyBucket[];
  peakWindowSummary: PeakWindowSummary | null;
  dayOfWeekDistribution: DayOfWeekBucket[];
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
  const [data, setData] = useState<AdminMetricsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingBlockUserId, setPendingBlockUserId] = useState<string | null>(
    null
  );
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

  async function handleToggleBlockUser(
    targetUserId: string,
    isBlocked: boolean,
    reason?: string
  ) {
    setError(null);
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

  const isHe = lang === "he";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar mode="admin" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1140px] px-4 sm:px-8 py-10 space-y-12">
        {/* Header: title + the one Teal primary action */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div dir={isHe ? "rtl" : "ltr"}>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {t.admin.pageTitle}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {t.admin.pageSubtitle}
              {data && (
                <span className="font-mono text-xs text-slate-400" dir="ltr">
                  {" "}
                  ·{" "}
                  {new Date(data.generatedAt).toLocaleTimeString(
                    lang === "he" ? "he-IL" : "en-US"
                  )}
                </span>
              )}
            </p>
          </div>
          <button
            id="admin-refresh-btn"
            type="button"
            disabled={isRefreshing}
            onClick={() => void handleManualRefresh()}
            className="btn-jet inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            <span>{t.admin.refreshTelemetry}</span>
          </button>
        </div>

        {/* Privacy notice: calm Blue info callout */}
        <p
          dir={isHe ? "rtl" : "ltr"}
          className="text-xs leading-relaxed text-slate-600 bg-blue-50/60 border border-blue-200/70 border-s-4 border-s-blue-600 rounded-lg px-4 py-3 max-w-3xl"
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

            {/* Flagged Dangerous Texts Only Feed */}
            <section className="space-y-4">
              <div dir={isHe ? "rtl" : "ltr"}>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
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
                <p className="text-sm text-slate-500 mt-0.5">
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
                      ev.userRole !== "ADMIN" && ev.userId !== user.id;
                    const isBusy = pendingBlockUserId === ev.userId;
                    return (
                      <div
                        key={ev.id}
                        className="py-4 flex flex-wrap items-start justify-between gap-4"
                      >
                        <div className="min-w-0 flex-1 basis-80 space-y-1.5">
                          <p
                            dir="ltr"
                            className="font-mono text-[11px] text-slate-500"
                          >
                            <span className="font-semibold text-slate-900">
                              @{ev.username}
                            </span>{" "}
                            ·{" "}
                            {new Date(ev.createdAt).toLocaleString(
                              lang === "he" ? "he-IL" : "en-US"
                            )}{" "}
                            · {ev.latencyMs}ms
                          </p>
                          <p
                            dir="auto"
                            className="rounded bg-rose-50/70 border border-rose-200/70 px-3 py-1.5 text-sm font-mono text-rose-950 break-words"
                          >
                            {ev.flaggedText}
                          </p>
                          <p className="text-xs text-rose-700 font-medium">
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
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-600 hover:text-white hover:border-rose-600 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:opacity-40 transition-colors cursor-pointer"
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

            <UsersTable
              users={data.users}
              currentAdminId={user.id}
              pendingBlockUserId={pendingBlockUserId}
              onToggleBlockUser={handleToggleBlockUser}
            />

            <PeakHoursChart
              hourlyDistribution={data.hourlyDistribution}
              peakWindowSummary={data.peakWindowSummary}
              dayOfWeekDistribution={data.dayOfWeekDistribution}
            />

            <PipelineInspectorPanel />
          </>
        )}
      </main>
    </div>
  );
}
