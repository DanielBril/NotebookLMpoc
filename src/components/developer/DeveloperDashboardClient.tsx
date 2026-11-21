"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Cpu,
  FileDown,
  Loader2,
  MessageSquareQuote,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PipelineInspectorPanel } from "@/components/admin/PipelineInspectorPanel";
import {
  DeveloperAnalyticsCharts,
  exportDeveloperReportToPdf,
  type DeveloperAnalyticsPayload,
  type DeveloperGraphId,
} from "@/components/developer/DeveloperAnalyticsCharts";
import {
  formatLatencySeconds,
  formatTokensCompact,
  formatUsd,
} from "@/lib/pricing";
import { useLanguage } from "@/lib/i18n";
import type { RepairAction } from "@/app/api/developer/repair/route";
import type { ModelOption } from "@/lib/modelConfig";

interface DeveloperDiagnosticsResponse {
  generatedAt: string;
  health: {
    dbConnected: boolean;
    dbPingMs: number;
    openAiConfigured: boolean;
    primaryModel: string;
    modelUpdatedBy: string | null;
    modelUpdatedAt: string | null;
    availableModels: ModelOption[];
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
    errorsCount: number;
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
  analytics: DeveloperAnalyticsPayload;
  decisionLogs: Array<{
    id: string;
    userId: string;
    username: string;
    status:
      | "NO_CONTEXT_FOUND"
      | "BLOCKED_INJECTION"
      | "BLOCKED_OUT_OF_SCOPE"
      | "ERROR"
      | "SUCCESS";
    model: string;
    reason: string | null;
    flaggedText: string | null;
    userMessage: string | null;
    promptTokens: number;
    latencyMs: number;
    createdAt: string;
  }>;
  systemLogs: Array<{
    id: string;
    level: "INFO" | "WARN" | "ERROR" | "CRITICAL";
    source: string;
    message: string;
    stack: string | null;
    meta: unknown;
    userId: string | null;
    username: string | null;
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

interface InlineActionResult {
  ok: boolean;
  message: string;
  at: string;
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
  const [actionResults, setActionResults] = useState<
    Record<string, InlineActionResult>
  >({});
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [isSavingModel, setIsSavingModel] = useState(false);
  const [modelResult, setModelResult] = useState<InlineActionResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [graph1, setGraph1] = useState<DeveloperGraphId>("filesByType");
  const [graph2, setGraph2] = useState<DeveloperGraphId>("overallSuccessRate");
  const [decisionFilter, setDecisionFilter] = useState<
    | "ALL"
    | "NO_CONTEXT_FOUND"
    | "BLOCKED_INJECTION"
    | "BLOCKED_OUT_OF_SCOPE"
    | "ERROR"
  >("ALL");
  const [logFilter, setLogFilter] = useState<"ALL" | "ERROR" | "WARN" | "INFO">(
    "ALL"
  );
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
      setSelectedModel(json.health.primaryModel);
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
        setSelectedModel(json.health.primaryModel);
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
    try {
      const res = await fetch("/api/developer/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        summary?: string;
        error?: string;
      };
      const nowTime = new Date().toLocaleTimeString();
      if (!res.ok) {
        setActionResults((prev) => ({
          ...prev,
          [action]: {
            ok: false,
            message: json.error || "Action failed.",
            at: nowTime,
          },
        }));
      } else {
        setActionResults((prev) => ({
          ...prev,
          [action]: {
            ok: true,
            message: json.summary || "Action completed successfully.",
            at: nowTime,
          },
        }));
        await handleRefresh();
      }
    } catch {
      setActionResults((prev) => ({
        ...prev,
        [action]: {
          ok: false,
          message: "Network error while running action.",
          at: new Date().toLocaleTimeString(),
        },
      }));
    } finally {
      setPendingAction(null);
    }
  }

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
      const nowTime = new Date().toLocaleTimeString();
      if (!res.ok) {
        setModelResult({
          ok: false,
          message:
            json.error ||
            (isHe ? "שמירת המודל נכשלה." : "Failed to update model."),
          at: nowTime,
        });
      } else {
        setModelResult({
          ok: true,
          message: isHe
            ? `המודל הגלובלי הוחלף ל-${json.primaryModel} עבור כל המשתמשים.`
            : `Global active model switched to "${json.primaryModel}" for all users.`,
          at: nowTime,
        });
        await handleRefresh();
      }
    } catch {
      setModelResult({
        ok: false,
        message: isHe
          ? "שגיאת רשת בעדכון המודל."
          : "Network error while updating model.",
        at: new Date().toLocaleTimeString(),
      });
    } finally {
      setIsSavingModel(false);
    }
  }

