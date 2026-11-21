"use client";

import { useState } from "react";
import { BarChart3, FileDown } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatLatencySeconds,
  formatTokensCompact,
  formatUsd,
} from "@/lib/pricing";

export type DeveloperGraphId =
  | "filesByType"
  | "filesPerUser"
  | "avgTokensPerQuestionByModel"
  | "avgTokensPerQuestionByUser"
  | "overallSuccessRate"
  | "successRateByUser"
  | "avgLatencySecByModel"
  | "costByModel"
  | "peakUsageHours"
  | "weeklyVolumeLatency";

export interface PeakHoursAnalyticsData {
  hourlyDistribution: Array<{
    hour: number;
    label: string;
    queries: number;
    tokens: number;
    isPeak: boolean;
  }>;
  peakWindowSummary: {
    label: string;
    sharePercent: number;
    peakQueries: number;
  } | null;
  dayOfWeekDistribution: Array<{
    day: string;
    queries: number;
    tokens: number;
    avgLatencyMs: number;
  }>;
}

export interface DeveloperAnalyticsPayload {
  filesByType: Array<{
    type: string;
    count: number;
    bytes: number;
    tokens: number;
  }>;
  avgFilesPerUser: number;
  filesPerUser: Array<{
    username: string;
    count: number;
    bytes: number;
  }>;
  avgTokensPerQuestionOverall: number;
  avgTokensPerQuestionByModel: Array<{
    model: string;
    avgTokens: number;
    avgPromptTokens: number;
    avgCompletionTokens: number;
    calls: number;
  }>;
  avgTokensPerQuestionByUser: Array<{
    username: string;
    avgTokens: number;
    calls: number;
  }>;
  overallSuccessRatePct: number;
  outcomeBreakdown: Array<{
    status: string;
    count: number;
    pct: number;
  }>;
  successRateByUser: Array<{
    username: string;
    total: number;
    success: number;
    noContext: number;
    blocked: number;
    errors: number;
    successRatePct: number;
  }>;
  avgLatencySecByModel: Array<{
    model: string;
    avgLatencySec: number;
    calls: number;
  }>;
  costByModel: Array<{
    model: string;
    costUsd: number;
    calls: number;
  }>;
}

export interface DeveloperPdfReportInput {
  generatedAt: string;
  primaryModel: string;
  dbPingMs: number;
  totalUsers: number;
  totalDocuments: number;
  totalStorageBytes: number;
  economics: {
    totalEvents: number;
    totalTokens: number;
    actualCostUsd: number;
    savedByCacheUsd: number;
    cacheHitRatePercent: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  };
  models: Array<{
    model: string;
    calls: number;
    errors: number;
    promptTokens: number;
    cachedTokens: number;
    completionTokens: number;
    costUsd: number;
    avgLatencyMs: number;
  }>;
  analytics: DeveloperAnalyticsPayload;
  peakHours?: PeakHoursAnalyticsData;
  decisionLogs: Array<{
    username: string;
    status: string;
    model: string;
    userMessage: string | null;
    reason: string | null;
    latencyMs: number;
    createdAt: string;
  }>;
}

interface GraphOptionMeta {
  id: DeveloperGraphId;
  labelEn: string;
  labelHe: string;
  subtitleEn: string;
  subtitleHe: string;
}

