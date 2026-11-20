"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Database,
  DollarSign,
  FileWarning,
  Loader2,
  RefreshCw,
  Server,
  ShieldCheck,
  Terminal,
  Trash2,
  Wrench,
} from "lucide-react";
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

  return (
    <div className="min-h-screen flex flex-col bg-[#f2fafb]">
      <Navbar mode="developer" user={user} />

      <main className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Header Bar */}
        <div className="animate-fade-in-up flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#253237]">
                {isHe
                  ? "מרכז שליטה, לוגים ותיקון עצמי למפתחים (Developer Ops)"
                  : "Developer System Diagnostics, Error Logs & Self-Healing Console"}
              </h2>
              <span className="rounded-md bg-[#253237] px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-[#e0fbfc]">
                DEVELOPER
              </span>
            </div>
            <p className="text-xs sm:text-sm text-[#5c6b73] mt-0.5">
              {isHe
                ? "ניטור שגיאות מערכת, בריאות שרת ו-DOMMatrix, עלויות וחיסכון מטמון, וכלי תיקון אוטומטיים בלחיצה"
                : "Real-time system & stack-trace logs, DOMMatrix/PDF runtime health, deep token cost economics, and one-click self-healing tools"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {data && (
              <span className="hidden sm:inline font-mono text-[11px] text-[#5c6b73]">
                {new Date(data.generatedAt).toLocaleTimeString()}
              </span>
            )}
            <button
              id="dev-refresh-btn"
              type="button"
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              className="btn-jet inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
              <span>{isHe ? "רענון דיאגנוסטיקה" : "Refresh Diagnostics"}</span>
            </button>
          </div>
        </div>

        {repairFeedback && (
          <div className="animate-toast-in rounded-xl bg-[#e0fbfc] border-[1.5px] border-[#253237] px-4 py-3 text-xs font-semibold text-[#253237] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[#253237]" />
              <span>{repairFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setRepairFeedback(null)}
              className="text-xs underline cursor-pointer"
            >
              {isHe ? "סגור" : "Dismiss"}
            </button>
          </div>
        )}

        {error && (
          <div className="animate-toast-in rounded-xl bg-[#253237] px-4 py-3 text-xs font-medium text-[#e0fbfc] border border-[#5c6b73]">
            {error}
          </div>
        )}

        {isLoading || !data ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-[#5c6b73]">
            <Loader2 className="h-6 w-6 animate-spin text-[#253237]" />
            <p className="text-sm font-medium">
              {isHe
                ? "טוען לוגים ודיאגנוסטיקת מערכת…"
                : "Loading developer diagnostics & system logs…"}
            </p>
          </div>
        ) : (
          <>
            {/* 1. System Health & Runtime Status Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {/* Runtime & DB Health */}
              <div className="animate-fade-in-up stagger-1 interactive-card rounded-2xl bg-white border border-[#9db4c0]/50 border-t-4 border-t-[#e0fbfc] p-5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe ? "בריאות מסד נתונים ושרת" : "DB & Runtime Health"}
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237]">
                    <Database className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-[#253237]">
                    {data.health.dbPingMs}ms
                  </span>
                  <span className="rounded-full bg-[#e0fbfc] px-2.5 py-0.5 text-[11px] font-bold text-[#253237] border border-[#9db4c0]/60">
                    PostgreSQL OK
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#5c6b73] flex items-center justify-between">
                  <span>Node {data.health.nodeVersion}</span>
                  <span>
                    RAM {data.health.heapUsedMb}/{data.health.rssMb} MB
                  </span>
                </div>
              </div>

              {/* PDF Engine & DOMMatrix Polyfill Status */}
              <div className="animate-fade-in-up stagger-2 interactive-card rounded-2xl bg-white border border-[#9db4c0]/50 border-t-4 border-t-[#c2dfe3] p-5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe ? "מנוע PDF ו-DOMMatrix" : "PDF Engine & DOMMatrix"}
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#c2dfe3] text-[#253237]">
                    <Server className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#253237] px-2.5 py-1 text-xs font-bold text-[#e0fbfc]">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#e0fbfc]" />
                    {data.health.domMatrixPolyfillActive
                      ? "DOMMatrix Polyfill Active"
                      : "DOMMatrix Missing"}
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#5c6b73] flex items-center justify-between">
                  <span>
                    ImageData: {data.health.imageDataPolyfillActive ? "OK" : "—"}
                  </span>
                  <span>
                    Path2D: {data.health.path2DPolyfillActive ? "OK" : "—"}
                  </span>
                </div>
              </div>

              {/* Deep Cost & Cache Savings Economics */}
              <div className="animate-fade-in-up stagger-3 interactive-card rounded-2xl bg-white border border-[#9db4c0]/50 border-t-4 border-t-[#5c6b73] p-5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe ? "עלות בפועל מול חיסכון מטמון" : "Cost & Cache Savings"}
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#9db4c0]/45 text-[#253237]">
                    <DollarSign className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-[#253237]">
                    {formatUsd(data.economics.actualCostUsd)}
                  </span>
                  <span className="rounded-md bg-[#e0fbfc] px-2 py-0.5 font-mono text-[11px] font-bold text-[#253237] border border-[#9db4c0]/50">
                    {isHe ? "נחסך:" : "Saved:"}{" "}
                    {formatUsd(data.economics.savedByCacheUsd)} (
                    {data.economics.cacheHitRatePercent}%)
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#5c6b73] flex items-center justify-between">
                  <span>
                    {formatTokensCompact(data.economics.totalTokens)} total tok
                  </span>
                  <span>
                    {formatTokensCompact(data.economics.totalCachedTokens)} cached
                  </span>
                </div>
              </div>

              {/* Latency Percentiles & Error Count */}
              <div className="animate-fade-in-up stagger-4 interactive-card rounded-2xl bg-white border border-[#9db4c0]/50 border-t-4 border-t-[#253237] p-5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe ? "אחוזוני השהיה ושגיאות" : "Latency Percentiles & Errors"}
                  </span>
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253237] text-[#e0fbfc]">
                    <Activity className="h-4 w-4" />
                  </span>
                </div>
                <div className="flex items-baseline justify-between font-mono">
                  <span className="text-2xl font-bold text-[#253237]">
                    P50: {data.economics.p50LatencyMs}ms
                  </span>
                  <span className="text-xs font-semibold text-[#5c6b73]">
                    P95: {data.economics.p95LatencyMs}ms
                  </span>
                </div>
                <div className="text-[11px] font-mono text-[#5c6b73] flex items-center justify-between">
                  <span>
                    {isHe ? "שגיאות פתוחות:" : "Unresolved Errors:"}{" "}
                    <strong className="text-[#253237]">
                      {data.anomalies.unresolvedErrorsCount}
                    </strong>
                  </span>
                  <span>
                    {isHe ? "נכשלו:" : "Failed Calls:"}{" "}
                    <strong className="text-[#253237]">
                      {data.anomalies.failedQueryLogsCount}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Self-Healing & Automated Repair Console */}
            <div className="animate-fade-in-up stagger-2 rounded-2xl bg-white border border-[#9db4c0]/55 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-[#253237] text-[#e0fbfc] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#e0fbfc] text-[#253237]">
                    <Wrench className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">
                      {isHe
                        ? "כלי תיקון עצמי ותחזוקה מהירה (Self-Healing Repair Actions)"
                        : "Self-Healing & Quick Repair Actions"}
                    </h3>
                    <p className="text-xs text-[#c2dfe3]">
                      {isHe
                        ? "בדיקה ותיקון אוטומטי של מנוע ה-PDF (DOMMatrix), ספירת טוקנים, ניקוי קבצים פגומים ואיפוס שגיאות"
                        : "Diagnose and repair PDF DOMMatrix runtime, recalculate token quotas, purge corrupted uploads, and resolve error states"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {/* Action 1: Verify & Self-Test PDF DOMMatrix */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {isHe
                          ? "בדיקה ותיקון מנוע PDF + DOMMatrix"
                          : "Verify & Self-Test PDF / DOMMatrix Engine"}
                      </p>
                      <span className="rounded-full bg-[#e0fbfc] px-2 py-0.5 font-mono text-[10px] font-bold text-[#253237] border border-[#9db4c0]">
                        {data.health.domMatrixPolyfillActive ? "READY" : "FIX"}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מוודא ש-DOMMatrix, ImageData ו-Path2D מותקנים בזיכרון השרת ומריץ פענוח PDF חי לבדיקת תקינות מלאה."
                        : "Ensures DOMMatrix, ImageData & Path2D polyfills are active in Node globalThis and parses an in-memory test PDF."}
                    </p>
                  </div>
                  <button
                    id="repair-pdf-polyfill-btn"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runRepair("VERIFY_PDF_POLYFILL")}
                    className="btn-jet w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    {pendingAction === "VERIFY_PDF_POLYFILL" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isHe
                        ? "הרץ בדיקת PDF ו-DOMMatrix"
                        : "Run PDF & DOMMatrix Self-Test"}
                    </span>
                  </button>
                </div>

                {/* Action 2: Recalculate Document Tokens & Fix Quota Overflows */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {isHe
                          ? "סנכרון מחדש של טוקנים ותיקון חריגות 150k"
                          : "Recalculate Document Tokens & Fix Overflows"}
                      </p>
                      <span className="rounded-full bg-[#c2dfe3] px-2 py-0.5 font-mono text-[10px] font-bold text-[#253237]">
                        {data.anomalies.usersOverTokenCap} overflow
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מחשב מחדש את כמות הטוקנים לכל המסמכים ומבטל סימון אוטומטית אם משתמש חרג מתקרת 150,000 הטוקנים."
                        : "Recomputes token counts across all uploaded documents and auto-unchecks overflow files exceeding the 150k token ceiling."}
                    </p>
                  </div>
                  <button
                    id="repair-recalc-tokens-btn"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runRepair("RECALCULATE_DOCUMENT_TOKENS")}
                    className="btn-jet w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    {pendingAction === "RECALCULATE_DOCUMENT_TOKENS" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Cpu className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isHe
                        ? "חשב טוקנים ותקן חריגות"
                        : "Recalculate & Repair Quotas"}
                    </span>
                  </button>
                </div>

                {/* Action 3: Purge Corrupted / Empty Documents */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {isHe
                          ? "ניקוי קבצים פגומים או ריקים"
                          : "Purge Corrupted / Empty Documents"}
                      </p>
                      <span className="rounded-full bg-[#c2dfe3] px-2 py-0.5 font-mono text-[10px] font-bold text-[#253237]">
                        {data.anomalies.corruptedOrEmptyDocs} found
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מסיר מסמכים שנכשלו בחילוץ טקסט (0 טוקנים או 0 בתים) כדי לשחרר את מכסת 10 הקבצים של המשתמש."
                        : "Removes any zero-byte or zero-token documents that failed extraction so user file slots are freed cleanly."}
                    </p>
                  </div>
                  <button
                    id="repair-purge-docs-btn"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runRepair("PURGE_CORRUPTED_DOCUMENTS")}
                    className="btn-jet w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    {pendingAction === "PURGE_CORRUPTED_DOCUMENTS" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileWarning className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isHe ? "נקה מסמכים פגומים" : "Purge Corrupted Documents"}
                    </span>
                  </button>
                </div>

                {/* Action 4: Resolve Error Logs & Clear Failed Usage Entries */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {isHe
                          ? "סימון שגיאות כטופלו וניקוי קריאות שנכשלו"
                          : "Resolve Open Error Logs & Failed Calls"}
                      </p>
                      <span className="rounded-full bg-[#253237] px-2 py-0.5 font-mono text-[10px] font-bold text-[#e0fbfc]">
                        {data.anomalies.unresolvedErrorsCount +
                          data.anomalies.failedQueryLogsCount}{" "}
                        open
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מסמן את כל שגיאות המערכת הפתוחות כטופלו ומנקה רשומות ERROR ישנות מיומן השימוש."
                        : "Marks all open SystemLog errors as resolved and removes failed (ERROR) entries from UsageLog metrics."}
                    </p>
                  </div>
                  <button
                    id="repair-resolve-errors-btn"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() => void runRepair("RESOLVE_ALL_ERRORS")}
                    className="btn-jet w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    {pendingAction === "RESOLVE_ALL_ERRORS" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isHe ? "אפס שגיאות פתוחות" : "Resolve All Open Errors"}
                    </span>
                  </button>
                </div>

                {/* Action 5: Verify & Restore Admin + Developer Accounts */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#253237]">
                      {isHe
                        ? "שחזור הרשאות חשבונות מערכת (Admin & Developer)"
                        : "Restore Default Admin & Developer Credentials"}
                    </p>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מוודא שחשבונות admin/admin ו-Developer/Developer פעילים, לא חסומים ומוגדרים עם ההרשאות הנכונות."
                        : 'Ensures "admin" / "admin" and "Developer" / "Developer" exist, are unblocked, and have their default passwords.'}
                    </p>
                  </div>
                  <button
                    id="repair-reset-accounts-btn"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={() =>
                      void runRepair("RESET_ADMIN_AND_DEV_ACCOUNTS")
                    }
                    className="btn-jet w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                  >
                    {pendingAction === "RESET_ADMIN_AND_DEV_ACCOUNTS" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Wrench className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {isHe ? "שחזר חשבונות מערכת" : "Verify System Accounts"}
                    </span>
                  </button>
                </div>

                {/* Action 6: Clear Resolved Logs / Unblock All Users */}
                <div className="rounded-xl bg-[#f2fafb] p-4 border border-[#9db4c0]/55 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {isHe
                          ? "ניקוי לוגים שטופלו / שחרור משתמשים חסומים"
                          : "Prune Resolved Logs & Unblock Users"}
                      </p>
                      <span className="rounded-full bg-[#c2dfe3] px-2 py-0.5 font-mono text-[10px] font-bold text-[#253237]">
                        {data.anomalies.blockedUsersCount} blocked
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-[#5c6b73] leading-relaxed">
                      {isHe
                        ? "מוחק לוגים שכבר סומנו כטופלו או משחרר את כל המשתמשים החסומים במערכת בלחיצה אחת."
                        : "Prunes resolved SystemLog rows from the database or unblocks all currently blocked user accounts."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => void runRepair("CLEAR_RESOLVED_LOGS")}
                      className="interactive-chip inline-flex items-center justify-center gap-1 rounded-xl bg-white hover:bg-[#e0fbfc] px-2.5 py-2 text-xs font-semibold text-[#253237] border border-[#9db4c0] cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{isHe ? "נקה לוגים" : "Prune Logs"}</span>
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={() => void runRepair("UNBLOCK_ALL_USERS")}
                      className="btn-jet inline-flex items-center justify-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold cursor-pointer"
                    >
                      <span>{isHe ? "שחרר חסימות" : "Unblock All"}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Live System & Error Logs Console */}
            <div className="animate-fade-in-up stagger-3 rounded-2xl bg-white border border-[#9db4c0]/55 shadow-xs overflow-hidden">
              <div className="px-5 py-4 bg-[#c2dfe3]/60 border-b border-[#9db4c0]/45 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#253237] text-[#e0fbfc]">
                    <Terminal className="h-4 w-4" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-[#253237]">
                      {isHe
                        ? "יומן לוגים ושגיאות מערכת (System & Stack-Trace Logs)"
                        : "System & Error Logs (with Stack Traces & Metadata)"}
                    </h3>
                    <p className="text-xs text-[#5c6b73]">
                      {isHe
                        ? "מתעד כל שגיאת פענוח קובץ (PDF/DOCX), חריגת API, זמני ריצה ופעולות תיקון"
                        : "Captures PDF/DOCX parser exceptions, OpenAI stream errors, upload events, and self-healing actions"}
                    </p>
                  </div>
                </div>

                {/* Filter Tabs */}
                <div className="inline-flex rounded-xl bg-white p-1 border border-[#9db4c0]/55 text-[11px] font-semibold">
                  {(
                    ["ALL", "UNRESOLVED", "ERROR", "WARN", "INFO"] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setLogFilter(tab)}
                      className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                        logFilter === tab
                          ? "bg-[#253237] text-[#e0fbfc]"
                          : "text-[#5c6b73] hover:text-[#253237]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              </div>

              {filteredLogs.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#5c6b73]">
                  {isHe
                    ? "אין רשומות לוג התואמות לסינון הנוכחי."
                    : "No system log entries match the selected filter."}
                </div>
              ) : (
                <div className="divide-y divide-[#9db4c0]/30 max-h-[460px] overflow-y-auto">
                  {filteredLogs.map((log) => {
                    const isErr =
                      log.level === "ERROR" || log.level === "CRITICAL";
                    const isWarn = log.level === "WARN";
                    const isExpanded = expandedLogId === log.id;

                    return (
                      <div
                        key={log.id}
                        className={`p-4 transition-colors ${
                          isErr && !log.resolved
                            ? "bg-[#e0fbfc]/40"
                            : "hover:bg-[#f2fafb]"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                                isErr
                                  ? "bg-[#253237] text-[#e0fbfc]"
                                  : isWarn
                                    ? "bg-[#c2dfe3] text-[#253237]"
                                    : "bg-[#e0fbfc] text-[#253237] border border-[#9db4c0]"
                              }`}
                            >
                              {isErr && <AlertTriangle className="h-3 w-3" />}
                              {log.level}
                            </span>
                            <span className="rounded bg-[#f2fafb] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#253237] border border-[#9db4c0]/45">
                              {log.source}
                            </span>
                            {log.username && (
                              <span className="font-mono text-[11px] text-[#5c6b73]">
                                @{log.username}
                              </span>
                            )}
                            <span className="font-mono text-[11px] text-[#5c6b73]">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {(Boolean(log.stack) || Boolean(log.meta)) && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedLogId(isExpanded ? null : log.id)
                                }
                                className="text-[11px] font-semibold text-[#5c6b73] hover:text-[#253237] underline cursor-pointer"
                              >
                                {isExpanded
                                  ? isHe
                                    ? "הסתר פרטים"
                                    : "Hide Trace"
                                  : isHe
                                    ? "הצג Stack / Meta"
                                    : "View Stack / Meta"}
                              </button>
                            )}
                            {!log.resolved ? (
                              <button
                                type="button"
                                disabled={pendingAction === log.id}
                                onClick={() => void resolveSingleLog(log.id)}
                                className="rounded-lg bg-[#253237] hover:bg-[#5c6b73] px-2.5 py-1 text-[10px] font-semibold text-[#e0fbfc] cursor-pointer"
                              >
                                {isHe ? "סמן כטופל" : "Resolve"}
                              </button>
                            ) : (
                              <span className="rounded-full bg-[#e0fbfc] px-2 py-0.5 text-[10px] font-semibold text-[#5c6b73] border border-[#9db4c0]/50">
                                {isHe ? "טופל" : "Resolved"}
                              </span>
                            )}
                          </div>
                        </div>

                        <p
                          dir="auto"
                          className="mt-1.5 text-xs font-mono text-[#253237] break-words"
                        >
                          {log.message}
                        </p>

                        {isExpanded && (
                          <div className="mt-2.5 space-y-2">
                            {Boolean(log.meta) && (
                              <pre
                                dir="ltr"
                                className="rounded-xl bg-[#f2fafb] p-3 text-[11px] font-mono text-[#253237] border border-[#9db4c0]/50 overflow-x-auto"
                              >
                                {JSON.stringify(log.meta, null, 2)}
                              </pre>
                            )}
                            {log.stack && (
                              <pre
                                dir="ltr"
                                className="rounded-xl bg-[#253237] p-3 text-[11px] font-mono text-[#e0fbfc] overflow-x-auto whitespace-pre-wrap"
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
            </div>

            {/* 4. Per-Model Cost, Token & Query Status Breakdown */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
              <div className="xl:col-span-7 rounded-2xl bg-white border border-[#9db4c0]/55 p-5 shadow-xs space-y-3">
                <h3 className="text-sm font-semibold text-[#253237]">
                  {isHe
                    ? "פירוט שימוש, טוקנים, שגיאות ועלויות לפי מודל AI"
                    : "Per-Model AI Usage, Token Economics & Error Rate"}
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-start border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#f2fafb] text-[11px] font-semibold uppercase text-[#5c6b73] border-b border-[#9db4c0]/35">
                        <th className="py-2.5 px-3 text-start">Model</th>
                        <th className="py-2.5 px-3 text-end">Calls</th>
                        <th className="py-2.5 px-3 text-end">Errors</th>
                        <th className="py-2.5 px-3 text-end">Input / Cached</th>
                        <th className="py-2.5 px-3 text-end">Output</th>
                        <th className="py-2.5 px-3 text-end">Avg Latency</th>
                        <th className="py-2.5 px-3 text-end">Cost (USD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#9db4c0]/25 font-mono">
                      {data.models.map((m) => (
                        <tr key={m.model} className="hover:bg-[#f2fafb]">
                          <td className="py-2.5 px-3 font-semibold text-[#253237]">
                            {m.model}
                          </td>
                          <td className="py-2.5 px-3 text-end">{m.calls}</td>
                          <td className="py-2.5 px-3 text-end">
                            {m.errors > 0 ? (
                              <span className="rounded bg-[#253237] px-1.5 py-0.5 text-[10px] font-bold text-[#e0fbfc]">
                                {m.errors}
                              </span>
                            ) : (
                              "0"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-end">
                            {m.promptTokens.toLocaleString()} (
                            {m.cachedTokens.toLocaleString()})
                          </td>
                          <td className="py-2.5 px-3 text-end">
                            {m.completionTokens.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3 text-end">
                            {m.avgLatencyMs}ms
                          </td>
                          <td className="py-2.5 px-3 text-end font-bold text-[#253237]">
                            {formatUsd(m.costUsd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="xl:col-span-5 rounded-2xl bg-white border border-[#9db4c0]/55 p-5 shadow-xs space-y-4">
                <h3 className="text-sm font-semibold text-[#253237]">
                  {isHe
                    ? "התפלגות סטטוס שאילתות ופורמטי מסמכים"
                    : "Query Status Distribution & Storage Formats"}
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs">
                  {Object.entries(data.economics.statusCounts).map(
                    ([status, count]) => (
                      <div
                        key={status}
                        className="rounded-xl bg-[#f2fafb] p-3 border border-[#9db4c0]/45"
                      >
                        <p className="text-[10px] font-bold text-[#5c6b73] truncate">
                          {status}
                        </p>
                        <p className="mt-1 text-lg font-bold text-[#253237]">
                          {count}
                        </p>
                      </div>
                    )
                  )}
                </div>

                <div className="pt-2 border-t border-[#9db4c0]/35 space-y-2">
                  <p className="text-xs font-bold text-[#5c6b73]">
                    {isHe ? "אחסון לפי סוג קובץ:" : "Indexed Storage by MIME Type:"}{" "}
                    ({formatBytes(data.storage.totalStorageBytes)})
                  </p>
                  <div className="space-y-1.5 text-xs font-mono">
                    {Object.entries(data.storage.formatBreakdown).map(
                      ([mime, info]) => (
                        <div
                          key={mime}
                          className="flex items-center justify-between rounded-lg bg-[#e0fbfc]/45 px-3 py-1.5 border border-[#9db4c0]/40"
                        >
                          <span className="truncate max-w-[200px] text-[#253237]">
                            {mime}
                          </span>
                          <span className="text-[#5c6b73]">
                            {info.count} files • {formatBytes(info.bytes)} •{" "}
                            {formatTokensCompact(info.tokens)} tok
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 5. 4-Layer Security Pipeline Simulator */}
            <PipelineInspectorPanel />
          </>
        )}
      </main>
    </div>
  );
}