  const filteredLogs = useMemo(() => {
    if (!data) return [];
    return data.systemLogs.filter((l) => {
      if (logFilter === "ALL") return true;
      if (logFilter === "ERROR")
        return l.level === "ERROR" || l.level === "CRITICAL";
      return l.level === logFilter;
    });
  }, [data, logFilter]);

  const filteredDecisions = useMemo(() => {
    if (!data?.decisionLogs) return [];
    return data.decisionLogs.filter((d) =>
      decisionFilter === "ALL" ? true : d.status === decisionFilter
    );
  }, [data, decisionFilter]);

  const h = data?.health;
  const eco = data?.economics;
  const anom = data?.anomalies;

  const pdfReportData = useMemo(() => {
    if (!data) return null;
    return {
      generatedAt: data.generatedAt,
      primaryModel: data.health.primaryModel,
      dbPingMs: data.health.dbPingMs,
      totalUsers: data.storage.totalUsers,
      totalDocuments: data.storage.totalDocuments,
      totalStorageBytes: data.storage.totalStorageBytes,
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
      decisionLogs: data.decisionLogs,
    };
  }, [data]);

  const repairs: Array<{
    id: string;
    action: RepairAction;
    title: string;
    desc: string;
    stat: string | null;
    cta: string;
    tone: "teal" | "amber" | "rose" | "blue";
  }> = data
    ? [
        {
          id: "repair-pdf-polyfill-btn",
          action: "VERIFY_PDF_POLYFILL",
          title: isHe
            ? "בדיקת מנוע PDF ו-DOMMatrix"
            : "Verify PDF / DOMMatrix engine",
          desc: isHe
            ? "מוודא שה-polyfills פעילים ומפענח PDF בדיקה בזיכרון."
            : "Confirms polyfills are active and parses an in-memory test PDF.",
          stat: data.health.domMatrixPolyfillActive ? "Ready" : "Needs fix",
          cta: isHe ? "הרץ בדיקה" : "Run test",
          tone: "teal",
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
          tone: "blue",
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
          tone: "rose",
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
          tone: "blue",
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
          tone: "amber",
        },
      ]
    : [];

  const toneBtnClass: Record<"teal" | "amber" | "rose" | "blue", string> = {
    teal: "text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-200",
    blue: "text-blue-800 bg-blue-50 hover:bg-blue-100 border-blue-200",
    amber: "text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200",
    rose: "text-rose-800 bg-rose-50 hover:bg-rose-100 border-rose-200",
  };

  const th =
    "py-2 pe-4 text-[11px] font-medium text-slate-500 text-start whitespace-nowrap";

