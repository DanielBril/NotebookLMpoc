"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ClipboardCheck,
  FileText,
  GitCompareArrows,
  Loader2,
  Play,
  ShieldAlert,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { SourceDocumentItem } from "@/components/SourcesSidebar";
import type { StudioMode } from "@/app/api/studio/route";
import { useLanguage, type Translations } from "@/lib/i18n";

export interface CitationItem {
  index: number;
  documentId: string;
  filename: string;
  snippet: string;
  matchedQuote?: string;
  claimText?: string;
  confidence?: "verbatim" | "high" | "synthesized";
  matchScore?: number;
}

export interface ChatUsageMeta {
  promptTokens: number;
  cachedTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  ttftMs: number;
}

export interface ChatMessageItem {
  id: string;
  role: "user" | "assistant" | "system_alert";
  content: string;
  citations?: CitationItem[];
  usage?: ChatUsageMeta;
  createdAt: string;
  isStreaming?: boolean;
  queryLang?: "he" | "en";
}

interface ChatPanelProps {
  messages: ChatMessageItem[];
  activeDocuments: SourceDocumentItem[];
  totalDocumentsCount: number;
  isSending: boolean;
  onSendQuery: (query: string) => Promise<void>;
  onClearChat: () => Promise<void>;
  onCitationClick: (citation: CitationItem) => void;
  onOpenStudio: (mode: StudioMode) => void;
}

const MAX_QUERY_CHARS = 2000;

function detectTextLang(text: string, fallback: "he" | "en"): "he" | "en" {
  const he = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const en = (text.match(/[A-Za-z]/g) || []).length;
  if (he === 0 && en === 0) return fallback;
  return he >= en ? "he" : "en";
}

function generateStarterQuestions(
  activeDocs: SourceDocumentItem[],
  t: Translations
): string[] {
  if (activeDocs.length === 0) return [];

  const first = activeDocs[0].filename;
  if (activeDocs.length === 1) {
    return [
      t.chat.starterSingle1(first),
      t.chat.starterSingle2(first),
      t.chat.starterSingle3(first),
    ];
  }

  const second = activeDocs[1].filename;
  return [
    t.chat.starterMulti1(activeDocs.length),
    t.chat.starterMulti2(first, second),
    t.chat.starterMulti3,
  ];
}

function checkNoContextRefusal(content: string): boolean {
  return (
    content.includes("לא הצלחתי למצוא תשובה לשאלה זו במקורות שהעליתם") ||
    content.includes(
      "I could not find the answer to that question in your uploaded sources"
    )
  );
}

interface StudioActionOption {
  mode: StudioMode;
  titleHe: string;
  titleEn: string;
  shortHe: string;
  shortEn: string;
  descHe: string;
  descEn: string;
  startHe: string;
  startEn: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
}

