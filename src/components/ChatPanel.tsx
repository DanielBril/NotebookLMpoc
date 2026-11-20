"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  Loader2,
  ShieldAlert,
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
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const starterChips = useMemo(
    () => generateStarterQuestions(activeDocuments, t),
    [activeDocuments, t]
  );

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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

  return (
    <section className="flex-1 flex flex-col min-w-0 h-full bg-white">
      {/* Level 2 (Secondary Context): Minimal Studio & Grounding Sub-bar */}
      <div className="px-4 sm:px-8 py-2.5 bg-white border-b border-[#253237]/10 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#5c6b73]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#253237]" />
          <span className="font-medium text-[#253237]">
            {t.chat.groundedBadge}
          </span>
          <span className="text-[#9db4c0]">·</span>
          <span>
            {activeDocuments.length > 0
              ? t.chat.activeSourcesCount(activeDocuments.length)
              : t.chat.noActiveSources}
          </span>
        </div>

        {/* Secondary Ghost Actions — No filled dark background competing with primary CTA */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            id="studio-contradictions-btn"
            type="button"
            disabled={activeDocuments.length === 0 || isSending}
            onClick={() => onOpenStudio("contradictions")}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#5c6b73] hover:text-[#253237] hover:bg-[#f8fafb] border border-transparent hover:border-[#253237]/12 disabled:opacity-35 transition-colors cursor-pointer"
          >
            {isHe ? "רדאר סתירות" : "Conflict Radar"}
          </button>

          <button
            id="studio-brief-btn"
            type="button"
            disabled={activeDocuments.length === 0 || isSending}
            onClick={() => onOpenStudio("brief")}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#5c6b73] hover:text-[#253237] hover:bg-[#f8fafb] border border-transparent hover:border-[#253237]/12 disabled:opacity-35 transition-colors cursor-pointer"
          >
            {isHe ? "תקציר מנהלים (PDF)" : "Executive Brief (PDF)"}
          </button>

          <button
            id="studio-quiz-btn"
            type="button"
            disabled={activeDocuments.length === 0 || isSending}
            onClick={() => onOpenStudio("quiz")}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-[#5c6b73] hover:text-[#253237] hover:bg-[#f8fafb] border border-transparent hover:border-[#253237]/12 disabled:opacity-35 transition-colors cursor-pointer"
          >
            {isHe ? "בוחן בקרה" : "Audit Quiz"}
          </button>

          {messages.length > 0 && (
            <>
              <span className="mx-1 h-3.5 w-px bg-[#253237]/10" />
              <button
                id="clear-chat-btn"
                type="button"
                disabled={isSending}
                onClick={() => void onClearChat()}
                className="rounded-md px-2 py-1 text-xs text-[#5c6b73] hover:text-[#253237] hover:bg-[#f8fafb] disabled:opacity-35 transition-colors cursor-pointer"
              >
                {t.chat.clearChat}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Level 1 (Primary Focus): Editorial Grounded Q&A Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8">
        <div className="mx-auto max-w-3xl">
          {messages.length === 0 ? (
            <div className="py-14 sm:py-20 space-y-8">
              <div className="space-y-2.5 max-w-xl">
                <p className="text-[11px] font-mono uppercase tracking-widest text-[#5c6b73]">
                  {isHe ? "סינתזה מבוססת מקורות בלבד" : "Strictly Source-Grounded Synthesis"}
                </p>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#253237]">
                  {totalDocumentsCount === 0
                    ? t.chat.emptyTitleNoDocs
                    : activeDocuments.length === 0
                      ? t.chat.emptyTitleNoActive
                      : t.chat.emptyTitleReady}
                </h2>
                <p className="text-sm leading-relaxed text-[#5c6b73]">
                  {totalDocumentsCount === 0
                    ? t.chat.emptyDescNoDocs
                    : activeDocuments.length === 0
                      ? t.chat.emptyDescNoActive
                      : t.chat.emptyDescReady}
                </p>
              </div>

              {starterChips.length > 0 && (
                <div className="space-y-2 border-t border-[#253237]/10 pt-5">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-[#5c6b73]">
                    {t.chat.suggestedHeading}
                  </p>
                  <div className="divide-y divide-[#253237]/8">
                    {starterChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isSending}
                        onClick={() => void onSendQuery(chip)}
                        className="w-full py-2.5 text-start text-sm text-[#253237] hover:text-[#5c6b73] flex items-center justify-between gap-4 transition-colors cursor-pointer group"
                      >
                        <span className="truncate">{chip}</span>
                        <span className="text-xs font-mono text-[#9db4c0] group-hover:text-[#253237] shrink-0">
                          →
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="divide-y divide-[#253237]/8">
              {messages.map((msg) => {
                // User Question — High-contrast editorial prompt row
                if (msg.role === "user") {
                  return (
                    <div key={msg.id} className="py-5 first:pt-0">
                      <p className="text-[11px] font-mono uppercase tracking-wider text-[#5c6b73] mb-1">
                        {isHe ? "שאלה" : "Question"}
                      </p>
                      <div
                        dir="auto"
                        className="text-base font-medium leading-relaxed text-[#253237] whitespace-pre-wrap"
                      >
                        {msg.content}
                      </div>
                    </div>
                  );
                }

                // Guardrail / Security Alert Row
                if (msg.role === "system_alert") {
                  return (
                    <div key={msg.id} className="py-5">
                      <div className="rounded-lg bg-[#f8fafb] border-s-2 border-[#253237] px-4 py-3 text-sm text-[#253237]">
                        <div className="flex items-start gap-2.5">
                          <ShieldAlert className="h-4 w-4 mt-0.5 text-[#253237] shrink-0" />
                          <div className="space-y-1">
                            <p className="text-xs font-semibold uppercase tracking-wider text-[#253237]">
                              {t.chat.guardrailTriggeredTitle}
                            </p>
                            <p
                              dir="auto"
                              className="text-sm leading-relaxed text-[#5c6b73]"
                            >
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Assistant Grounded Response — Clean editorial prose without heavy outer card box
                const isNoContextRefusal = checkNoContextRefusal(msg.content);

                return (
                  <div key={msg.id} className="py-6">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#5c6b73]">
                        {isNoContextRefusal
                          ? t.chat.strictRefusalBadge
                          : isHe
                            ? "תשובה מבוססת מקורות"
                            : "Grounded Answer"}
                      </span>

                      {/* Level 3 (Tertiary Details): Quiet tabular telemetry */}
                      {msg.usage && !msg.isStreaming && (
                        <div
                          dir="ltr"
                          className="flex items-center gap-2.5 text-[11px] font-mono text-[#9db4c0]"
                        >
                          <span>{msg.usage.latencyMs}ms</span>
                          {msg.usage.ttftMs > 0 && (
                            <span>TTFT {msg.usage.ttftMs}ms</span>
                          )}
                          {msg.usage.cachedTokens > 0 && (
                            <span className="text-[#5c6b73]">
                              {t.chat.cachedTok(
                                msg.usage.cachedTokens.toLocaleString()
                              )}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      dir="auto"
                      className={`contextlm-prose ${
                        isNoContextRefusal ? "text-[#5c6b73] italic" : ""
                      }`}
                    >
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs text-[#5c6b73]">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#253237]" />
                          <span>{t.chat.synthesizing}</span>
                        </span>
                      )}
                    </div>

                    {/* Level 2 (Secondary Context): Clean Citation Footnotes */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-4 flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-mono text-[#5c6b73] me-1">
                          {t.chat.verifiedCitationsLabel}:
                        </span>
                        {msg.citations.map((cite) => (
                          <button
                            key={`${msg.id}-cite-${cite.index}-${cite.documentId}`}
                            type="button"
                            onClick={() => onCitationClick(cite)}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#f8fafb] hover:bg-[#e0fbfc]/60 px-2.5 py-1 text-xs font-medium text-[#253237] border border-[#253237]/12 transition-colors cursor-pointer"
                          >
                            <span className="font-mono text-[11px] font-semibold text-[#5c6b73]" dir="ltr">
                              [{cite.index}]
                            </span>
                            <span className="max-w-[180px] truncate">
                              {cite.filename}
                            </span>
                            {cite.matchScore && (
                              <span className="font-mono text-[10px] text-[#5c6b73]">
                                · {cite.matchScore}%
                              </span>
                            )}
                          </button>
                        ))}
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

      {/* Level 1 Primary Action: Bottom Sticky Input Composer */}
      <div className="border-t border-[#253237]/10 bg-white px-4 sm:px-8 py-4 shrink-0">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-xl bg-[#f8fafb] border border-[#253237]/18 focus-within:border-[#253237] focus-within:bg-white transition-colors px-3.5 py-2.5">
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
              className="w-full resize-none bg-transparent py-1 text-sm text-[#253237] placeholder:text-[#5c6b73]/70 focus:outline-none max-h-40"
            />

            <div className="mt-2 flex items-center justify-between gap-2 pt-2 border-t border-[#253237]/8">
              <div className="flex items-center gap-3 text-[11px] text-[#5c6b73]">
                <span>{t.chat.strictlySourcesOnly}</span>
                <span className="text-[#9db4c0]">·</span>
                <span className="font-mono" dir="ltr">
                  {input.length.toLocaleString()} /{" "}
                  {MAX_QUERY_CHARS.toLocaleString()}
                </span>
              </div>

              {/* Single Primary Accent Action */}
              <button
                id="chat-send-btn"
                type="button"
                disabled={isSending || !input.trim()}
                onClick={() => void submitCurrent()}
                className="btn-jet inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold cursor-pointer"
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
    </section>
  );
}