export const GRAPH_OPTIONS: GraphOptionMeta[] = [
  {
    id: "filesByType",
    labelEn: "Files Uploaded by Type",
    labelHe: "כמות קבצים שהועלו לפי סוג",
    subtitleEn: "Count & storage size grouped by file format",
    subtitleHe: "מספר קבצים ונפח אחסון לפי פורמט קובץ",
  },
  {
    id: "filesPerUser",
    labelEn: "Files per User (with Average)",
    labelHe: "כמות קבצים למשתמש (כולל ממוצע)",
    subtitleEn: "Uploaded documents per user vs workspace average",
    subtitleHe: "מסמכים שהועלו לכל משתמש מול הממוצע הכללי",
  },
  {
    id: "avgTokensPerQuestionByModel",
    labelEn: "Avg Tokens per Question (by Model)",
    labelHe: "ממוצע טוקנים לשאלה (לפי מודל)",
    subtitleEn: "Average total tokens consumed per query per model",
    subtitleHe: "ממוצע טוקנים לשאילתה בכל מודל",
  },
  {
    id: "avgTokensPerQuestionByUser",
    labelEn: "Avg Tokens per Question (by User)",
    labelHe: "ממוצע טוקנים לשאלה (לפי משתמש)",
    subtitleEn: "Average total tokens per question across users",
    subtitleHe: "ממוצע טוקנים לשאילתה לכל משתמש",
  },
  {
    id: "overallSuccessRate",
    labelEn: "Response Outcomes (% of All Questions)",
    labelHe: "אחוז תשובות מוצלחות וסטטוסים (כלל השאלות)",
    subtitleEn: "Success vs no-context vs blocked vs errors",
    subtitleHe: "התפלגות הצלחה, חוסר הקשר, חסימות ושגיאות",
  },
  {
    id: "successRateByUser",
    labelEn: "Success Rate (%) per User",
    labelHe: "אחוז תשובות מוצלחות לכל משתמש",
    subtitleEn: "Percentage of grounded successful answers by user",
    subtitleHe: "שיעור התשובות המוצלחות לכל משתמש",
  },
  {
    id: "avgLatencySecByModel",
    labelEn: "Average Latency (Seconds) by Model",
    labelHe: "זמן תגובה ממוצע (שניות) לפי מודל",
    subtitleEn: "Mean response time in seconds per model",
    subtitleHe: "זמן תגובה ממוצע בשניות לכל מודל",
  },
  {
    id: "costByModel",
    labelEn: "Total Cost (USD) by Model",
    labelHe: "עלות כוללת (USD) לפי מודל",
    subtitleEn: "Cumulative API spend and call volume by model",
    subtitleHe: "עלות API מצטברת וכמות קריאות לכל מודל",
  },
  {
    id: "peakUsageHours",
    labelEn: "24-Hour Activity & Peak Hours",
    labelHe: "שעות פעילות ושיא (24 שעות UTC)",
    subtitleEn: "Hourly query distribution highlighting top peak hours",
    subtitleHe: "התפלגות שאילתות לפי שעה עם הדגשת שעות השיא",
  },
  {
    id: "weeklyVolumeLatency",
    labelEn: "Weekly Volume & Latency (Seconds)",
    labelHe: "נפח שאילתות והשהיה שבועית (שניות)",
    subtitleEn: "Queries and mean response latency in seconds by weekday",
    subtitleHe: "כמות שאילתות וזמן תגובה ממוצע בשניות לפי יום בשבוע",
  },
];

interface BarRow {
  label: string;
  value: number;
  displayValue: string;
  sublabel?: string;
  pctWidth: number;
  colorHex: string;
}

const PALETTE_TEAL = "#0d9488";
const PALETTE_BLUE = "#2563eb";
const PALETTE_INDIGO = "#4f46e5";
const PALETTE_EMERALD = "#059669";
const PALETTE_AMBER = "#d97706";
const PALETTE_ORANGE = "#ea580c";
const PALETTE_ROSE = "#e11d48";
const PALETTE_SLATE = "#64748b";

const FILE_TYPE_COLORS: Record<string, string> = {
  PDF: "#e11d48",
  DOCX: "#2563eb",
  TXT: "#0d9488",
  CSV: "#059669",
  MD: "#4f46e5",
  OTHER: "#64748b",
};

const STATUS_COLORS: Record<string, string> = {
  SUCCESS: PALETTE_EMERALD,
  NO_CONTEXT_FOUND: PALETTE_AMBER,
  BLOCKED_OUT_OF_SCOPE: PALETTE_ORANGE,
  BLOCKED_INJECTION: PALETTE_ROSE,
  ERROR: "#991b1b",
};

const HEBREW_DAYS: Record<string, string> = {
  Sun: "א׳",
  Mon: "ב׳",
  Tue: "ג׳",
  Wed: "ד׳",
  Thu: "ה׳",
  Fri: "ו׳",
  Sat: "ש׳",
};