const STUDIO_ACTIONS: StudioActionOption[] = [
  {
    mode: "contradictions",
    titleHe: "רדאר סתירות",
    titleEn: "Conflict Radar",
    shortHe: "הצלבת עובדות, מספרים ותאריכים בין מסמכים",
    shortEn: "Cross-check facts, figures & dates across files",
    descHe:
      "סורק את כל המקורות הפעילים שלך ומזהה סתירות, פערי מספרים, תאריכים מתנגשים או הבדלי ניסוח בין המסמכים — עם ציטוטים ישירים להשוואה.",
    descEn:
      "Scans all your active sources to detect contradictions, conflicting dates, mismatched figures, or policy gaps across documents — with direct citations.",
    startHe: "התחל סריקת סתירות",
    startEn: "Start Scan",
    accentBg: "bg-amber-50",
    accentText: "text-amber-700",
    accentBorder: "border-amber-200",
  },
  {
    mode: "brief",
    titleHe: "תקציר מנהלים (PDF)",
    titleEn: "Executive Brief (PDF)",
    shortHe: "דוח מסכם מעוצב שניתן לייצא ל-PDF",
    shortEn: "Structured summary report ready for PDF export",
    descHe:
      "מפיק תקציר מנהלים מסודר הכולל ממצאים מרכזיים, מדדים ותאריכים, פעולות נדרשות וסיכונים פתוחים מתוך המקורות שבחרת — עם כפתור ייצוא מעוצב ל-PDF.",
    descEn:
      "Generates a structured executive brief covering key findings, metrics & dates, prioritized action items, and open risks from your sources — with one-click PDF export.",
    startHe: "צור תקציר מנהלים",
    startEn: "Generate Brief",
    accentBg: "bg-blue-50",
    accentText: "text-blue-700",
    accentBorder: "border-blue-200",
  },
  {
    mode: "quiz",
    titleHe: "בוחן בקרה ואימות",
    titleEn: "Audit Quiz",
    shortHe: "4 שאלות אינטראקטיביות לבדיקת הבנה ואימות",
    shortEn: "4 interactive verification questions from your files",
    descHe:
      "יוצר בוחן אמריקאי אינטראקטיבי בן 4 שאלות המבוססות אך ורק על המסמכים הפעילים, כולל הסבר מאומת והפניה ישירה למקור לכל תשובה.",
    descEn:
      "Creates an interactive 4-question multiple-choice audit quiz grounded strictly in your active documents, with verified explanations and source citations.",
    startHe: "צור בוחן בקרה",
    startEn: "Create Quiz",
    accentBg: "bg-indigo-50",
    accentText: "text-indigo-700",
    accentBorder: "border-indigo-200",
  },
];

