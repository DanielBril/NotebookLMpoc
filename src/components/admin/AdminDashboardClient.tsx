"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Ban,
  EyeOff,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
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

  return (
    <div className="min-h-screen flex flex-col bg-[#f2fafb]">
      <Navbar mode="admin" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1380px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header Bar */}
        <div className="animate-fade-in-up flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#253237]">
              {t.admin.pageTitle}
            </h2>
            <p className="text-xs sm:text-sm text-[#5c6b73] mt-0.5">
              {t.admin.pageSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <span className="hidden sm:inline font-mono text-[11px] text-[#5c6b73]">
                {t.admin.updatedAt(
                  new Date(data.generatedAt).toLocaleTimeString(
                    lang === "he" ? "he-IL" : "en-US"
                  )
                )}
              </span>
            )}
            <button
              id="admin-refresh-btn"
              type="button"
              disabled={isRefreshing}
              onClick={() => void handleManualRefresh()}
              className="btn-jet inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{t.admin.refreshTelemetry}</span>
            </button>
          </div>
        </div>

        {/* Strict Admin Privacy Enforcement Notice */}
        <div className="animate-fade-in-up stagger-1 rounded-2xl bg-[#e0fbfc]/80 border border-[#9db4c0]/70 px-4 py-3.5 flex items-start gap-3 shadow-xs">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#253237] text-[#e0fbfc]">
            <EyeOff className="h-4 w-4" />
          </span>
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-[#253237]">
              {t.admin.privacyBannerTitle}
            </p>
            <p className="text-xs text-[#5c6b73] leading-relaxed">
              {t.admin.privacyBannerDesc}
            </p>
          </div>
        </div>

        {error && (
          <div className="animate-toast-in rounded-xl bg-[#253237] px-4 py-3 text-xs font-medium text-[#e0fbfc] border border-[#5c6b73]">
            {error}
          </div>
        )}

        {isLoading || !data ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#5c6b73]">
            <Loader2 className="h-6 w-6 animate-spin text-[#253237]" />
            <p className="text-sm font-medium">{t.admin.loadingMetrics}</p>
          </div>
        ) : (
          <>
            <KpiGrid kpis={data.kpis} />

            <PipelineInspectorPanel />

            {/* Flagged Dangerous Texts Only Feed */}
            <div className="animate-fade-in-up stagger-2 rounded-2xl bg-white border border-[#9db4c0]/55 shadow-[0_2px_10px_rgba(37,50,55,0.05)] overflow-hidden">
              <div className="px-5 py-4 bg-[#c2dfe3]/60 border-b border-[#9db4c0]/45 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253237] text-[#e0fbfc]">
                    <ShieldAlert className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold text-[#253237]">
                      {t.admin.dangerousFeedTitle}
                    </h2>
                    <p className="text-xs text-[#5c6b73]">
                      {t.admin.dangerousFeedSubtitle}
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-[#253237] px-2.5 py-0.5 font-mono text-[11px] font-semibold text-[#e0fbfc]">
                  {t.admin.dangerousEventsCount(
                    data.flaggedDangerousFeed.length
                  )}
                </span>
              </div>

              {data.flaggedDangerousFeed.length === 0 ? (
                <div className="p-8 text-center flex flex-col items-center gap-2 text-[#5c6b73]">
                  <div className="h-9 w-9 rounded-xl bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]/50 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-[#253237]">
                    {t.admin.zeroDangerousTitle}
                  </p>
                  <p className="text-[11px] max-w-md leading-relaxed">
                    {t.admin.zeroDangerousDesc}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#f2fafb] text-[11px] font-semibold uppercase tracking-wider text-[#5c6b73] border-b border-[#9db4c0]/35">
                        <th className="py-2.5 px-4 text-start">
                          {t.admin.colTimestamp}
                        </th>
                        <th className="py-2.5 px-3 text-start">
                          {t.admin.colUsername}
                        </th>
                        <th className="py-2.5 px-3 text-start">
                          {t.admin.colThreatType}
                        </th>
                        <th className="py-2.5 px-3 text-start">
                          {t.admin.colFlaggedText}
                        </th>
                        <th className="py-2.5 px-3 text-start">
                          {t.admin.colRule}
                        </th>
                        <th className="py-2.5 px-3 text-end">
                          {t.admin.colLatency}
                        </th>
                        <th className="py-2.5 px-4 text-end">
                          {t.admin.colAction}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#9db4c0]/25">
                      {data.flaggedDangerousFeed.map((ev) => {
                        const canBlock =
                          ev.userRole !== "ADMIN" && ev.userId !== user.id;
                        const isBusy = pendingBlockUserId === ev.userId;

                        return (
                          <tr
                            key={ev.id}
                            className="hover:bg-[#e0fbfc]/45 transition-colors"
                          >
                            <td className="py-2.5 px-4 font-mono text-[11px] text-[#5c6b73] whitespace-nowrap">
                              {new Date(ev.createdAt).toLocaleString(
                                lang === "he" ? "he-IL" : "en-US"
                              )}
                            </td>
                            <td
                              className="py-2.5 px-3 font-mono font-semibold text-[#253237]"
                              dir="ltr"
                            >
                              @{ev.username}
                            </td>
                            <td className="py-2.5 px-3 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 rounded-md bg-[#253237] px-2 py-0.5 text-[10px] font-bold text-[#e0fbfc]">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                {t.admin.badgeDangerous}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#253237] max-w-md break-words">
                              <div className="rounded-lg bg-[#f2fafb] border border-[#9db4c0]/55 px-2.5 py-1.5">
                                {ev.flaggedText}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[11px] text-[#5c6b73] max-w-xs truncate">
                              {ev.ruleReason}
                            </td>
                            <td
                              dir="ltr"
                              className="py-2.5 px-3 text-end font-mono text-[11px] text-[#5c6b73] whitespace-nowrap"
                            >
                              {ev.latencyMs}ms
                            </td>
                            <td className="py-2.5 px-4 text-end whitespace-nowrap">
                              {!canBlock ? (
                                <span className="text-[11px] text-[#5c6b73]">
                                  —
                                </span>
                              ) : ev.isUserBlocked ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#c2dfe3] px-2.5 py-0.5 text-[10px] font-bold text-[#253237]">
                                  <Ban className="h-2.5 w-2.5" />
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
                                  className="interactive-chip inline-flex items-center gap-1 rounded-lg bg-[#253237] hover:bg-[#5c6b73] px-2.5 py-1 text-[11px] font-semibold text-[#e0fbfc] disabled:opacity-50 cursor-pointer"
                                >
                                  {isBusy ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Ban className="h-3 w-3" />
                                  )}
                                  <span>{t.admin.blockUserQuick}</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

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
          </>
        )}
      </main>
    </div>
  );
}