function formatBytesShort(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildChartModel(
  graphId: DeveloperGraphId,
  analytics: DeveloperAnalyticsPayload,
  isHe: boolean,
  peakHours?: PeakHoursAnalyticsData
): {
  summaryBadge: string;
  rows: BarRow[];
  isDonut?: boolean;
  donutCenterLabel?: string;
  donutCenterSub?: string;
  emptyText: string;
} {
  switch (graphId) {
    case "filesByType": {
      const total = analytics.filesByType.reduce((s, r) => s + r.count, 0);
      const max = Math.max(1, ...analytics.filesByType.map((r) => r.count));
      return {
        summaryBadge: isHe ? `סה״כ ${total} קבצים` : `Total ${total} files`,
        rows: analytics.filesByType.map((r) => ({
          label: r.type,
          value: r.count,
          displayValue: `${r.count} (${total > 0 ? Math.round((r.count / total) * 100) : 0}%)`,
          sublabel: formatBytesShort(r.bytes),
          pctWidth: Math.max(6, Math.round((r.count / max) * 100)),
          colorHex: FILE_TYPE_COLORS[r.type] ?? PALETTE_TEAL,
        })),
        emptyText: isHe ? "עדיין לא הועלו קבצים." : "No files uploaded yet.",
      };
    }

    case "filesPerUser": {
      const top = analytics.filesPerUser.slice(0, 10);
      const max = Math.max(1, ...top.map((r) => r.count));
      return {
        summaryBadge: isHe
          ? `ממוצע: ${analytics.avgFilesPerUser} קבצים למשתמש`
          : `Avg: ${analytics.avgFilesPerUser} files / user`,
        rows: top.map((r) => ({
          label: `@${r.username}`,
          value: r.count,
          displayValue: `${r.count}`,
          sublabel: formatBytesShort(r.bytes),
          pctWidth:
            r.count > 0 ? Math.max(6, Math.round((r.count / max) * 100)) : 2,
          colorHex:
            r.count >= analytics.avgFilesPerUser ? PALETTE_TEAL : PALETTE_SLATE,
        })),
        emptyText: isHe ? "אין נתוני משתמשים." : "No user file data yet.",
      };
    }

    case "avgTokensPerQuestionByModel": {
      const list = analytics.avgTokensPerQuestionByModel.slice(0, 8);
      const max = Math.max(1, ...list.map((r) => r.avgTokens));
      return {
        summaryBadge: isHe
          ? `ממוצע כללי: ${formatTokensCompact(analytics.avgTokensPerQuestionOverall)} טוקנים/שאלה`
          : `Overall avg: ${formatTokensCompact(analytics.avgTokensPerQuestionOverall)} tok/q`,
        rows: list.map((r) => ({
          label: r.model,
          value: r.avgTokens,
          displayValue: `${formatTokensCompact(r.avgTokens)} tok`,
          sublabel: `${r.calls} ${isHe ? "קריאות" : "calls"}`,
          pctWidth: Math.max(6, Math.round((r.avgTokens / max) * 100)),
          colorHex: PALETTE_INDIGO,
        })),
        emptyText: isHe
          ? "אין עדיין נתוני טוקנים לשאלות."
          : "No token usage per question recorded yet.",
      };
    }

    case "avgTokensPerQuestionByUser": {
      const list = analytics.avgTokensPerQuestionByUser.slice(0, 10);
      const max = Math.max(1, ...list.map((r) => r.avgTokens));
      return {
        summaryBadge: isHe
          ? `ממוצע כללי: ${formatTokensCompact(analytics.avgTokensPerQuestionOverall)} טוקנים/שאלה`
          : `Overall avg: ${formatTokensCompact(analytics.avgTokensPerQuestionOverall)} tok/q`,
        rows: list.map((r) => ({
          label: `@${r.username}`,
          value: r.avgTokens,
          displayValue: `${formatTokensCompact(r.avgTokens)} tok`,
          sublabel: `${r.calls} ${isHe ? "שאלות" : "queries"}`,
          pctWidth: Math.max(6, Math.round((r.avgTokens / max) * 100)),
          colorHex: PALETTE_BLUE,
        })),
        emptyText: isHe
          ? "אין עדיין נתוני טוקנים לפי משתמש."
          : "No per-user token data recorded yet.",
      };
    }

    case "overallSuccessRate": {
      const nonZero = analytics.outcomeBreakdown.filter((r) => r.count > 0);
      return {
        summaryBadge: isHe
          ? `שיעור הצלחה: ${analytics.overallSuccessRatePct}%`
          : `Success rate: ${analytics.overallSuccessRatePct}%`,
        isDonut: true,
        donutCenterLabel: `${analytics.overallSuccessRatePct}%`,
        donutCenterSub: isHe ? "הצלחה" : "Success",
        rows: analytics.outcomeBreakdown.map((r) => ({
          label: r.status,
          value: r.count,
          displayValue: `${r.pct}% (${r.count})`,
          pctWidth: Math.max(r.count > 0 ? 4 : 0, Math.round(r.pct)),
          colorHex: STATUS_COLORS[r.status] ?? PALETTE_SLATE,
        })),
        emptyText:
          nonZero.length === 0
            ? isHe
              ? "אין עדיין שאילתות במערכת."
              : "No queries recorded yet."
            : "",
      };
    }

    case "successRateByUser": {
      const list = analytics.successRateByUser.slice(0, 10);
      return {
        summaryBadge: isHe
          ? `שיעור הצלחה כללי: ${analytics.overallSuccessRatePct}%`
          : `Overall: ${analytics.overallSuccessRatePct}%`,
        rows: list.map((r) => ({
          label: `@${r.username}`,
          value: r.successRatePct,
          displayValue: `${r.successRatePct}%`,
          sublabel: `${r.success}/${r.total}`,
          pctWidth: Math.max(4, Math.round(r.successRatePct)),
          colorHex:
            r.successRatePct >= 75
              ? PALETTE_EMERALD
              : r.successRatePct >= 45
                ? PALETTE_AMBER
                : PALETTE_ROSE,
        })),
        emptyText: isHe
          ? "אין עדיין שאילתות למשתמשים."
          : "No user query outcomes yet.",
      };
    }

    case "avgLatencySecByModel": {
      const list = analytics.avgLatencySecByModel.slice(0, 8);
      const max = Math.max(0.1, ...list.map((r) => r.avgLatencySec));
      return {
        summaryBadge: isHe ? "מדידה בשניות (s)" : "Measured in seconds (s)",
        rows: list.map((r) => ({
          label: r.model,
          value: r.avgLatencySec,
          displayValue: `${r.avgLatencySec.toFixed(2)}s`,
          sublabel: `${r.calls} ${isHe ? "קריאות" : "calls"}`,
          pctWidth: Math.max(6, Math.round((r.avgLatencySec / max) * 100)),
          colorHex: r.avgLatencySec > 5 ? PALETTE_AMBER : PALETTE_BLUE,
        })),
        emptyText: isHe ? "אין נתוני השהיה." : "No latency measurements yet.",
      };
    }

    case "costByModel": {
      const list = analytics.costByModel.slice(0, 8);
      const total = list.reduce((s, r) => s + r.costUsd, 0);
      const max = Math.max(0.000001, ...list.map((r) => r.costUsd));
      return {
        summaryBadge: `${isHe ? "סה״כ" : "Total"} ${formatUsd(total)}`,
        rows: list.map((r) => ({
          label: r.model,
          value: r.costUsd,
          displayValue: formatUsd(r.costUsd),
          sublabel: `${r.calls} ${isHe ? "קריאות" : "calls"}`,
          pctWidth:
            r.costUsd > 0 ? Math.max(6, Math.round((r.costUsd / max) * 100)) : 2,
          colorHex: PALETTE_TEAL,
        })),
        emptyText: isHe ? "אין נתוני עלות." : "No cost data recorded yet.",
      };
    }

    case "peakUsageHours": {
      const activeHours = (peakHours?.hourlyDistribution ?? []).filter(
        (h) => h.queries > 0
      );
      const max = Math.max(1, ...activeHours.map((h) => h.queries));
      return {
        summaryBadge: peakHours?.peakWindowSummary
          ? `${peakHours.peakWindowSummary.label} (${peakHours.peakWindowSummary.sharePercent}%)`
          : isHe
            ? "ממתין לנתונים"
            : "Awaiting data",
        rows: activeHours.slice(0, 12).map((h) => ({
          label: `${h.label} UTC`,
          value: h.queries,
          displayValue: `${h.queries} ${isHe ? "שאילתות" : "q"}`,
          sublabel: `${formatTokensCompact(h.tokens)} tok`,
          pctWidth: Math.max(6, Math.round((h.queries / max) * 100)),
          colorHex: h.isPeak ? PALETTE_TEAL : PALETTE_SLATE,
        })),
        emptyText: isHe ? "אין נתוני פעילות שעתיים." : "No hourly activity yet.",
      };
    }

    case "weeklyVolumeLatency": {
      const days = peakHours?.dayOfWeekDistribution ?? [];
      const totalWeek = days.reduce((s, d) => s + d.queries, 0);
      const max = Math.max(1, ...days.map((d) => d.queries));
      return {
        summaryBadge: isHe
          ? `${totalWeek} שאילתות השבוע`
          : `${totalWeek} weekly queries`,
        rows: days.map((d) => ({
          label: isHe ? (HEBREW_DAYS[d.day] ?? d.day) : d.day,
          value: d.queries,
          displayValue: `${d.queries} · ${formatLatencySeconds(d.avgLatencyMs)}`,
          sublabel: `${formatTokensCompact(d.tokens)} tok`,
          pctWidth:
            d.queries > 0 ? Math.max(6, Math.round((d.queries / max) * 100)) : 2,
          colorHex: PALETTE_BLUE,
        })),
        emptyText: isHe ? "אין נתוני פעילות שבועיים." : "No weekly data yet.",
      };
    }
  }
}

function DonutSvg({
  rows,
  centerLabel,
  centerSub,
}: {
  rows: BarRow[];
  centerLabel: string;
  centerSub: string;
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  const segments = rows
    .filter((r) => r.value > 0)
    .reduce<
      Array<{
        label: string;
        colorHex: string;
        dash: number;
        offset: number;
      }>
    >((acc, r) => {
      const prevSum = acc.reduce((s, seg) => s + seg.dash, 0);
      const frac = total > 0 ? r.value / total : 0;
      const dash = frac * circumference;
      acc.push({
        label: r.label,
        colorHex: r.colorHex,
        dash,
        offset: prevSum,
      });
      return acc;
    }, []);

  return (
    <svg
      viewBox="0 0 140 140"
      className="h-32 w-32 shrink-0"
      aria-label="Outcome distribution donut chart"
    >
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth="16"
      />
      {segments.map((seg) => (
        <circle
          key={seg.label}
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={seg.colorHex}
          strokeWidth="16"
          strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
          strokeDashoffset={-seg.offset}
          transform="rotate(-90 70 70)"
        />
      ))}
      <text
        x="70"
        y="67"
        textAnchor="middle"
        className="fill-slate-900 font-mono text-[17px] font-bold"
      >
        {centerLabel}
      </text>
      <text
        x="70"
        y="84"
        textAnchor="middle"
        className="fill-slate-500 text-[10px] font-medium"
      >
        {centerSub}
      </text>
    </svg>
  );
}

function buildPdfChartHtml(
  graphId: DeveloperGraphId,
  analytics: DeveloperAnalyticsPayload,
  isHe: boolean,
  peakHours?: PeakHoursAnalyticsData
): string {
  const meta =
    GRAPH_OPTIONS.find((g) => g.id === graphId) ?? GRAPH_OPTIONS[0];
  const model = buildChartModel(graphId, analytics, isHe, peakHours);
  const title = isHe ? meta.labelHe : meta.labelEn;

  const barsHtml =
    model.rows.length === 0
      ? `<p class="muted">${escapeHtml(model.emptyText)}</p>`
      : model.rows
          .map(
            (r) => `
          <div class="bar-row">
            <div class="bar-head">
              <span class="bar-label">${escapeHtml(r.label)}${
                r.sublabel
                  ? ` <span class="bar-sub">(${escapeHtml(r.sublabel)})</span>`
                  : ""
              }</span>
              <span class="bar-val">${escapeHtml(r.displayValue)}</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" style="width:${Math.min(100, Math.max(0, r.pctWidth))}%;background:${r.colorHex};"></div>
            </div>
          </div>`
          )
          .join("");

  return `
    <div class="chart-card">
      <div class="chart-head">
        <h3>${escapeHtml(title)}</h3>
        <span class="pill">${escapeHtml(model.summaryBadge)}</span>
      </div>
      <div class="bars">${barsHtml}</div>
    </div>`;
}

export function exportDeveloperReportToPdf(
  report: DeveloperPdfReportInput,
  graph1: DeveloperGraphId,
  graph2: DeveloperGraphId,
  lang: "he" | "en"
) {
  const isHe = lang === "he";
  const dir = isHe ? "rtl" : "ltr";

  const modelsRowsHtml = report.models
    .map(
      (m) => `
      <tr>
        <td><strong>${escapeHtml(m.model)}</strong></td>
        <td class="num">${m.calls}</td>
        <td class="num">${m.errors}</td>
        <td class="num">${m.promptTokens.toLocaleString()} (${m.cachedTokens.toLocaleString()})</td>
        <td class="num">${m.completionTokens.toLocaleString()}</td>
        <td class="num">${escapeHtml(formatLatencySeconds(m.avgLatencyMs))}</td>
        <td class="num"><strong>${escapeHtml(formatUsd(m.costUsd))}</strong></td>
      </tr>`
    )
    .join("");

  const decisionsHtml = report.decisionLogs
    .slice(0, 15)
    .map(
      (d) => `
      <tr>
        <td><span class="status-tag">${escapeHtml(d.status)}</span></td>
        <td>@${escapeHtml(d.username)}</td>
        <td>${escapeHtml((d.userMessage ?? "—").slice(0, 160))}</td>
        <td>${escapeHtml((d.reason ?? "—").slice(0, 180))}</td>
        <td class="num">${escapeHtml(formatLatencySeconds(d.latencyMs))}</td>
      </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(
    isHe
      ? "ContextLM — דוח ניהול, ביצועים וגרפים"
      : "ContextLM — Admin Analytics & Telemetry Report"
  )}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      line-height: 1.45;
      margin: 0;
    }
    .header {
      background: #0f172a;
      color: #f8fafc;
      padding: 18px 22px;
      border-radius: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .header h1 { margin: 0; font-size: 18px; }
    .header .meta { font-size: 11px; color: #cbd5e1; margin-top: 3px; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 10px 12px;
      background: #f8fafc;
    }
    .kpi .k-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 700; }
    .kpi .k-val { font-size: 17px; font-weight: 700; font-family: monospace; margin-top: 4px; color: #0f172a; }
    .kpi .k-sub { font-size: 10px; color: #64748b; margin-top: 2px; font-family: monospace; }
    .charts-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-bottom: 16px;
    }
    .chart-card {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 14px;
      background: #ffffff;
      break-inside: avoid;
    }
    .chart-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
    }
    .chart-head h3 { margin: 0; font-size: 12.5px; color: #0f172a; }
    .pill {
      font-family: monospace;
      font-size: 10px;
      font-weight: 700;
      background: #f0fdfa;
      color: #0f766e;
      border: 1px solid #99f6e4;
      padding: 2px 7px;
      border-radius: 999px;
      white-space: nowrap;
    }
    .bar-row { margin-bottom: 8px; }
    .bar-head {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      margin-bottom: 3px;
    }
    .bar-label { font-weight: 600; color: #1e293b; }
    .bar-sub { font-weight: 400; color: #64748b; font-size: 10px; }
    .bar-val { font-family: monospace; font-weight: 700; color: #0f172a; }
    .bar-track {
      height: 8px;
      background: #e2e8f0;
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill { height: 100%; border-radius: 999px; }
    .section {
      margin-bottom: 16px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px 14px;
      break-inside: avoid;
    }
    .section h2 {
      margin: 0 0 8px 0;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #475569;
    }
    table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
    th, td {
      border-bottom: 1px solid #e2e8f0;
      padding: 5px 6px;
      text-align: start;
      vertical-align: top;
    }
    th { background: #f1f5f9; font-weight: 700; color: #334155; }
    td.num, th.num { text-align: end; font-family: monospace; white-space: nowrap; }
    .status-tag {
      font-family: monospace;
      font-size: 9.5px;
      font-weight: 700;
      background: #fef3c7;
      color: #92400e;
      padding: 1px 5px;
      border-radius: 4px;
    }
    .muted { color: #64748b; font-size: 11px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(
        isHe
          ? "דוח ניהול, ביצועים וגרפים — ContextLM"
          : "ContextLM Admin Analytics & Telemetry Report"
      )}</h1>
      <div class="meta">${escapeHtml(new Date(report.generatedAt).toLocaleString(isHe ? "he-IL" : "en-US"))}</div>
    </div>
    <div class="meta" style="text-align:end;font-family:monospace;">
      ${escapeHtml(isHe ? "מודל פעיל:" : "Active Model:")} <strong>${escapeHtml(report.primaryModel)}</strong>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="k-label">${escapeHtml(isHe ? "שיעור הצלחה" : "Success Rate")}</div>
      <div class="k-val">${report.analytics.overallSuccessRatePct}%</div>
      <div class="k-sub">${report.economics.totalEvents} ${escapeHtml(isHe ? "שאלות" : "queries")}</div>
    </div>
    <div class="kpi">
      <div class="k-label">${escapeHtml(isHe ? "השהיה P50 / P95" : "Latency P50 / P95")}</div>
      <div class="k-val">${escapeHtml(formatLatencySeconds(report.economics.p50LatencyMs))} / ${escapeHtml(formatLatencySeconds(report.economics.p95LatencyMs))}</div>
      <div class="k-sub">P99 ${escapeHtml(formatLatencySeconds(report.economics.p99LatencyMs))}</div>
    </div>
    <div class="kpi">
      <div class="k-label">${escapeHtml(isHe ? "עלות וטוקנים" : "Cost & Tokens")}</div>
      <div class="k-val">${escapeHtml(formatUsd(report.economics.actualCostUsd))}</div>
      <div class="k-sub">${escapeHtml(formatTokensCompact(report.analytics.avgTokensPerQuestionOverall))} tok/q · ${report.economics.cacheHitRatePercent}% cache</div>
    </div>
    <div class="kpi">
      <div class="k-label">${escapeHtml(isHe ? "קבצים ומשתמשים" : "Files & Users")}</div>
      <div class="k-val">${report.totalDocuments} / ${report.totalUsers}</div>
      <div class="k-sub">${escapeHtml(isHe ? "ממוצע" : "Avg")} ${report.analytics.avgFilesPerUser} ${escapeHtml(isHe ? "קבצים למשתמש" : "files/user")}</div>
    </div>
  </div>

  <div class="charts-grid">
    ${buildPdfChartHtml(graph1, report.analytics, isHe, report.peakHours)}
    ${buildPdfChartHtml(graph2, report.analytics, isHe, report.peakHours)}
  </div>

  ${
    modelsRowsHtml
      ? `<div class="section">
          <h2>${escapeHtml(isHe ? "שימוש, השהיה ועלויות לפי מודל" : "Usage, Latency & Cost by Model")}</h2>
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th class="num">Calls</th>
                <th class="num">Errors</th>
                <th class="num">Input (Cached)</th>
                <th class="num">Output</th>
                <th class="num">Avg Latency</th>
                <th class="num">Cost</th>
              </tr>
            </thead>
            <tbody>${modelsRowsHtml}</tbody>
          </table>
        </div>`
      : ""
  }

  ${
    decisionsHtml
      ? `<div class="section">
          <h2>${escapeHtml(isHe ? "אירועי אבטחה אחרונים" : "Recent Flagged Security Events")}</h2>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>User</th>
                <th>${escapeHtml(isHe ? "הודעה שסומנה" : "Flagged Text")}</th>
                <th>${escapeHtml(isHe ? "סיבה" : "Reason")}</th>
                <th class="num">Latency</th>
              </tr>
            </thead>
            <tbody>${decisionsHtml}</tbody>
          </table>
        </div>`
      : ""
  }
</body>
</html>`;

  const win = window.open("", "_blank", "width=980,height=820");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 250);
}

interface DeveloperAnalyticsChartsProps {
  analytics: DeveloperAnalyticsPayload;
  peakHours?: PeakHoursAnalyticsData;
  reportData: DeveloperPdfReportInput;
  isHe: boolean;
  graph1: DeveloperGraphId;
  graph2: DeveloperGraphId;
  onChangeGraph1: (id: DeveloperGraphId) => void;
  onChangeGraph2: (id: DeveloperGraphId) => void;
}

function SingleAnalyticsCard({
  slotLabel,
  selectedId,
  onSelect,
  analytics,
  peakHours,
  isHe,
}: {
  slotLabel: string;
  selectedId: DeveloperGraphId;
  onSelect: (id: DeveloperGraphId) => void;
  analytics: DeveloperAnalyticsPayload;
  peakHours?: PeakHoursAnalyticsData;
  isHe: boolean;
}) {
  const meta =
    GRAPH_OPTIONS.find((g) => g.id === selectedId) ?? GRAPH_OPTIONS[0];
  const model = buildChartModel(selectedId, analytics, isHe, peakHours);
  const hasNonZeroData = model.rows.some((r) => r.value > 0);

  return (
    <div className="glass-panel rounded-2xl border p-4 sm:p-5 shadow-[0_8px_24px_-14px_rgba(15,23,42,0.1)] flex flex-col gap-3.5 sm:gap-4 min-w-0">
      <div
        dir={isHe ? "rtl" : "ltr"}
        className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start justify-between gap-2.5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 mb-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {slotLabel}
            </label>
            <span
              dir="ltr"
              className="sm:hidden shrink-0 rounded-full bg-teal-50 border border-teal-200/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-800"
            >
              {model.summaryBadge}
            </span>
          </div>
          <select
            value={selectedId}
            onChange={(e) => onSelect(e.target.value as DeveloperGraphId)}
            className="w-full max-w-full rounded-xl border border-slate-200 bg-white/95 px-3 py-2 sm:py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 cursor-pointer"
          >
            {GRAPH_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {isHe ? opt.labelHe : opt.labelEn}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-slate-500">
            {isHe ? meta.subtitleHe : meta.subtitleEn}
          </p>
        </div>

        <span
          dir="ltr"
          className="hidden sm:inline-flex shrink-0 rounded-full bg-teal-50 border border-teal-200/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-teal-800"
        >
          {model.summaryBadge}
        </span>
      </div>

      {selectedId === "peakUsageHours" && peakHours ? (
        <div className="space-y-2.5 pt-1" dir="ltr">
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={peakHours.hourlyDistribution}
                margin={{ top: 6, right: 6, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(15,23,42,0.07)"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  interval={3}
                  axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(13, 148, 136, 0.06)" }}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#0f172a",
                  }}
                />
                <Bar dataKey="queries" radius={[3, 3, 0, 0]} maxBarSize={18}>
                  {peakHours.hourlyDistribution.map((entry) => (
                    <Cell
                      key={`h-${entry.hour}`}
                      fill={entry.isPeak ? PALETTE_TEAL : "#cbd5e1"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-teal-600" />
              {isHe ? "שעות שיא" : "Peak hours"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-slate-300" />
              {isHe ? "שעות רגילות" : "Standard"}
            </span>
          </div>
        </div>
      ) : selectedId === "weeklyVolumeLatency" && peakHours ? (
        <div className="space-y-2.5 pt-1" dir="ltr">
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={peakHours.dayOfWeekDistribution.map((d) => ({
                  ...d,
                  localizedDay: isHe ? (HEBREW_DAYS[d.day] ?? d.day) : d.day,
                  avgLatencySec: Number((d.avgLatencyMs / 1000).toFixed(2)),
                }))}
                margin={{ top: 6, right: 4, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="rgba(15,23,42,0.07)"
                />
                <XAxis
                  dataKey="localizedDay"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={{ stroke: "rgba(15,23,42,0.12)" }}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                  unit="s"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid rgba(15,23,42,0.12)",
                    borderRadius: "8px",
                    fontSize: "11px",
                    color: "#0f172a",
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="queries"
                  name={isHe ? "שאילתות" : "Queries"}
                  fill="#99f6e4"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={22}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="avgLatencySec"
                  name={isHe ? "השהיה (שניות)" : "Latency (s)"}
                  stroke={PALETTE_BLUE}
                  strokeWidth={2}
                  dot={{
                    r: 3,
                    fill: "#ffffff",
                    stroke: PALETTE_BLUE,
                    strokeWidth: 1.5,
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center gap-4 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-xs bg-teal-200" />
              {isHe ? "נפח שאילתות" : "Query volume"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-white border-[1.5px] border-blue-600" />
              {isHe ? "השהיה ממוצעת (שניות)" : "Avg latency (s)"}
            </span>
          </div>
        </div>
      ) : !hasNonZeroData ? (
        <p
          dir={isHe ? "rtl" : "ltr"}
          className="py-10 text-center text-xs text-slate-400"
        >
          {model.emptyText || (isHe ? "אין נתונים להצגה." : "No data available.")}
        </p>
      ) : model.isDonut ? (
        <div className="flex flex-col sm:flex-row items-center gap-5 pt-1">
          <DonutSvg
            rows={model.rows}
            centerLabel={model.donutCenterLabel ?? ""}
            centerSub={model.donutCenterSub ?? ""}
          />
          <div className="flex-1 w-full space-y-2.5 min-w-0" dir="ltr">
            {model.rows.map((r) => (
              <div key={r.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-700 truncate">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: r.colorHex }}
                    />
                    <span className="truncate">{r.label}</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-slate-900 shrink-0">
                    {r.displayValue}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, r.pctWidth))}%`,
                      backgroundColor: r.colorHex,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 pt-1" dir="ltr">
          {model.rows.map((r) => (
            <div key={r.label} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono text-[11px] font-medium text-slate-800 truncate min-w-0">
                  {r.label}
                  {r.sublabel && (
                    <span className="ms-1.5 text-[10px] font-normal text-slate-400">
                      · {r.sublabel}
                    </span>
                  )}
                </span>
                <span className="font-mono text-[11px] font-semibold text-slate-900 shrink-0">
                  {r.displayValue}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, r.pctWidth))}%`,
                    backgroundColor: r.colorHex,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DeveloperAnalyticsCharts({
  analytics,
  peakHours,
  reportData,
  isHe,
  graph1,
  graph2,
  onChangeGraph1,
  onChangeGraph2,
}: DeveloperAnalyticsChartsProps) {
  const [exporting, setExporting] = useState(false);

  function handlePdfClick() {
    setExporting(true);
    try {
      exportDeveloperReportToPdf(
        reportData,
        graph1,
        graph2,
        isHe ? "he" : "en"
      );
    } finally {
      setTimeout(() => setExporting(false), 300);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end justify-between gap-3">
        <div dir={isHe ? "rtl" : "ltr"} className="min-w-0">
          <h2 className="text-base sm:text-lg font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <BarChart3 className="h-4.5 w-4.5 text-teal-600 shrink-0" />
            <span>
              {isHe ? "גרפים וניתוח נתונים" : "Analytics & Charts"}
            </span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isHe
              ? "בחרו כל 2 גרפים מתוך 10 מדדי מערכת (קבצים, טוקנים, אחוזי הצלחה, שעות שיא, השהיה ועלויות) וייצאו ל-PDF."
              : "Pick any 2 of 10 live charts (files, tokens, success rates, peak hours, weekly latency, and costs) and export to PDF."}
          </p>
        </div>

        <button
          id="dev-export-pdf-btn"
          type="button"
          disabled={exporting}
          onClick={handlePdfClick}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap rounded-xl border border-blue-200 bg-blue-50/90 hover:bg-blue-100 px-3.5 py-2.5 sm:py-2 text-xs font-semibold text-blue-900 cursor-pointer"
        >
          <FileDown className="h-3.5 w-3.5 shrink-0" />
          <span>{isHe ? "ייצוא דוח וגרפים ל-PDF" : "Export Report to PDF"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SingleAnalyticsCard
          slotLabel={isHe ? "גרף 1" : "Graph 1"}
          selectedId={graph1}
          onSelect={onChangeGraph1}
          analytics={analytics}
          peakHours={peakHours}
          isHe={isHe}
        />
        <SingleAnalyticsCard
          slotLabel={isHe ? "גרף 2" : "Graph 2"}
          selectedId={graph2}
          onSelect={onChangeGraph2}
          analytics={analytics}
          peakHours={peakHours}
          isHe={isHe}
        />
      </div>
    </section>
  );
}