export function ChatPanel({
  messages,
  activeDocuments,
  totalDocumentsCount,
  isSending,
  onSendQuery,
  onClearChat,
  onCitationClick,
  onOpenStudio,
}: ChatPanelProps) {
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
  const [input, setInput] = useState("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [selectedAction, setSelectedAction] =
    useState<StudioActionOption | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);

  const starterChips = useMemo(
    () => generateStarterQuestions(activeDocuments, t),
    [activeDocuments, t]
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close More Actions popover on outside click or Escape
  useEffect(() => {
    if (!actionsOpen) return;
    function handleOutside(e: MouseEvent) {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(e.target as Node)
      ) {
        setActionsOpen(false);
        setSelectedAction(null);
      }
    }
    function handleEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") {
        setActionsOpen(false);
        setSelectedAction(null);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [actionsOpen]);

  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  async function submitCurrent() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await onSendQuery(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submitCurrent();
    }
  }

  function renderActionIcon(mode: StudioMode, className = "h-4 w-4") {
    if (mode === "contradictions") {
      return <GitCompareArrows className={className} />;
    }
    if (mode === "brief") {
      return <FileText className={className} />;
    }
    return <ClipboardCheck className={className} />;
  }

  return (
    <section className="flex-1 flex flex-col min-w-0 h-full bg-transparent">
      {/* Level 1 (Primary Focus): Editorial Glassy Q&A Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 ? (
            <div
              dir={isHe ? "rtl" : "ltr"}
              className="py-10 sm:py-16 space-y-8 animate-fade-in-up"
            >
              <div className="glass-panel rounded-3xl border p-7 sm:p-9 shadow-[0_14px_40px_-18px_rgba(15,23,42,0.12)] space-y-3">
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                  {totalDocumentsCount === 0
                    ? t.chat.emptyTitleNoDocs
                    : activeDocuments.length === 0
                      ? t.chat.emptyTitleNoActive
                      : t.chat.emptyTitleReady}
                </h2>
                <p className="text-sm leading-relaxed text-slate-600 max-w-xl">
                  {totalDocumentsCount === 0
                    ? t.chat.emptyDescNoDocs
                    : activeDocuments.length === 0
                      ? t.chat.emptyDescNoActive
                      : t.chat.emptyDescReady}
                </p>

                {starterChips.length > 0 && (
                  <div className="space-y-2 border-t border-slate-200/70 pt-5 mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      {t.chat.suggestedHeading}
                    </p>
                    <div className="divide-y divide-slate-200/55">
                      {starterChips.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          disabled={isSending}
                          onClick={() => void onSendQuery(chip)}
                          className="w-full py-3 px-2 -mx-2 rounded-xl text-start text-sm text-slate-800 hover:text-teal-700 hover:bg-white/70 flex items-center justify-between gap-4 cursor-pointer group"
                        >
                          <span className="truncate">{chip}</span>
                          <span className="text-xs font-mono text-slate-400 group-hover:text-teal-600 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5">
                            {isHe ? "←" : "→"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((msg, index) => {
                // User Question — Sleek glassy bubble
                if (msg.role === "user") {
                  return (
                    <div
                      key={msg.id}
                      className="animate-message-in flex justify-end"
                    >
                      <div className="max-w-[85%] rounded-2xl rounded-ee-sm bg-teal-600/12 backdrop-blur-md border border-teal-500/25 px-4 py-3 shadow-[0_6px_20px_-10px_rgba(13,148,136,0.25)]">
                        <div
                          dir="auto"
                          className="text-[15px] font-medium leading-relaxed text-slate-900 whitespace-pre-wrap"
                        >
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Guardrail / Security Blocked Alert (Rose Glass)
                if (msg.role === "system_alert") {
                  return (
                    <div key={msg.id} className="animate-message-in">
                      <div
                        dir={isHe ? "rtl" : "ltr"}
                        className="rounded-2xl bg-rose-50/85 backdrop-blur-md border border-rose-200/80 border-s-4 border-s-rose-600 px-5 py-4 text-sm text-rose-950 shadow-[0_8px_24px_-12px_rgba(225,29,72,0.18)]"
                      >
                        <div className="flex items-start gap-2.5">
                          <ShieldAlert className="h-4 w-4 mt-0.5 text-rose-600 shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                              {t.chat.guardrailTriggeredTitle}
                            </p>
                            <p
                              dir="auto"
                              className="text-sm leading-relaxed text-rose-900"
                            >
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Assistant Grounded Response
                const isNoContextRefusal = checkNoContextRefusal(msg.content);

                // Determine the language of the asked question for the waiting state
                const prevUserMsg =
                  index > 0 && messages[index - 1]?.role === "user"
                    ? messages[index - 1].content
                    : "";
                const askedLang: "he" | "en" =
                  msg.queryLang ??
                  (prevUserMsg
                    ? detectTextLang(prevUserMsg, lang)
                    : lang);
                const searchingMessage =
                  askedLang === "he"
                    ? "מחפש את התשובה הטובה ביותר לשאלה שלך…"
                    : "Searching for the best answer to your question…";

                return (
                  <div
                    key={msg.id}
                    className="animate-message-in glass-panel rounded-2xl border p-5 sm:p-6 shadow-[0_10px_30px_-14px_rgba(15,23,42,0.09)]"
                  >
                    {msg.content ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${
                              isNoContextRefusal
                                ? "text-amber-700"
                                : "text-emerald-700"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                isNoContextRefusal
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                            />
                            {isNoContextRefusal
                              ? t.chat.strictRefusalBadge
                              : isHe
                                ? "תשובה מבוססת מקורות"
                                : "Grounded Answer"}
                          </span>

                          {msg.usage && !msg.isStreaming && (
                            <div
                              dir="ltr"
                              className="flex items-center gap-2.5 text-[11px] font-mono text-slate-400"
                            >
                              <span>{msg.usage.latencyMs}ms</span>
                              {msg.usage.ttftMs > 0 && (
                                <span>TTFT {msg.usage.ttftMs}ms</span>
                              )}
                            </div>
                          )}
                        </div>

                        <div
                          dir="auto"
                          className={
                            isNoContextRefusal
                              ? "rounded-xl bg-amber-50/85 border border-amber-200/90 border-s-4 border-s-amber-500 px-4 py-3 text-sm leading-relaxed text-amber-950"
                              : "contextlm-prose"
                          }
                        >
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {msg.content}
                          </ReactMarkdown>
                        </div>

                        {/* Verified Citations */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div
                            dir={isHe ? "rtl" : "ltr"}
                            className="mt-4 pt-3 border-t border-slate-200/60 flex flex-wrap items-center gap-1.5"
                          >
                            <span className="text-[11px] font-medium text-slate-500 me-1">
                              {t.chat.verifiedCitationsLabel}:
                            </span>
                            {msg.citations.map((cite) => (
                              <button
                                key={`${msg.id}-cite-${cite.index}-${cite.documentId}`}
                                type="button"
                                onClick={() => onCitationClick(cite)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50/90 hover:bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-900 border border-emerald-200/80 cursor-pointer"
                              >
                                <span
                                  className="font-mono text-[11px] font-semibold text-emerald-700"
                                  dir="ltr"
                                >
                                  [{cite.index}]
                                </span>
                                <span className="max-w-[180px] truncate">
                                  {cite.filename}
                                </span>
                                {cite.matchScore && (
                                  <span className="font-mono text-[10px] text-emerald-700">
                                    · {cite.matchScore}%
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      /* Waiting for Answer: Searching message in the asked question's language */
                      <div
                        dir={askedLang === "he" ? "rtl" : "ltr"}
                        className="flex items-center gap-3 py-1 text-sm font-medium text-teal-800"
                      >
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <span className="h-2 w-2 rounded-full bg-teal-600 typing-dot" />
                          <span className="h-2 w-2 rounded-full bg-teal-500 typing-dot typing-dot-2" />
                          <span className="h-2 w-2 rounded-full bg-teal-400 typing-dot typing-dot-3" />
                        </span>
                        <span>{searchingMessage}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {/* Bottom Floating Glassy Input Composer Dock */}
      <div className="px-4 sm:px-8 pb-5 pt-2 shrink-0">
        <div className="mx-auto max-w-3xl relative">
          <div className="glass-dock rounded-2xl border border-white/80 ring-1 ring-slate-900/10 focus-within:ring-2 focus-within:ring-teal-500/45 transition-all px-4 py-3">
            <textarea
              ref={textareaRef}
              id="chat-query-input"
              dir="auto"
              rows={1}
              maxLength={MAX_QUERY_CHARS}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResizeTextarea(e.target);
              }}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              placeholder={
                activeDocuments.length > 0
                  ? t.chat.inputPlaceholderActive
                  : t.chat.inputPlaceholderEmpty
              }
              className="w-full resize-none bg-transparent py-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none max-h-40"
            />

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-200/70">
              {/* Left side: More Actions Dropdown + Clear Chat */}
              <div className="flex items-center gap-1.5">
                <div ref={actionsMenuRef} className="relative">
                  <button
                    id="more-actions-btn"
                    type="button"
                    disabled={isSending}
                    onClick={() => {
                      setActionsOpen((prev) => {
                        const next = !prev;
                        if (!next) setSelectedAction(null);
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold border cursor-pointer ${
                      actionsOpen
                        ? "bg-teal-50 text-teal-800 border-teal-300"
                        : "bg-white/80 text-slate-700 border-slate-200/90 hover:bg-white hover:border-teal-300 hover:text-teal-800"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                    <span>{isHe ? "פעולות נוספות" : "More Actions"}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${
                        actionsOpen ? "rotate-180 text-teal-600" : ""
                      }`}
                    />
                  </button>

                  {/* Glassy Popover Dropdown with Description + Explicit Start Button */}
                  {actionsOpen && (
                    <div
                      dir={isHe ? "rtl" : "ltr"}
                      className="animate-popover-in glass-popover absolute bottom-full start-0 mb-2.5 w-[310px] sm:w-[340px] rounded-2xl p-2 z-40"
                    >
                      {!selectedAction ? (
                        <div className="space-y-1">
                          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            {isHe
                              ? "בחרו כלי מתקדם למסמכים"
                              : "Choose a document tool"}
                          </p>
                          {STUDIO_ACTIONS.map((opt) => (
                            <button
                              key={opt.mode}
                              id={`studio-option-${opt.mode}`}
                              type="button"
                              onClick={() => setSelectedAction(opt)}
                              className="w-full rounded-xl p-2.5 text-start hover:bg-slate-900/5 flex items-start gap-3 cursor-pointer group"
                            >
                              <span
                                className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${opt.accentBg} ${opt.accentText} ${opt.accentBorder}`}
                              >
                                {renderActionIcon(opt.mode)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold text-slate-900 group-hover:text-teal-800">
                                  {isHe ? opt.titleHe : opt.titleEn}
                                </span>
                                <span className="block text-[11px] text-slate-500 mt-0.5 leading-snug">
                                  {isHe ? opt.shortHe : opt.shortEn}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2 space-y-3 animate-fade-in">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedAction(null)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              {isHe ? (
                                <ArrowRight className="h-3.5 w-3.5" />
                              ) : (
                                <ArrowLeft className="h-3.5 w-3.5" />
                              )}
                              <span>{isHe ? "חזרה" : "Back"}</span>
                            </button>
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${selectedAction.accentBg} ${selectedAction.accentText} ${selectedAction.accentBorder}`}
                            >
                              {renderActionIcon(
                                selectedAction.mode,
                                "h-3 w-3"
                              )}
                              {isHe
                                ? selectedAction.titleHe
                                : selectedAction.titleEn}
                            </span>
                          </div>

                          <p className="text-xs leading-relaxed text-slate-600 px-1">
                            {isHe
                              ? selectedAction.descHe
                              : selectedAction.descEn}
                          </p>

                          {activeDocuments.length === 0 && (
                            <p className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2 text-[11px] text-amber-800">
                              {isHe
                                ? "יש להעלות ולסמן לפחות מקור אחד כדי להפעיל פעולה זו."
                                : "Upload and select at least one source to run this tool."}
                            </p>
                          )}

                          <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAction(null);
                                setActionsOpen(false);
                              }}
                              className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                            >
                              {isHe ? "ביטול" : "Cancel"}
                            </button>
                            <button
                              id={`studio-start-${selectedAction.mode}-btn`}
                              type="button"
                              disabled={activeDocuments.length === 0}
                              onClick={() => {
                                const modeToRun = selectedAction.mode;
                                setSelectedAction(null);
                                setActionsOpen(false);
                                onOpenStudio(modeToRun);
                              }}
                              className="btn-jet inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
                            >
                              <Play className="h-3 w-3 fill-current" />
                              <span>
                                {isHe
                                  ? selectedAction.startHe
                                  : selectedAction.startEn}
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Clear Chat moved neatly into the writing box */}
                {messages.length > 0 && (
                  <button
                    id="clear-chat-btn"
                    type="button"
                    disabled={isSending}
                    onClick={() => void onClearChat()}
                    className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-rose-700 hover:bg-rose-50/90 border border-transparent hover:border-rose-200/80 disabled:opacity-35 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{t.chat.clearChat}</span>
                  </button>
                )}
              </div>

              {/* Right side: Character count + Single Primary "Ask" Button */}
              <div className="flex items-center gap-3">
                <span className="font-mono text-[11px] text-slate-400" dir="ltr">
                  {input.length.toLocaleString()} /{" "}
                  {MAX_QUERY_CHARS.toLocaleString()}
                </span>

                <button
                  id="chat-send-btn"
                  type="button"
                  disabled={isSending || !input.trim()}
                  onClick={() => void submitCurrent()}
                  className="btn-jet inline-flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>{t.chat.streaming}</span>
                    </>
                  ) : (
                    <>
                      <span>{t.chat.askSources}</span>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