  return (
    <div className="min-h-screen flex flex-col glass-canvas">
      <Navbar mode="developer" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1140px] px-4 sm:px-8 py-10 space-y-12">
        {/* Header: title + Export PDF + Refresh */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div dir={isHe ? "rtl" : "ltr"} className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
              {isHe
                ? "דיאגנוסטיקה, החלטות ולוגים"
                : "Diagnostics, Decisions & Logs"}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {isHe
                ? "שליטה במודל הגלובלי, גרפים מותאמים, סיבות חסימה וחוסר הקשר, וכלי תחזוקה."
                : "Global model control, custom analytics charts, exact block / no-context audit, and maintenance tools."}
              {data && (
                <span className="font-mono text-xs text-slate-400" dir="ltr">
                  {" "}
                  · {new Date(data.generatedAt).toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {pdfReportData && (
              <button
                type="button"
                onClick={() =>
                  exportDeveloperReportToPdf(
                    pdfReportData,
                    graph1,
                    graph2,
                    isHe ? "he" : "en"
                  )
                }
                className="inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50/90 hover:bg-blue-100 px-3.5 py-2 text-xs sm:text-sm font-medium text-blue-900 cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5 shrink-0" />
                <span>{isHe ? "ייצוא PDF" : "Export PDF"}</span>
              </button>
            )}
            <button
              id="dev-refresh-btn"
              type="button"
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              className="btn-jet inline-flex items-center gap-2 shrink-0 whitespace-nowrap rounded-lg px-4 py-2 text-xs sm:text-sm font-medium cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{isHe ? "רענון" : "Refresh"}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 border-s-4 border-s-rose-600 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        )}

        {isLoading || !data || !h || !eco || !anom ? (
          <div className="py-24 flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-teal-600" />
            <p className="text-sm">
              {isHe ? "טוען דיאגנוסטיקה…" : "Loading diagnostics…"}
            </p>
          </div>
        ) : (
          <>
            {/* Level 1: Key figures strip (All latencies in seconds) */}
            <section
              dir="ltr"
              className="grid grid-cols-2 lg:grid-cols-4 gap-y-8 gap-x-8 border-y border-slate-200 py-8"
            >
              {[
                {
                  label: isHe ? "מסד נתונים" : "Database",
                  value: formatLatencySeconds(h.dbPingMs),
                  dot: h.dbConnected ? "bg-emerald-500" : "bg-rose-500",
                  valueColor: "text-slate-900",
                  note: `Node ${h.nodeVersion} · ${h.heapUsedMb}/${h.rssMb} MB`,
                },
                {
                  label: isHe ? "עלות כוללת" : "Total cost",
                  value: formatUsd(eco.actualCostUsd),
                  dot: "bg-teal-500",
                  valueColor: "text-slate-900",
                  note: `${isHe ? "נחסך" : "Saved"} ${formatUsd(eco.savedByCacheUsd)} (${eco.cacheHitRatePercent}%) · ${formatTokensCompact(eco.totalTokens)} tok`,
                },
                {
                  label: isHe ? "השהיה P50 / P95" : "Latency P50 / P95",
                  value: `${formatLatencySeconds(eco.p50LatencyMs)} / ${formatLatencySeconds(eco.p95LatencyMs)}`,
                  dot: eco.p95LatencyMs > 5000 ? "bg-amber-500" : "bg-blue-500",
                  valueColor: "text-slate-900",
                  note: `P99 ${formatLatencySeconds(eco.p99LatencyMs)} · Avg ${formatLatencySeconds(eco.avgLatencyMs)}`,
                },
                {
                  label: isHe ? "שיעור הצלחה" : "Success rate",
                  value: `${data.analytics.overallSuccessRatePct}%`,
                  dot:
                    data.analytics.overallSuccessRatePct >= 75
                      ? "bg-emerald-500"
                      : "bg-amber-500",
                  valueColor:
                    data.analytics.overallSuccessRatePct >= 75
                      ? "text-emerald-700"
                      : "text-amber-700",
                  note: `${anom.errorsCount} ${isHe ? "שגיאות מערכת" : "system errors"} · ${anom.failedQueryLogsCount} ${isHe ? "קריאות שנכשלו" : "failed calls"}`,
                },
              ].map((s) => (
                <div key={s.label}>
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {s.label}
                  </p>
                  <p
                    className={`mt-1.5 text-2xl sm:text-3xl font-semibold tracking-tight font-mono ${s.valueColor}`}
                  >
                    {s.value}
                  </p>
                  <p className="mt-1.5 text-[11px] font-mono text-slate-400">
                    {s.note}
                  </p>
                </div>
              ))}
            </section>

            {/* Level 1: Global Model Switcher (applies to ALL users) */}
            <section className="glass-panel rounded-2xl border p-5 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.1)] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div dir={isHe ? "rtl" : "ltr"} className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Cpu className="h-4.5 w-4.5 text-teal-600 shrink-0" />
                    <h2 className="text-base font-semibold text-slate-900">
                      {isHe
                        ? "מודל AI פעיל לכל המשתמשים"
                        : "Global Active LLM Model (All Users)"}
                    </h2>
                    <span
                      dir="ltr"
                      className="rounded-full bg-teal-50 border border-teal-200 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-teal-800"
                    >
                      {h.primaryModel}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {isHe
                      ? "שינוי המודל כאן מתעדכן מיידית בבסיס הנתונים ומשפיע על הצ'אט ועל כלי הסטודיו עבור כל המשתמשים."
                      : "Switching the model here persists globally and immediately applies to Q&A chat and Studio tools for every user."}
                    {h.modelUpdatedBy && h.modelUpdatedAt && (
                      <span
                        dir="ltr"
                        className="ms-1.5 font-mono text-[11px] text-slate-400"
                      >
                        · {isHe ? "עודכן ע״י" : "Updated by"} @
                        {h.modelUpdatedBy} (
                        {new Date(h.modelUpdatedAt).toLocaleString()})
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                  <select
                    id="global-model-select"
                    value={selectedModel || h.primaryModel}
                    onChange={(e) => {
                      setSelectedModel(e.target.value);
                      setModelResult(null);
                    }}
                    dir="ltr"
                    className="flex-1 sm:flex-none min-w-[210px] max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 cursor-pointer"
                  >
                    {h.availableModels.map((m) => (
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
                      selectedModel === h.primaryModel
                    }
                    onClick={() => void handleSaveGlobalModel()}
                    className="btn-jet inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
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
                    const opt = h.availableModels.find(
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

            {/* Level 1: Customizable 2-Graph Analytics Section + PDF Export */}
            {pdfReportData && (
              <DeveloperAnalyticsCharts
                analytics={data.analytics}
                reportData={pdfReportData}
                isHe={isHe}
                graph1={graph1}
                graph2={graph2}
                onChangeGraph1={setGraph1}
                onChangeGraph2={setGraph2}
              />
            )}

            {/* Level 1: Blocked & Not-in-Context Decision Audit (with User Message) */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div dir={isHe ? "rtl" : "ltr"}>
                  <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                    {isHe
                      ? "יומן החלטות: מדוע הודעות נחסמו או סומנו כלא-בהקשר"
                      : "Decision Audit: Why Messages Were Blocked or Not-in-Context"}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {isHe
                      ? "מציג את ההודעה שהמשתמש שלח ואת הסיבה המדויקת (חוק, מילות מפתח שחסרו במקורות, או שכבת האבטחה)."
                      : "Shows the exact user message that triggered each decision along with the rule, missing keywords, or security layer."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {(
                    [
                      "ALL",
                      "NO_CONTEXT_FOUND",
                      "BLOCKED_INJECTION",
                      "BLOCKED_OUT_OF_SCOPE",
                      "ERROR",
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setDecisionFilter(tab)}
                      className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                        decisionFilter === tab
                          ? "bg-teal-600 text-white font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {tab === "ALL"
                        ? isHe
                          ? "הכל"
                          : "ALL"
                        : tab === "NO_CONTEXT_FOUND"
                          ? isHe
                            ? "לא בהקשר"
                            : "NO_CONTEXT"
                          : tab === "BLOCKED_INJECTION"
                            ? isHe
                              ? "הזרקה נחסמה"
                              : "INJECTION"
                            : tab === "BLOCKED_OUT_OF_SCOPE"
                              ? isHe
                                ? "מחוץ לתחום"
                                : "OUT_OF_SCOPE"
                              : "ERROR"}
                    </button>
                  ))}
                </div>
              </div>

              {filteredDecisions.length === 0 ? (
                <p
                  dir={isHe ? "rtl" : "ltr"}
                  className="py-8 text-sm text-slate-500 border-t border-slate-200"
                >
                  {isHe
                    ? "אין הודעות חסומות או מחוץ להקשר התואמות לסינון."
                    : "No blocked or not-in-context decisions match this filter."}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border-t border-slate-200 max-h-[460px] overflow-y-auto">
                  {filteredDecisions.map((d) => {
                    const statusBadge =
                      d.status === "BLOCKED_INJECTION"
                        ? "bg-rose-100 text-rose-800 border-rose-200"
                        : d.status === "BLOCKED_OUT_OF_SCOPE"
                          ? "bg-orange-100 text-orange-800 border-orange-200"
                          : d.status === "NO_CONTEXT_FOUND"
                            ? "bg-amber-100 text-amber-900 border-amber-200"
                            : "bg-red-100 text-red-800 border-red-200";

                    const msgText = d.userMessage || d.flaggedText;

                    return (
                      <div key={d.id} className="py-4 space-y-2">
                        <div
                          dir="ltr"
                          className="flex flex-wrap items-center justify-between gap-2"
                        >
                          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
                            <span
                              className={`rounded px-2 py-0.5 font-semibold border ${statusBadge}`}
                            >
                              {d.status}
                            </span>
                            <span className="font-semibold text-slate-800">
                              @{d.username}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{d.model}</span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">
                              {formatLatencySeconds(d.latencyMs)}
                            </span>
                          </div>
                          <span className="font-mono text-[11px] text-slate-400">
                            {new Date(d.createdAt).toLocaleString()}
                          </span>
                        </div>

                        {/* Triggering User Message */}
                        <div
                          dir={isHe ? "rtl" : "ltr"}
                          className={`rounded-xl border px-3.5 py-2.5 text-xs ${
                            d.status === "BLOCKED_INJECTION"
                              ? "bg-rose-50/75 border-rose-200/80 text-rose-950"
                              : "bg-white/85 border-slate-200/85 text-slate-900"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <MessageSquareQuote className="h-3.5 w-3.5 mt-0.5 text-slate-400 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold text-slate-500 me-1.5">
                                {isHe ? "הודעת המשתמש:" : "User message:"}
                              </span>
                              {msgText ? (
                                <span
                                  dir="auto"
                                  className="font-medium break-words whitespace-pre-wrap"
                                >
                                  {msgText}
                                </span>
                              ) : (
                                <span className="italic text-slate-400">
                                  {isHe
                                    ? "ההודעה אינה זמינה (היסטוריית הצ'אט נוקתה או נרשמה לפני העדכון)"
                                    : "Message unavailable (chat history cleared or logged before capture)"}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Exact Decision Reason */}
                        <p
                          dir="auto"
                          className="text-xs sm:text-sm text-slate-700 break-words"
                        >
                          <span className="font-semibold text-slate-500 me-1.5">
                            {isHe ? "סיבה:" : "Reason:"}
                          </span>
                          {d.reason ||
                            (d.status === "NO_CONTEXT_FOUND"
                              ? isHe
                                ? "נרשם לפני עדכון הלוגים המפורטים — המודל לא מצא תשובה מבוססת במקורות הפעילים."
                                : "Recorded prior to detailed overlap logging — model found no grounded answer in active sources."
                              : isHe
                                ? "לא צוינה סיבה מפורטת."
                                : "No detailed reason recorded.")}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Level 1: System & Stack-Trace Logs (No resolve option) */}
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2
                  dir={isHe ? "rtl" : "ltr"}
                  className="text-lg font-semibold tracking-tight text-slate-900"
                >
                  {isHe
                    ? "לוגי מערכת מלאים (כולל Stack Traces ומטא-דאטה)"
                    : "Full System Logs (Stack Traces & Decision Metadata)"}
                </h2>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  {(["ALL", "ERROR", "WARN", "INFO"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLogFilter(tab)}
                      className={`rounded-md px-2.5 py-1 transition-colors cursor-pointer ${
                        logFilter === tab
                          ? "bg-teal-600 text-white font-semibold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <p
                  dir={isHe ? "rtl" : "ltr"}
                  className="py-10 text-sm text-slate-500 border-t border-slate-200"
                >
                  {isHe
                    ? "אין רשומות התואמות לסינון."
                    : "No log entries match this filter."}
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border-t border-slate-200 max-h-[480px] overflow-y-auto">
                  {filteredLogs.map((log) => {
                    const isErr =
                      log.level === "ERROR" || log.level === "CRITICAL";
                    const isWarn = log.level === "WARN";
                    const isExpanded = expandedLogId === log.id;
                    const levelStyle = isErr
                      ? "bg-rose-100 text-rose-800 border-rose-200"
                      : isWarn
                        ? "bg-amber-100 text-amber-900 border-amber-200"
                        : "bg-blue-50 text-blue-800 border-blue-200";

                    return (
                      <div key={log.id} className="py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div
                            dir="ltr"
                            className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-500"
                          >
                            <span
                              className={`rounded px-1.5 py-0.5 font-semibold border ${levelStyle}`}
                            >
                              {log.level}
                            </span>
                            <span className="font-semibold text-slate-700">
                              {log.source}
                            </span>
                            {log.username && <span>@{log.username}</span>}
                            <span className="text-slate-400">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {(Boolean(log.stack) || Boolean(log.meta)) && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedLogId(isExpanded ? null : log.id)
                              }
                              className="text-xs font-medium text-blue-700 hover:text-blue-900 underline underline-offset-2 shrink-0 cursor-pointer"
                            >
                              {isExpanded
                                ? isHe
                                  ? "הסתר פרטים"
                                  : "Hide details"
                                : isHe
                                  ? "הצג פרטים / JSON"
                                  : "View details / JSON"}
                            </button>
                          )}
                        </div>
                        <p
                          dir="auto"
                          className="mt-1.5 text-sm text-slate-900 break-words"
                        >
                          {log.message}
                        </p>
                        {isExpanded && (
                          <div className="mt-2.5 space-y-2">
                            {Boolean(log.meta) && (
                              <pre
                                dir="ltr"
                                className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] font-mono text-slate-800 overflow-x-auto"
                              >
                                {JSON.stringify(log.meta, null, 2)}
                              </pre>
                            )}
                            {log.stack && (
                              <pre
                                dir="ltr"
                                className="rounded-lg bg-slate-900 p-3 text-[11px] font-mono text-rose-200 overflow-x-auto whitespace-pre-wrap"
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

            {/* Level 2: Repair & Maintenance Tools (Inline result directly under each action) */}
            <section className="space-y-4">
              <div dir={isHe ? "rtl" : "ltr"}>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                  {isHe ? "כלי תיקון ותחזוקה" : "Repair & Maintenance Tools"}
                </h2>
                <p className="text-sm text-slate-500">
                  {isHe
                    ? "פעולות בדיקה, תחזוקה ותיקון עצמי בלחיצה אחת — תוצאת כל פעולה מוצגת ישירות מתחתיה."
                    : "One-click diagnostic and maintenance actions — each result displays directly underneath the action."}
                </p>
              </div>
              <div className="divide-y divide-slate-100 border-t border-slate-200">
                {repairs.map((r) => {
                  const resItem = actionResults[r.action];
                  return (
                    <div key={r.id} className="py-4 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div
                          dir={isHe ? "rtl" : "ltr"}
                          className="min-w-0 flex-1 basis-72"
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {r.title}
                            {r.stat && (
                              <span
                                dir="ltr"
                                className="ms-2 font-mono text-[11px] font-medium text-slate-500"
                              >
                                ({r.stat})
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {r.desc}
                          </p>
                        </div>
                        <button
                          id={r.id}
                          type="button"
                          disabled={pendingAction !== null}
                          onClick={() => void runRepair(r.action)}
                          className={`inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap rounded-lg border px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40 transition-colors cursor-pointer ${toneBtnClass[r.tone]}`}
                        >
                          {pendingAction === r.action && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {r.cta}
                        </button>
                      </div>

                      {/* Inline Action Result Directly Under the Action */}
                      {resItem && (
                        <div
                          dir="auto"
                          className={`animate-fade-in flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
                            resItem.ok
                              ? "bg-emerald-50/90 border-emerald-200 text-emerald-950"
                              : "bg-rose-50/90 border-rose-200 text-rose-950"
                          }`}
                        >
                          <div className="flex items-start gap-2 min-w-0 flex-1">
                            {resItem.ok ? (
                              <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" />
                            )}
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="font-mono text-[11px] break-words leading-relaxed">
                                {resItem.message}
                              </p>
                              <p className="font-mono text-[10px] opacity-65">
                                {resItem.at}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setActionResults((prev) => {
                                const next = { ...prev };
                                delete next[r.action];
                                return next;
                              })
                            }
                            className="shrink-0 text-slate-500 hover:text-slate-900 cursor-pointer"
                            title={isHe ? "סגור" : "Dismiss"}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Level 2: Per-model table (Latency in seconds) */}
            <section className="space-y-4">
              <h2
                dir={isHe ? "rtl" : "ltr"}
                className="text-lg font-semibold tracking-tight text-slate-900"
              >
                {isHe ? "שימוש ועלויות לפי מודל" : "Usage & Cost by Model"}
              </h2>
              <div
                className="overflow-x-auto border-t border-slate-200"
                dir="ltr"
              >
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className={th}>Model</th>
                      <th className={`${th} text-end`}>Calls</th>
                      <th className={`${th} text-end`}>Errors</th>
                      <th className={`${th} text-end`}>Input (cached)</th>
                      <th className={`${th} text-end`}>Output</th>
                      <th className={`${th} text-end`}>Avg Latency</th>
                      <th className={`${th} text-end pe-0`}>Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.models.map((m) => (
                      <tr key={m.model} className="hover:bg-slate-50">
                        <td className="py-2.5 pe-4 font-semibold text-slate-900">
                          {m.model}
                        </td>
                        <td className="py-2.5 pe-4 text-end text-slate-700">
                          {m.calls}
                        </td>
                        <td
                          className={`py-2.5 pe-4 text-end ${
                            m.errors > 0
                              ? "font-bold text-rose-600"
                              : "text-slate-400"
                          }`}
                        >
                          {m.errors}
                        </td>
                        <td className="py-2.5 pe-4 text-end text-slate-700">
                          {m.promptTokens.toLocaleString()} (
                          <span className="text-teal-700">
                            {m.cachedTokens.toLocaleString()}
                          </span>
                          )
                        </td>
                        <td className="py-2.5 pe-4 text-end text-slate-700">
                          {m.completionTokens.toLocaleString()}
                        </td>
                        <td className="py-2.5 pe-4 text-end text-slate-700">
                          {formatLatencySeconds(m.avgLatencyMs)}
                        </td>
                        <td className="py-2.5 text-end font-semibold text-slate-900">
                          {formatUsd(m.costUsd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Level 3: Distributions */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <h2
                  dir={isHe ? "rtl" : "ltr"}
                  className="text-sm font-semibold text-slate-900"
                >
                  {isHe ? "התפלגות סטטוס שאילתות" : "Query Status Breakdown"}
                </h2>
                <dl
                  dir="ltr"
                  className="divide-y divide-slate-100 border-t border-slate-200 text-xs font-mono"
                >
                  {Object.entries(eco.statusCounts).map(([status, count]) => (
                    <div key={status} className="flex justify-between py-2">
                      <dt className="text-slate-600">{status}</dt>
                      <dd
                        className={`font-semibold ${
                          status === "SUCCESS"
                            ? "text-emerald-700"
                            : status === "NO_CONTEXT_FOUND"
                              ? "text-amber-700"
                              : count > 0
                                ? "text-rose-600"
                                : "text-slate-400"
                        }`}
                      >
                        {count}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div className="space-y-3">
                <h2
                  dir={isHe ? "rtl" : "ltr"}
                  className="text-sm font-semibold text-slate-900"
                >
                  {isHe ? "אחסון" : "Storage"}{" "}
                  <span className="font-mono font-normal text-slate-500">
                    {formatBytes(data.storage.totalStorageBytes)}
                  </span>
                </h2>
                <dl
                  dir="ltr"
                  className="divide-y divide-slate-100 border-t border-slate-200 text-xs font-mono"
                >
                  {Object.entries(data.storage.formatBreakdown).map(
                    ([mime, info]) => (
                      <div
                        key={mime}
                        className="flex justify-between gap-4 py-2"
                      >
                        <dt className="truncate text-slate-800">{mime}</dt>
                        <dd className="shrink-0 text-slate-500">
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
