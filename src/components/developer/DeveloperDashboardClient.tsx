"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PipelineInspectorPanel } from "@/components/admin/PipelineInspectorPanel";
import { formatTokensCompact, formatUsd } from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";
import type { RepairAction } from "@/app/api/developer/repair/route";

interface DeveloperDiagnosticsResponse {
  generatedAt: string;
  health: {
    dbConnected: boolean;
    dbPingMs: number;
    openAiConfigured: boolean;
    primaryModel: string;
    guardrailModel: string;
    googleOAuthConfigured: boolean;
    authSecretConfigured: boolean;
    domMatrixPolyfillActive: boolean;
    imageDataPolyfillActive: boolean;
    path2DPolyfillActive: boolean;
    nodeVersion: string;
    platform: string;
    uptimeSeconds: number;
    rssMb: number;
    heapUsedMb: number;
  };
  anomalies: {
    unresolvedErrorsCount: number;
    failedQueryLogsCount: number;
    corruptedOrEmptyDocs: number;
    usersOverTokenCap: number;
    blockedUsersCount: number;
  };
  economics: {
    totalEvents: number;
    totalMessages: number;
    totalPromptTokens: number;
    totalCachedTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    cacheHitRatePercent: number;
    actualCostUsd: number;
    uncachedBaselineCostUsd: number;
    savedByCacheUsd: number;
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
  storage: {
    totalUsers: number;
    totalDocuments: number;
    totalStorageBytes: number;
    totalDocumentTokens: number;
    formatBreakdown: Record<
      string,
      { count: number; bytes: number; tokens: number }
    >;
  };
  systemLogs: Array<{
    id: string;
    level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
    source: string;
    message: string;
    stack: string | null;
    meta: unknown;
    userId: string | null;
    username: string | null;
    resolved: boolean;
    createdAt: string;
  }>;
}

interface DeveloperDashboardClientProps {
  user: {
    id: string;
    username: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function DeveloperDashboardClient({
  user,
}: DeveloperDashboardClientProps) {
  const { lang } = useLanguage();
  const isHe = lang === "he";

  const [data, setData] = useState<DeveloperDiagnosticsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [repairFeedback, setRepairFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<
    "ALL" | "ERROR" | "WARN" | "INFO" | "UNRESOLVED"
  >("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/developer/diagnostics", {
        cache: "no-store",
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        setError(j.error || "Failed to load developer diagnostics.");
        return;
      }
      const json = (await res.json()) as DeveloperDiagnosticsResponse;
      setData(json);
    } catch {
      setError("Network error while fetching developer diagnostics.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function fetchInitial() {
      try {
        const res = await fetch("/api/developer/diagnostics", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          const j = (await res.json().catch(() => ({}))) as { error?: string };
          setError(j.error || "Failed to load developer diagnostics.");
          return;
        }
        const json = (await res.json()) as DeveloperDiagnosticsResponse;
        setData(json);
      } catch {
        if (!cancelled) {
          setError("Network error while fetching developer diagnostics.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }
    void fetchInitial();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runRepair(action: RepairAction) {
    setPendingAction(action);
    setRepairFeedback(null);
    setError(null);
    try {
      const res = await fetch("/api/developer/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        summary?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || "Repair action failed.");
      } else {
        setRepairFeedback(json.summary || "Repair completed.");
        await handleRefresh();
      }
    } catch {
      setError("Network error while running repair action.");
    } finally {
      setPendingAction(null);
    }
  }

  async function resolveSingleLog(logId: string) {
    setPendingAction(logId);
    try {
      const res = await fetch("/api/developer/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId }),
      });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                systemLogs: prev.systemLogs.map((l) =>
                  l.id === logId ? { ...l, resolved: true } : l
                ),
              }
            : prev
        );
      }
    } finally {
      setPendingAction(null);
    }
  }

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    return data.systemLogs.filter((l) => {
      if (logFilter === "ALL") return true;
      if (logFilter === "UNRESOLVED") return !l.resolved;
      if (logFilter === "ERROR")
        return l.level === "ERROR" || l.level === "CRITICAL";
      return l.level === logFilter;
    });
  }, [data, logFilter]);

  const h = data?.health;
  const eco = data?.economics;
  const anom = data?.anomalies;

  const repairs: Array<{
    id: string;
    action: RepairAction;
    title: string;
    desc: string;
    stat: string | null;
    cta: string;
  }> = data
    ? [
        {
          id: "repair-pdf-polyfill-btn",
          action: "VERIFY_PDF_POLYFILL",
          title: isHe ? "בדיקת מנוע PDF ו-DOMMatrix" : "Verify PDF / DOMMatrix engine",
          desc: isHe
            ? "מוודא שה-polyfills פעילים ומפענח PDF בדיקה בזיכרון."
            : "Confirms polyfills are active and parses an in-memory test PDF.",
          stat: data.health.domMatrixPolyfillActive ? "Ready" : "Needs fix",
          cta: isHe ? "הרץ בדיקה" : "Run test",
        },
        {
          id: "repair-recalc-tokens-btn",
          action: "RECALCULATE_DOCUMENT_TOKENS",
          title: isHe ? "חישוב טוקנים מחדש" : "Recalculate document tokens",
          desc: isHe
            ? "מחשב מחדש טוקנים ומבטל סימון קבצים החורגים מ-150k."
            : "Recomputes counts and unchecks files over the 150k ceiling.",
          stat: `${data.anomalies.usersOverTokenCap} over cap`,
          cta: isHe ? "תקן" : "Repair",
        },
        {
          id: "repair-purge-docs-btn",
          action: "PURGE_CORRUPTED_DOCUMENTS",
          title: isHe ? "ניקוי מסמכים פגומים" : "Purge corrupted documents",
          desc: isHe
            ? "מסיר מסמכים ללא טקסט (0 טוקנים או 0 בתים)."
            : "Removes zero-byte or zero-token documents to free file slots.",
          stat: `${data.anomalies.corruptedOrEmptyDocs} found`,
          cta: isHe ? "נקה" : "Purge",
        },
        {
          id: "repair-resolve-errors-btn",
          action: "RESOLVE_ALL_ERRORS",
          title: isHe ? "סימון שגיאות כטופלו" : "Resolve open errors",
          desc: isHe
            ? "מסמן שגיאות פתוחות כטופלו ומנקה קריאות שנכשלו."
            : "Marks open system errors resolved and clears failed usage entries.",
          stat: `${data.anomalies.unresolvedErrorsCount + data.anomalies.failedQueryLogsCount} open`,
          cta: isHe ? "אפס" : "Resolve all",
        },
        {
          id: "repair-reset-accounts-btn",
          action: "RESET_ADMIN_AND_DEV_ACCOUNTS",
          title: isHe ? "שחזור חשבונות מערכת" : "Restore system accounts",
          desc: isHe
            ? "מוודא ש-admin ו-Developer קיימים, לא חסומים, עם סיסמאות ברירת מחדל."
            : "Ensures admin and Developer exist, are unblocked, with default passwords.",
          stat: null,
          cta: isHe ? "שחזר" : "Restore",
        },
        {
          id: "repair-unblock-users-btn",
          action: "UNBLOCK_ALL_USERS",
          title: isHe ? "שחרור משתמשים חסומים" : "Unblock all users",
          desc: isHe
            ? "משחרר את כל החשבונות החסומים בלחיצה אחת."
            : "Lifts every active block in one step.",
          stat: `${data.anomalies.blockedUsersCount} blocked`,
          cta: isHe ? "שחרר" : "Unblock",
        },
      ]
    : [];

  const th =
    "py-2 pe-4 text-[11px] font-medium text-[#5c6b73] text-start whitespace-nowrap";

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar mode="developer" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1100px] px-4 sm:px-8 py-10 space-y-12">
        {/* Header: title + the one primary action */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#253237]">
              {isHe ? "דיאגנוסטיקה ולוגים" : "Diagnostics & logs"}
            </h1>
            <p className="mt-1 text-sm text-[#5c6b73]">
              {isHe
                ? "בריאות מערכת, עלויות, שגיאות וכלי תיקון."
                : "System health, cost, errors and repair tools."}
              {data && (
                <span className="font-mono text-xs text-[#9db4c0]" dir="ltr">
                  {" "}
                  · {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <button
            id="dev-refresh-btn"
            type="button"
            disabled={isRefreshing}
            onClick={() => void handleRefresh()}
            className="btn-jet inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
            />
            {isHe ? "רענון" : "Refresh"}
          </button>
        </div>

        {repairFeedback && (
          <div className="flex items-center justify-between gap-3 border-s-2 border-[#253237] bg-[#f8fafb] px-4 py-3 text-sm text-[#253237]">
            <span>{repairFeedback}</span>
            <button
              type="button"
              onClick={() => setRepairFeedback(null)}
              className="text-xs text-[#5c6b73] hover:text-[#253237] underline cursor-pointer"
            >
              {isHe ? "סגור" : "Dismiss"}
            </button>
          </div>
        )}

        {error && (
          <div className="border-s-2 border-[#253237] bg-[#f8fafb] px-4 py-3 text-sm text-[#253237]">
            {error}
          </div>
        )}

        {isLoading || !data || !h || !eco || !anom ? (
          <div className="py-24 flex flex-col items-center gap-3 text-[#5c6b73]">
            <Loader2 className="h-5 w-5 animate-spin text-[#253237]" />
            <p className="text-sm">
              {isHe ? "טוען דיאגנוסטיקה…" : "Loading diagnostics…"}
            </p>
          </div>
        ) : (
          <>
            {/* Level 1: key figures as an open strip, no cards */}
            <section
              dir="ltr"
              className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-8 border-y border-[#253237]/10 py-8"
            >
              {[
                {
                  label: isHe ? "מסד נתונים" : "Database",
                  value: `${h.dbPingMs}ms`,
                  note: `Node ${h.nodeVersion} · ${h.heapUsedMb}/${h.rssMb} MB`,
                },
                {
                  label: isHe ? "עלות כוללת" : "Total cost",
                  value: formatUsd(eco.actualCostUsd),
                  note: `${isHe ? "נחסך" : "Saved"} ${formatUsd(eco.savedByCacheUsd)} (${eco.cacheHitRatePercent}%) · ${formatTokensCompact(eco.totalTokens)} tok`,
                },
                {
                  label: isHe ? "השהיה P50 / P95" : "Latency P50 / P95",
                  value: `${eco.p50LatencyMs}/${eco.p95LatencyMs}ms`,
                  note: `P99 ${eco.p99LatencyMs}ms`,
                },
                {
                  label: isHe ? "שגיאות פתוחות" : "Open errors",
                  value: String(anom.unresolvedErrorsCount),
                  note: `${anom.failedQueryLogsCount} ${isHe ? "קריאות שנכשלו" : "failed calls"} · PDF engine ${h.domMatrixPolyfillActive ? "ready" : "missing DOMMatrix"}`,
                },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-xs text-[#5c6b73]">{s.label}</p>
                  <p className="mt-1.5 text-3xl font-semibold tracking-tight text-[#253237] font-mono">
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-[11px] font-mono text-[#9db4c0]">
                    {s.note}
                  </p>
                </div>
              ))}
            </section>

            {/* Level 1: logs */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
                  {isHe ? "לוגים ושגיאות" : "Logs & errors"}
                </h2>
                <div className="flex items-center gap-1 text-xs">
                  {(["ALL", "UNRESOLVED", "ERROR", "WARN", "INFO"] as const).map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setLogFilter(tab)}
                        className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                          logFilter === tab
                            ? "bg-[#253237]/8 text-[#253237] font-semibold"
                            : "text-[#5c6b73] hover:text-[#253237]"
                        }`}
                      >
                        {tab}
                      </button>
                    )
                  )}
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <p className="py-10 text-sm text-[#5c6b73] border-t border-[#253237]/10">
                  {isHe
                    ? "אין רשומות התואמות לסינון."
                    : "No log entries match this filter."}
                </p>
              ) : (
                <div className="divide-y divide-[#253237]/8 border-t border-[#253237]/10 max-h-[480px] overflow-y-auto">
                  {filteredLogs.map((log) => {
                    const isErr =
                      log.level === "ERROR" || log.level === "CRITICAL";
                    const isExpanded = expandedLogId === log.id;
                    return (
                      <div
                        key={log.id}
                        className={`py-3 ${log.resolved ? "opacity-55" : ""}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div
                            dir="ltr"
                            className="flex items-baseline gap-3 font-mono text-[11px] text-[#5c6b73]"
                          >
                            <span
                              className={
                                isErr
                                  ? "font-bold text-[#253237]"
                                  : "font-medium"
                              }
                            >
                              {log.level}
                            </span>
                            <span>{log.source}</span>
                            {log.username && <span>@{log.username}</span>}
                            <span className="text-[#9db4c0]">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs">
                            {(Boolean(log.stack) || Boolean(log.meta)) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLogId(isExpanded ? null : log.id)
                                }
                                className="text-[#5c6b73] hover:text-[#253237] underline underline-offset-2 cursor-pointer"
                              >
                                {isExpanded
                                  ? isHe
                                    ? "הסתר"
                                    : "Hide"
                                  : isHe
                                    ? "פרטים"
                                    : "Details"}
                              </button>
                            )}
                            {!log.resolved ? (
                              <button
                                type="button"
                                disabled={pendingAction === log.id}
                                onClick={() => void resolveSingleLog(log.id)}
                                className="font-medium text-[#253237] hover:underline underline-offset-2 cursor-pointer"
                              >
                                {isHe ? "סמן כטופל" : "Resolve"}
                              </button>
                            ) : (
                              <span className="text-[#9db4c0]">
                                {isHe ? "טופל" : "Resolved"}
                              </span>
                            )}
                          </div>
                        </div>
                        <p
                          dir="auto"
                          className="mt-1 text-sm text-[#253237] break-words"
                        >
                          {log.message}
                        </p>
                        {isExpanded && (
                          <div className="mt-2 space-y-2">
                            {Boolean(log.meta) && (
                              <pre
                                dir="ltr"
                                className="rounded bg-[#f8fafb] p-3 text-[11px] font-mono text-[#253237] overflow-x-auto"
                              >
                                {JSON.stringify(log.meta, null, 2)}
                              </pre>
                            )}
                            {log.stack && (
                              <pre
                                dir="ltr"
                                className="rounded bg-[#253237] p-3 text-[11px] font-mono text-white/90 overflow-x-auto whitespace-pre-wrap"
                              >
                                {log.stack}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Level 2: repair tools as a plain list */}
            <section className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
                  {isHe ? "כלי תיקון" : "Repair tools"}
                </h2>
                <p className="text-sm text-[#5c6b73]">
                  {isHe
                    ? "פעולות תחזוקה בלחיצה אחת."
                    : "One-click maintenance actions."}
                </p>
              </div>
              <div className="divide-y divide-[#253237]/8 border-t border-[#253237]/10">
                {repairs.map((r) => (
                  <div
                    key={r.id}
                    className="py-4 flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1 basis-72">
                      <p className="text-sm font-medium text-[#253237]">
                        {r.title}
                        {r.stat && (
                          <span
                            dir="ltr"
                            className="ms-2 font-mono text-[11px] font-normal text-[#5c6b73]"
                          >
                            {r.stat}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-[#5c6b73]">{r.desc}</p>
                    </div>
                    <button
                      id={r.id}
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => void runRepair(r.action)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#253237]/20 px-3.5 py-1.5 text-xs font-medium text-[#253237] hover:border-[#253237] hover:bg-[#f8fafb] disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {pendingAction === r.action && (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      )}
                      {r.cta}
                    </button>
                  </div>
                ))}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-[#253237]">
                      {isHe ? "ניקוי לוגים שטופלו" : "Prune resolved logs"}
                    </p>
                    <p className="mt-0.5 text-xs text-[#5c6b73]">
                      {isHe
                        ? "מוחק מהמסד לוגים שסומנו כטופלו."
                        : "Deletes log rows already marked resolved."}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runRepair("CLEAR_RESOLVED_LOGS")}
                    className="rounded-lg border border-[#253237]/20 px-3.5 py-1.5 text-xs font-medium text-[#253237] hover:border-[#253237] hover:bg-[#f8fafb] disabled:opacity-40 transition-colors cursor-pointer"
                  >
                    {isHe ? "נקה" : "Prune"}
                  </button>
                </div>
              </div>
            </section>

            {/* Level 2: per-model table */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold tracking-tight text-[#253237]">
                {isHe ? "שימוש לפי מודל" : "Usage by model"}
              </h2>
              <div className="overflow-x-auto border-t border-[#253237]/10" dir="ltr">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-[#253237]/10">
                      <th className={th}>Model</th>
                      <th className={`${th} text-end`}>Calls</th>
                      <th className={`${th} text-end`}>Errors</th>
                      <th className={`${th} text-end`}>Input (cached)</th>
                      <th className={`${th} text-end`}>Output</th>
                      <th className={`${th} text-end`}>Latency</th>
                      <th className={`${th} text-end pe-0`}>Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#253237]/8">
                    {data.models.map((m) => (
                      <tr key={m.model}>
                        <td className="py-2.5 pe-4 font-medium text-[#253237]">
                          {m.model}
                        </td>
                        <td className="py-2.5 pe-4 text-end">{m.calls}</td>
                        <td
                          className={`py-2.5 pe-4 text-end ${m.errors > 0 ? "font-bold text-[#253237]" : "text-[#9db4c0]"}`}
                        >
                          {m.errors}
                        </td>
                        <td className="py-2.5 pe-4 text-end">
                          {m.promptTokens.toLocaleString()} (
                          {m.cachedTokens.toLocaleString()})
                        </td>
                        <td className="py-2.5 pe-4 text-end">
                          {m.completionTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pe-4 text-end">
                          {m.avgLatencyMs}ms
                        </td>
                        <td className="py-2.5 text-end font-semibold text-[#253237]">
                          {formatUsd(m.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Level 3: distributions as quiet definition lists */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#253237]">
                  {isHe ? "סטטוס שאילתות" : "Query status"}
                </h2>
                <dl
                  dir="ltr"
                  className="divide-y divide-[#253237]/8 border-t border-[#253237]/10 text-xs font-mono"
                >
                  {Object.entries(eco.statusCounts).map(([status, count]) => (
                    <div key={status} className="flex justify-between py-2">
                      <dt className="text-[#5c6b73]">{status}</dt>
                      <dd className="font-semibold text-[#253237]">{count}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-[#253237]">
                  {isHe ? "אחסון" : "Storage"}{" "}
                  <span className="font-mono font-normal text-[#5c6b73]">
                    {formatBytes(data.storage.totalStorageBytes)}
                  </span>
                </h2>
                <dl
                  dir="ltr"
                  className="divide-y divide-[#253237]/8 border-t border-[#253237]/10 text-xs font-mono"
                >
                  {Object.entries(data.storage.formatBreakdown).map(
                    ([mime, info]) => (
                      <div
                        key={mime}
                        className="flex justify-between gap-4 py-2"
                      >
                        <dt className="truncate text-[#253237]">{mime}</dt>
                        <dd className="shrink-0 text-[#5c6b73]">
                          {info.count} files · {formatBytes(info.bytes)} ·{" "}
                          {formatTokensCompact(info.tokens)} tok
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              </div>
            </section>

            <PipelineInspectorPanel />
          </>
        )}
      </main>
    </div>
  );
}
