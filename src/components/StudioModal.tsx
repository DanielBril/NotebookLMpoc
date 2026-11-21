"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  FileText,
  GitCompareArrows,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import type {
  AuditQuizResult,
  ContradictionsResult,
  ExecutiveBriefResult,
  StudioMode,
} from "@/app/api/studio/route";

interface StudioModalProps {
  mode: StudioMode;
  data: ContradictionsResult | ExecutiveBriefResult | AuditQuizResult | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onInspectSource?: (sourceIndex: number, quote?: string) => void;
  sourceIdByIndex: Record<number, string>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function StudioModal({
  mode,
  data,
  isLoading,
  error,
  onClose,
  onInspectSource,
  sourceIdByIndex,
}: StudioModalProps) {
  const { lang } = useLanguage();
  const isHe = lang === "he";

  // Interactive quiz selection state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>(
    {}
  );
  const [revealedQuestions, setRevealedQuestions] = useState<
    Record<number, boolean>
  >({});

  function handleExportExecutiveBriefPdf(brief: ExecutiveBriefResult) {
    const dir = isHe ? "rtl" : "ltr";
    const findingsHtml = (brief.keyFindings || [])
      .map(
        (f) => `
        <div class="finding">
          <div class="finding-head">
            <strong>${escapeHtml(f.heading)}</strong>
            <span class="cite">${escapeHtml(f.citation)}</span>
          </div>
          <p>${escapeHtml(f.detail)}</p>
        </div>`
      )
      .join("");

    const metricsHtml = (brief.metricsAndDates || [])
      .map(
        (m) => `
        <tr>
          <td><strong>${escapeHtml(m.item)}</strong></td>
          <td>${escapeHtml(m.value)}</td>
          <td class="cite-cell">${escapeHtml(m.citation)}</td>
        </tr>`
      )
      .join("");

    const actionsHtml = (brief.actionItems || [])
      .map(
        (a) => `
        <tr>
          <td><span class="badge">${escapeHtml(a.priority)}</span></td>
          <td>${escapeHtml(a.action)}</td>
          <td class="cite-cell">${escapeHtml(a.citation)}</td>
        </tr>`
      )
      .join("");

    const risksHtml = (brief.risksAndGaps || [])
      .map((r) => `<li>${escapeHtml(r)}</li>`)
      .join("");

    const htmlDoc = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(brief.title || "ContextLM Executive Brief")}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #253237;
      background: #ffffff;
      line-height: 1.55;
      margin: 0;
    }
    .header {
      background: #253237;
      color: #e0fbfc;
      padding: 20px 24px;
      border-radius: 12px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header h1 { margin: 0; font-size: 20px; }
    .header .meta { font-size: 11px; color: #c2dfe3; }
    .section {
      margin-bottom: 18px;
      padding: 14px 18px;
      border: 1px solid #9db4c0;
      border-radius: 10px;
      background: #f9fdfe;
    }
    .section h2 {
      margin: 0 0 10px 0;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #5c6b73;
      border-bottom: 1px solid #c2dfe3;
      padding-bottom: 6px;
    }
    .finding {
      padding: 10px 12px;
      background: #ffffff;
      border: 1px solid #c2dfe3;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .finding-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 13px;
    }
    .finding p { margin: 0; font-size: 12.5px; color: #253237; }
    .cite {
      font-family: monospace;
      font-size: 11px;
      background: #e0fbfc;
      color: #253237;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #9db4c0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      background: #ffffff;
    }
    th, td {
      border: 1px solid #c2dfe3;
      padding: 7px 10px;
      text-align: start;
    }
    th { background: #c2dfe3; color: #253237; font-weight: 600; }
    .cite-cell { font-family: monospace; font-size: 11px; color: #5c6b73; }
    .badge {
      display: inline-block;
      padding: 2px 7px;
      border-radius: 4px;
      background: #253237;
      color: #e0fbfc;
      font-size: 10px;
      font-weight: 700;
    }
    ul { margin: 6px 0 0 0; padding-inline-start: 18px; font-size: 12.5px; }
    li { margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${escapeHtml(brief.title || (isHe ? "תקציר מנהלים מבוסס מקורות" : "Grounded Executive Brief"))}</h1>
      <div class="meta">ContextLM Studio • ${new Date().toLocaleDateString(isHe ? "he-IL" : "en-US")}</div>
    </div>
    <div class="meta">${isHe ? "מבוסס מקורות בלבד" : "Strictly Grounded Sources"}</div>
  </div>

  <div class="section">
    <h2>${isHe ? "תמצית מנהלים" : "Executive Summary"}</h2>
    <p style="margin:0;font-size:13px;">${escapeHtml(brief.executiveSummary || "")}</p>
  </div>

  <div class="section">
    <h2>${isHe ? "ממצאים מרכזיים ומקורות" : "Key Grounded Findings"}</h2>
    ${findingsHtml}
  </div>

  ${
    metricsHtml
      ? `<div class="section">
          <h2>${isHe ? "מדדים, תאריכים ונתונים כמותיים" : "Key Metrics, Dates & Figures"}</h2>
          <table>
            <thead>
              <tr>
                <th>${isHe ? "מדד / נושא" : "Item"}</th>
                <th>${isHe ? "ערך מתוך המקור" : "Grounded Value"}</th>
                <th>${isHe ? "מקור" : "Citation"}</th>
              </tr>
            </thead>
            <tbody>${metricsHtml}</tbody>
          </table>
        </div>`
      : ""
  }

  ${
    actionsHtml
      ? `<div class="section">
          <h2>${isHe ? "משימות ודרישות לביצוע" : "Action Items & Obligations"}</h2>
          <table>
            <thead>
              <tr>
                <th>${isHe ? "עדיפות" : "Priority"}</th>
                <th>${isHe ? "פעולה נדרשת" : "Action / Requirement"}</th>
                <th>${isHe ? "מקור" : "Citation"}</th>
              </tr>
            </thead>
            <tbody>${actionsHtml}</tbody>
          </table>
        </div>`
      : ""
  }

  ${
    risksHtml
      ? `<div class="section">
          <h2>${isHe ? "סיכונים, הסתייגויות ופערים" : "Risks, Caveats & Open Gaps"}</h2>
          <ul>${risksHtml}</ul>
        </div>`
      : ""
  }
</body>
</html>`;

    const win = window.open("", "_blank", "width=920,height=780");
    if (!win) return;
    win.document.open();
    win.document.write(htmlDoc);
    win.document.close();
    win.focus();
    setTimeout(() => {
      win.print();
    }, 250);
  }

  const headerTitle =
    mode === "contradictions"
      ? isHe
        ? "רדאר סתירות והצלבת מקורות"
        : "Cross-Document Contradiction & Conflict Radar"
      : mode === "brief"
        ? isHe
          ? "תקציר מנהלים מבוסס מקורות (ייצוא ל-PDF)"
          : "Grounded Executive Brief (PDF Export)"
        : isHe
          ? "בוחן בקרה ואימות עובדות מהמקורות"
          : "Grounded Verification & Audit Quiz";

  const headerSubtitle =
    mode === "contradictions"
      ? isHe
        ? "השוואה אוטומטית של נתונים, תאריכים ודרישות בין המסמכים המסומנים"
        : "Automated cross-check of conflicting numbers, dates, and clauses across selected sources"
      : mode === "brief"
        ? isHe
          ? "סינתזה מובנית של ממצאים, מדדים, סיכונים ומשימות עם הפניות מדויקות"
          : "Structured synthesis of findings, metrics, risks, and action items with verified citations"
        : isHe
          ? "שאלות ביקורת אמריקאיות לבדיקת שליטה ואימות ציטוטים מתוך המסמכים"
          : "Interactive multiple-choice audit questions backed by verbatim source quotes";

  const contradictionsData =
    mode === "contradictions" && data ? (data as ContradictionsResult) : null;
  const briefData =
    mode === "brief" && data ? (data as ExecutiveBriefResult) : null;
  const quizData = mode === "quiz" && data ? (data as AuditQuizResult) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-md p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="animate-modal-in w-full max-w-3xl max-h-[88vh] flex flex-col rounded-3xl bg-white/90 backdrop-blur-2xl border border-white/75 shadow-[0_24px_60px_-14px_rgba(15,23,42,0.35)] overflow-hidden">
        {/* Top Bar */}
        <div className="px-5 py-4 bg-[#0f172a]/92 backdrop-blur-xl text-white flex items-center justify-between gap-3 shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-200 border border-teal-400/30">
              {mode === "contradictions" ? (
                <GitCompareArrows className="h-4.5 w-4.5" />
              ) : mode === "brief" ? (
                <FileText className="h-4.5 w-4.5" />
              ) : (
                <ClipboardCheck className="h-4.5 w-4.5" />
              )}
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{headerTitle}</h3>
              <p className="text-[11px] text-[#c2dfe3] truncate">
                {headerSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {briefData && !isLoading && (
              <button
                id="export-brief-pdf-btn"
                type="button"
                onClick={() => handleExportExecutiveBriefPdf(briefData)}
                className="interactive-chip inline-flex items-center gap-1.5 rounded-xl bg-[#e0fbfc] hover:bg-[#c2dfe3] px-3 py-1.5 text-xs font-semibold text-[#253237] cursor-pointer"
              >
                <FileDown className="h-3.5 w-3.5" />
                <span>{isHe ? "הורדה / הדפסת PDF" : "Export as PDF"}</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#c2dfe3] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#f2fafb]">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-[#5c6b73]">
              <Loader2 className="h-7 w-7 animate-spin text-[#253237]" />
              <p className="text-sm font-semibold text-[#253237]">
                {isHe
                  ? "מנתח את המקורות המסומנים ומייצר תוצר מבוסס…"
                  : "Analyzing checked sources and synthesizing grounded artifact…"}
              </p>
            </div>
          ) : error ? (
            <div className="rounded-xl bg-[#253237] p-4 text-xs text-[#e0fbfc] flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-[#c2dfe3]" />
              <span>{error}</span>
            </div>
          ) : contradictionsData ? (
            <div className="space-y-4" dir="auto">
              <div className="rounded-xl bg-white p-4 border border-[#9db4c0]/55 shadow-xs">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#5c6b73] mb-1">
                  {isHe ? "סיכום הצלבת מקורות" : "Cross-Source Consistency Summary"}
                </p>
                <p className="text-sm text-[#253237] leading-relaxed">
                  {contradictionsData.summary}
                </p>
              </div>

              {contradictionsData.conflicts &&
              contradictionsData.conflicts.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#253237]">
                    {isHe
                      ? `זוהו ${contradictionsData.conflicts.length} פערים / סתירות בין המקורות`
                      : `Detected ${contradictionsData.conflicts.length} Discrepancies / Conflicts`}
                  </p>
                  {contradictionsData.conflicts.map((c, idx) => (
                    <div
                      key={idx}
                      className="rounded-2xl bg-white border border-[#9db4c0]/60 shadow-xs overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-[#c2dfe3]/60 border-b border-[#9db4c0]/45 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-[#253237]">
                          {c.topic}
                        </span>
                        <span className="rounded-full bg-[#253237] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#e0fbfc]">
                          {c.severity}
                        </span>
                      </div>

                      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        {/* Source A */}
                        <div className="rounded-xl bg-[#f2fafb] p-3 border border-[#9db4c0]/45 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#253237]">
                              [{c.sourceA.index}] {c.sourceA.filename}
                            </span>
                            {onInspectSource &&
                              sourceIdByIndex[c.sourceA.index] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectSource(
                                      c.sourceA.index,
                                      c.sourceA.quote
                                    )
                                  }
                                  className="text-[11px] font-semibold text-[#5c6b73] hover:text-[#253237] underline cursor-pointer"
                                >
                                  {isHe ? "הצג במקור" : "Verify Quote"}
                                </button>
                              )}
                          </div>
                          <p className="text-xs font-medium text-[#253237]">
                            {c.sourceA.claim}
                          </p>
                          {c.sourceA.quote && (
                            <blockquote className="text-[11px] font-mono text-[#5c6b73] border-s-2 border-[#5c6b73] ps-2 italic">
                              &ldquo;{c.sourceA.quote}&rdquo;
                            </blockquote>
                          )}
                        </div>

                        {/* Source B */}
                        <div className="rounded-xl bg-[#e0fbfc]/45 p-3 border border-[#9db4c0]/55 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[11px] font-bold text-[#253237]">
                              [{c.sourceB.index}] {c.sourceB.filename}
                            </span>
                            {onInspectSource &&
                              sourceIdByIndex[c.sourceB.index] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectSource(
                                      c.sourceB.index,
                                      c.sourceB.quote
                                    )
                                  }
                                  className="text-[11px] font-semibold text-[#5c6b73] hover:text-[#253237] underline cursor-pointer"
                                >
                                  {isHe ? "הצג במקור" : "Verify Quote"}
                                </button>
                              )}
                          </div>
                          <p className="text-xs font-medium text-[#253237]">
                            {c.sourceB.claim}
                          </p>
                          {c.sourceB.quote && (
                            <blockquote className="text-[11px] font-mono text-[#5c6b73] border-s-2 border-[#253237] ps-2 italic">
                              &ldquo;{c.sourceB.quote}&rdquo;
                            </blockquote>
                          )}
                        </div>
                      </div>

                      {c.resolutionNote && (
                        <div className="px-4 py-2.5 bg-[#f2fafb] border-t border-[#9db4c0]/35 text-xs text-[#5c6b73]">
                          <strong className="text-[#253237]">
                            {isHe ? "הבחנה:" : "Analysis:"}
                          </strong>{" "}
                          {c.resolutionNote}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-[#e0fbfc]/60 border border-[#9db4c0]/60 p-4 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-[#253237] shrink-0" />
                  <p className="text-xs font-medium text-[#253237]">
                    {isHe
                      ? "לא נמצאו סתירות ישירות בין המסמכים המסומנים."
                      : "No direct factual contradictions detected across the selected sources."}
                  </p>
                </div>
              )}

              {contradictionsData.alignments &&
                contradictionsData.alignments.length > 0 && (
                  <div className="rounded-xl bg-white p-4 border border-[#9db4c0]/50 space-y-2">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                      {isHe
                        ? "נקודות הסכמה ועקביות מאומתות"
                        : "Verified Cross-Source Alignments"}
                    </p>
                    <ul className="space-y-1.5 text-xs text-[#253237] list-disc ps-5">
                      {contradictionsData.alignments.map((a, i) => (
                        <li key={i}>{a}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          ) : briefData ? (
            <div className="space-y-4" dir="auto">
              <div className="rounded-2xl bg-white p-5 border border-[#9db4c0]/55 shadow-xs space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#e0fbfc] px-2.5 py-0.5 text-[10px] font-bold uppercase text-[#253237] border border-[#9db4c0]/50">
                    <Sparkles className="h-3 w-3" />
                    {isHe ? "תקציר מנהלים מאומת" : "Grounded Executive Brief"}
                  </span>
                </div>
                <h4 className="text-base font-bold text-[#253237]">
                  {briefData.title}
                </h4>
                <p className="text-xs leading-relaxed text-[#5c6b73]">
                  {briefData.executiveSummary}
                </p>
              </div>

              {/* Key Findings */}
              {briefData.keyFindings && briefData.keyFindings.length > 0 && (
                <div className="rounded-2xl bg-white p-4 border border-[#9db4c0]/55 space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe ? "ממצאים מרכזיים" : "Key Grounded Findings"}
                  </p>
                  <div className="space-y-2">
                    {briefData.keyFindings.map((f, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-[#f2fafb] p-3 border border-[#9db4c0]/40 space-y-1"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#253237]">
                            {f.heading}
                          </span>
                          <span className="rounded-full bg-[#e0fbfc] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#253237] border border-[#9db4c0]/55">
                            {f.citation}
                          </span>
                        </div>
                        <p className="text-xs text-[#5c6b73] leading-relaxed">
                          {f.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metrics & Dates */}
              {briefData.metricsAndDates &&
                briefData.metricsAndDates.length > 0 && (
                  <div className="rounded-2xl bg-white p-4 border border-[#9db4c0]/55 space-y-2.5">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                      {isHe
                        ? "מדדים, תאריכים ונתוני מפתח"
                        : "Key Metrics, Dates & Figures"}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {briefData.metricsAndDates.map((m, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-[#e0fbfc]/45 p-3 border border-[#9db4c0]/50 flex items-center justify-between gap-2"
                        >
                          <div>
                            <p className="text-[11px] text-[#5c6b73] font-medium">
                              {m.item}
                            </p>
                            <p className="text-xs font-bold text-[#253237]">
                              {m.value}
                            </p>
                          </div>
                          <span className="font-mono text-[10px] text-[#5c6b73]">
                            {m.citation}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Action Items */}
              {briefData.actionItems && briefData.actionItems.length > 0 && (
                <div className="rounded-2xl bg-white p-4 border border-[#9db4c0]/55 space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#5c6b73]">
                    {isHe
                      ? "משימות ודרישות לביצוע"
                      : "Action Items & Obligations"}
                  </p>
                  <div className="space-y-2">
                    {briefData.actionItems.map((a, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl bg-[#f2fafb] p-3 border border-[#9db4c0]/40 flex items-start justify-between gap-2.5"
                      >
                        <div className="flex items-start gap-2">
                          <span className="rounded bg-[#253237] px-1.5 py-0.5 text-[10px] font-bold text-[#e0fbfc] shrink-0">
                            {a.priority}
                          </span>
                          <span className="text-xs text-[#253237]">
                            {a.action}
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-[#5c6b73] shrink-0">
                          {a.citation}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : quizData ? (
            <div className="space-y-4" dir="auto">
              <div className="rounded-xl bg-white p-4 border border-[#9db4c0]/55 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-[#253237]">
                    {quizData.title}
                  </h4>
                  <p className="text-xs text-[#5c6b73]">
                    {isHe
                      ? "בחרו תשובה לכל שאלה כדי לחשוף את הציטוט המדויק מהמקור"
                      : "Select an answer for each question to reveal the exact verifying quote from the source"}
                  </p>
                </div>
                <span className="rounded-full bg-[#253237] px-3 py-1 font-mono text-xs font-semibold text-[#e0fbfc]">
                  {
                    Object.entries(selectedAnswers).filter(
                      ([qIdx, ans]) =>
                        quizData.questions[Number(qIdx)]?.correctIndex === ans
                    ).length
                  }{" "}
                  / {quizData.questions?.length || 0}
                </span>
              </div>

              {(quizData.questions || []).map((q, qIdx) => {
                const chosen = selectedAnswers[qIdx];
                const isRevealed = Boolean(revealedQuestions[qIdx]);

                return (
                  <div
                    key={q.id || qIdx}
                    className="rounded-2xl bg-white p-4 border border-[#9db4c0]/55 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-[#253237]">
                        {qIdx + 1}. {q.question}
                      </p>
                      <span className="rounded-full bg-[#e0fbfc] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#253237] border border-[#9db4c0]/55 shrink-0">
                        {q.citation}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {q.options.map((opt, optIdx) => {
                        const isSelected = chosen === optIdx;
                        const isCorrect = q.correctIndex === optIdx;

                        let btnStyle =
                          "bg-[#f2fafb] hover:bg-[#e0fbfc]/60 border-[#9db4c0]/50 text-[#253237]";
                        if (isRevealed) {
                          if (isCorrect) {
                            btnStyle =
                              "bg-[#253237] border-[#253237] text-[#e0fbfc] font-semibold";
                          } else if (isSelected) {
                            btnStyle =
                              "bg-[#c2dfe3]/60 border-[#5c6b73] text-[#253237] line-through";
                          }
                        }

                        return (
                          <button
                            key={optIdx}
                            type="button"
                            onClick={() => {
                              setSelectedAnswers((prev) => ({
                                ...prev,
                                [qIdx]: optIdx,
                              }));
                              setRevealedQuestions((prev) => ({
                                ...prev,
                                [qIdx]: true,
                              }));
                            }}
                            className={`rounded-xl px-3.5 py-2.5 text-xs text-start border transition-all cursor-pointer flex items-center justify-between gap-2 ${btnStyle}`}
                          >
                            <span>{opt}</span>
                            {isRevealed && isCorrect && (
                              <CheckCircle2 className="h-4 w-4 text-[#e0fbfc] shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>

                    {isRevealed && (
                      <div className="animate-fade-in rounded-xl bg-[#e0fbfc]/55 p-3 border border-[#9db4c0]/60 space-y-1.5 text-xs">
                        <p className="font-semibold text-[#253237]">
                          {chosen === q.correctIndex
                            ? isHe
                              ? "תשובה נכונה ומאומתת מול המקור!"
                              : "Correct & verified against source!"
                            : isHe
                              ? "לא מדויק — להלן ההסבר מתוך המקור:"
                              : "Not quite — here is the grounded explanation:"}
                        </p>
                        <p className="text-[#5c6b73]">{q.explanation}</p>
                        {q.sourceQuote && (
                          <div className="pt-1 flex items-center justify-between gap-2">
                            <blockquote className="font-mono text-[11px] text-[#253237] border-s-2 border-[#253237] ps-2 italic">
                              &ldquo;{q.sourceQuote}&rdquo;
                            </blockquote>
                            {onInspectSource &&
                              sourceIdByIndex[q.sourceIndex] && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onInspectSource(
                                      q.sourceIndex,
                                      q.sourceQuote
                                    )
                                  }
                                  className="text-[11px] font-semibold text-[#253237] underline shrink-0 cursor-pointer"
                                >
                                  {isHe ? "הדגש במקור" : "Highlight in Source"}
                                </button>
                              )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
