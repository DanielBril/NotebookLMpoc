"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowUp,
  BookOpenCheck,
  Clock,
  FileCheck2,
  Loader2,
  Lock,
  ShieldAlert,
  Sparkles,
  Trash2,
  Zap,
} from "lucide-react";
import type { SourceDocumentItem } from "@/components/SourcesSidebar";
import { useLanguage, type Translations } from "@/lib/i18n";

export interface CitationItem {
  index: number;
  documentId: string;
  filename: string;
  snippet: string;
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
  onCitationClick: (documentId: string, fallbackSnippet?: string) => void;
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
}: ChatPanelProps) {
  const { t } = useLanguage();
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
    <section className="flex-1 flex flex-col min-w-0 h-full bg-[#f2fafb]">
      {/* Subtle Top Sub-bar inside Chat Panel */}
      <div className="px-5 sm:px-7 py-2.5 bg-white/85 backdrop-blur-xs border-b border-[#9db4c0]/35 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#5c6b73]">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e0fbfc] px-2.5 py-0.5 font-semibold text-[#253237] border border-[#9db4c0]/50">
            <Lock className="h-3 w-3 text-[#5c6b73]" />
            {t.chat.groundedBadge}
          </span>
          <span className="hidden sm:inline text-[#5c6b73]">
            {activeDocuments.length > 0
              ? t.chat.activeSourcesCount(activeDocuments.length)
              : t.chat.noActiveSources}
          </span>
        </div>

        {messages.length > 0 && (
          <button
            id="clear-chat-btn"
            type="button"
            disabled={isSending}
            onClick={() => void onClearChat()}
            className="interactive-chip inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#5c6b73] hover:text-[#253237] hover:bg-[#c2dfe3]/40 disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t.chat.clearChat}</span>
          </button>
        )}
      </div>

      {/* Scrollable Q&A Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 ? (
            <div className="py-10 sm:py-16 text-center space-y-6 animate-fade-in-up">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c2dfe3]/75 text-[#253237] border border-[#9db4c0]/55 shadow-xs">
                <BookOpenCheck className="h-7 w-7" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#253237]">
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
                <div className="pt-2 space-y-2.5">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#5c6b73]">
                    <Sparkles className="h-3.5 w-3.5" />
                    {t.chat.suggestedHeading}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-start">
                    {starterChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isSending}
                        onClick={() => void onSendQuery(chip)}
                        className="interactive-card group rounded-xl bg-white hover:bg-[#e0fbfc]/75 p-3.5 text-xs leading-relaxed font-medium text-[#253237] border border-[#9db4c0]/50 hover:border-[#5c6b73] shadow-[0_2px_10px_rgba(37,50,55,0.04)] cursor-pointer text-start"
                      >
                        <span className="line-clamp-3">{chip}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            messages.map((msg) => {
              // User Bubble: --light-cyan (#e0fbfc) background with --jet-black text
              if (msg.role === "user") {
                return (
                  <div
                    key={msg.id}
                    className="flex justify-end animate-message-in"
                  >
                    <div className="max-w-[82%] rounded-2xl rounded-ee-sm bg-[#e0fbfc] px-4 py-3 text-sm leading-relaxed text-[#253237] border border-[#9db4c0]/70 shadow-xs whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Guardrail / Security Alert Card
              if (msg.role === "system_alert") {
                return (
                  <div
                    key={msg.id}
                    className="flex justify-start animate-message-in"
                  >
                    <div className="max-w-[90%] rounded-2xl bg-[#253237] px-4 py-3.5 text-sm text-[#e0fbfc] border border-[#5c6b73] shadow-[0_8px_22px_-8px_rgba(37,50,55,0.45)]">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-lg bg-[#e0fbfc] p-1.5 text-[#253237] shrink-0">
                          <ShieldAlert className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#c2dfe3]">
                            {t.chat.guardrailTriggeredTitle}
                          </p>
                          <p className="text-sm leading-relaxed text-[#e0fbfc]">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Assistant Grounded Bubble
              const isNoContextRefusal = checkNoContextRefusal(msg.content);

              return (
                <div
                  key={msg.id}
                  className="flex justify-start animate-message-in"
                >
                  <div
                    className={`max-w-[92%] rounded-2xl rounded-es-sm px-5 py-4 border shadow-xs transition-colors ${
                      isNoContextRefusal
                        ? "bg-[#c2dfe3]/65 border-[#5c6b73]/55"
                        : "bg-white border-[#9db4c0]/50"
                    }`}
                  >
                    {isNoContextRefusal && (
                      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#253237]">
                        <ShieldAlert className="h-3.5 w-3.5 text-[#5c6b73]" />
                        <span>{t.chat.strictRefusalBadge}</span>
                      </div>
                    )}

                    <div className="contextlm-prose">
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="inline-flex items-center gap-2.5 text-xs text-[#5c6b73]">
                          <span className="inline-flex items-center gap-1">
                            <span className="h-1.5 w-1.5 rounded-full bg-[#253237] typing-dot" />
                            <span className="h-1.5 w-1.5 rounded-full bg-[#5c6b73] typing-dot typing-dot-2" />
                            <span className="h-1.5 w-1.5 rounded-full bg-[#9db4c0] typing-dot typing-dot-3" />
                          </span>
                          <span>{t.chat.synthesizing}</span>
                        </span>
                      )}
                    </div>

                    {/* Interactive Inline Citation Pills */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-[#9db4c0]/35">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6b73] mb-2">
                          {t.chat.verifiedCitationsLabel}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cite) => (
                            <button
                              key={`${msg.id}-cite-${cite.index}-${cite.documentId}`}
                              type="button"
                              onClick={() =>
                                onCitationClick(cite.documentId, cite.snippet)
                              }
                              className="interactive-chip inline-flex items-center gap-1.5 rounded-full bg-[#c2dfe3]/80 hover:bg-[#9db4c0] px-2.5 py-1 text-xs font-semibold text-[#253237] border border-[#5c6b73]/25 cursor-pointer"
                            >
                              <FileCheck2 className="h-3 w-3 shrink-0" />
                              <span className="font-mono" dir="ltr">
                                [{cite.index}]
                              </span>
                              <span className="max-w-[180px] truncate">
                                {cite.filename}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stream Telemetry Strip */}
                    {msg.usage && !msg.isStreaming && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#5c6b73]">
                        <span className="inline-flex items-center gap-1" dir="ltr">
                          <Clock className="h-3 w-3" />
                          {msg.usage.latencyMs}ms
                        </span>
                        {msg.usage.ttftMs > 0 && (
                          <span dir="ltr">TTFT {msg.usage.ttftMs}ms</span>
                        )}
                        {msg.usage.cachedTokens > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-[#e0fbfc] px-1.5 py-0.5 text-[#253237] border border-[#9db4c0]/45 font-semibold">
                            <Zap className="h-2.5 w-2.5" />
                            {t.chat.cachedTok(
                              msg.usage.cachedTokens.toLocaleString()
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={scrollAnchorRef} />
        </div>
      </div>

      {/* Bottom Sticky Input Composer */}
      <div className="border-t border-[#9db4c0]/35 bg-white px-4 sm:px-7 py-3.5 shrink-0">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-[#f2fafb] border border-[#9db4c0]/65 focus-within:border-[#253237] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#c2dfe3]/60 transition-all p-2.5 shadow-xs">
            <textarea
              ref={textareaRef}
              id="chat-query-input"
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
              className="w-full resize-none bg-transparent px-2 py-1 text-sm text-[#253237] placeholder:text-[#5c6b73]/65 focus:outline-none max-h-40"
            />

            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-[11px] text-[#5c6b73]">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#c2dfe3]/55 px-2 py-0.5 font-medium text-[#253237]">
                  <Lock className="h-3 w-3 text-[#5c6b73]" />
                  {t.chat.strictlySourcesOnly}
                </span>
                <span className="font-mono" dir="ltr">
                  {input.length.toLocaleString()} /{" "}
                  {MAX_QUERY_CHARS.toLocaleString()}
                </span>
              </div>

              <button
                id="chat-send-btn"
                type="button"
                disabled={isSending || !input.trim()}
                onClick={() => void submitCurrent()}
                className="btn-jet inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold cursor-pointer"
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
