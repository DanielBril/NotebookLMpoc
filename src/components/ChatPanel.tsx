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

function generateStarterQuestions(activeDocs: SourceDocumentItem[]): string[] {
  if (activeDocs.length === 0) return [];

  const first = activeDocs[0].filename;
  if (activeDocs.length === 1) {
    return [
      `Summarize the key facts and core conclusions stated in ${first}.`,
      `List all specific dates, figures, or requirements mentioned in ${first}.`,
      `What open risks, caveats, or action items appear in ${first}?`,
    ];
  }

  const second = activeDocs[1].filename;
  return [
    `Synthesize the main points across my ${activeDocs.length} selected sources.`,
    `Compare what ${first} and ${second} state regarding key terms or metrics.`,
    `Extract any specific deadlines, numbers, or obligations across the active documents.`,
  ];
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
  const [input, setInput] = useState("");
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const starterChips = useMemo(
    () => generateStarterQuestions(activeDocuments),
    [activeDocuments]
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
    <section className="flex-1 flex flex-col min-w-0 h-full bg-[#f7fafb]">
      {/* Subtle Top Sub-bar inside Chat Panel */}
      <div className="px-5 sm:px-7 py-2.5 bg-white/80 backdrop-blur-xs border-b border-[#373737]/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2 text-xs text-[#373737]/80">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#c7dfc5]/65 px-2.5 py-0.5 font-semibold text-[#373737]">
            <Lock className="h-3 w-3" />
            Grounded Mode: Strictly Sources Only
          </span>
          <span className="hidden sm:inline text-[#373737]/55">
            {activeDocuments.length > 0
              ? `${activeDocuments.length} active ${activeDocuments.length === 1 ? "source" : "sources"} in context`
              : "No active sources selected"}
          </span>
        </div>

        {messages.length > 0 && (
          <button
            id="clear-chat-btn"
            type="button"
            disabled={isSending}
            onClick={() => void onClearChat()}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[#373737]/65 hover:text-[#373737] hover:bg-[#373737]/8 transition-colors disabled:opacity-40 cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Chat</span>
          </button>
        )}
      </div>

      {/* Scrollable Q&A Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-7 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 ? (
            <div className="py-10 sm:py-16 text-center space-y-6">
              <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[#c1dbe3]/65 text-[#373737] border border-[#373737]/12">
                <BookOpenCheck className="h-7 w-7" />
              </div>

              <div className="space-y-2 max-w-lg mx-auto">
                <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#373737]">
                  {totalDocumentsCount === 0
                    ? "Add your first source to begin"
                    : activeDocuments.length === 0
                      ? "Select at least one source on the right"
                      : "Ask anything about your selected sources"}
                </h2>
                <p className="text-sm leading-relaxed text-[#373737]/65">
                  {totalDocumentsCount === 0
                    ? "Upload up to 10 PDF, DOCX, TXT, MD, or CSV files in the Sources drawer on the right. Every answer is grounded exclusively in your documents with inline citations."
                    : activeDocuments.length === 0
                      ? "Check one or more uploaded documents in the right-hand Sources drawer to load them into the grounded context window."
                      : "ContextLM answers strictly from your checked documents—with zero outside speculation, inline clickable citations, and real-time injection protection."}
                </p>
              </div>

              {starterChips.length > 0 && (
                <div className="pt-2 space-y-2.5">
                  <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#373737]/55">
                    <Sparkles className="h-3.5 w-3.5" />
                    Suggested grounded questions
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-left">
                    {starterChips.map((chip, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isSending}
                        onClick={() => void onSendQuery(chip)}
                        className="group rounded-xl bg-white hover:bg-[#f6feaa]/55 p-3.5 text-xs leading-relaxed font-medium text-[#373737] border border-[#373737]/14 hover:border-[#373737]/40 transition-all shadow-[0_2px_8px_rgba(55,55,55,0.04)] cursor-pointer"
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
              // User Bubble: --lime-cream (#f6feaa) background with --graphite text
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div className="max-w-[82%] rounded-2xl rounded-br-sm bg-[#f6feaa] px-4 py-3 text-sm leading-relaxed text-[#373737] border border-[#373737]/15 shadow-xs whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  </div>
                );
              }

              // Guardrail / Refusal Alert Card: --jasmine (#fce694) with --graphite border + shield icon
              if (msg.role === "system_alert") {
                return (
                  <div key={msg.id} className="flex justify-start">
                    <div className="max-w-[90%] rounded-2xl bg-[#fce694] px-4 py-3.5 text-sm text-[#373737] border-[1.5px] border-[#373737] shadow-xs">
                      <div className="flex items-start gap-2.5">
                        <div className="mt-0.5 rounded-lg bg-[#373737] p-1.5 text-[#fce694] shrink-0">
                          <ShieldAlert className="h-4 w-4" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-[#373737]">
                            Prompt-Injection &amp; Scope Guardrail Triggered
                          </p>
                          <p className="text-sm leading-relaxed text-[#373737]">
                            {msg.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              // Assistant Grounded Bubble: rgba(193, 219, 227, 0.35) (--pale-sky) + --tea-green inline citation chips
              const isNoContextRefusal = msg.content.includes(
                "I could not find the answer to that question in your uploaded sources"
              );

              return (
                <div key={msg.id} className="flex justify-start">
                  <div
                    className={`max-w-[92%] rounded-2xl rounded-bl-sm px-5 py-4 border shadow-xs ${
                      isNoContextRefusal
                        ? "bg-[#fce694]/70 border-[#373737]/40"
                        : "bg-[#c1dbe3]/35 border-[#373737]/14"
                    }`}
                  >
                    {isNoContextRefusal && (
                      <div className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#373737]">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        <span>Strict Grounding Refusal</span>
                      </div>
                    )}

                    <div className="contextlm-prose">
                      {msg.content ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span className="inline-flex items-center gap-2 text-xs text-[#373737]/70">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Synthesizing grounded answer…
                        </span>
                      )}
                    </div>

                    {/* Interactive Inline Citation Pills (--tea-green #c7dfc5) */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-3.5 pt-3 border-t border-[#373737]/12">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#373737]/60 mb-2">
                          Verified Source Citations (click to inspect)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.citations.map((cite) => (
                            <button
                              key={`${msg.id}-cite-${cite.index}-${cite.documentId}`}
                              type="button"
                              onClick={() =>
                                onCitationClick(cite.documentId, cite.snippet)
                              }
                              className="inline-flex items-center gap-1.5 rounded-full bg-[#c7dfc5] hover:bg-[#b5d4b2] px-2.5 py-1 text-xs font-semibold text-[#373737] border border-[#373737]/18 transition-colors cursor-pointer"
                            >
                              <FileCheck2 className="h-3 w-3 shrink-0" />
                              <span className="font-mono">[{cite.index}]</span>
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
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-mono text-[#373737]/60">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {msg.usage.latencyMs}ms
                        </span>
                        {msg.usage.ttftMs > 0 && (
                          <span>TTFT {msg.usage.ttftMs}ms</span>
                        )}
                        {msg.usage.cachedTokens > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-[#f6feaa] px-1.5 py-0.5 text-[#373737] font-semibold">
                            <Zap className="h-2.5 w-2.5" />
                            {msg.usage.cachedTokens.toLocaleString()} cached tok
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
      <div className="border-t border-[#373737]/12 bg-white px-4 sm:px-7 py-3.5 shrink-0">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl bg-[#f7fafb] border border-[#373737]/20 focus-within:border-[#373737] focus-within:bg-white transition-colors p-2.5 shadow-xs">
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
                  ? "Ask a factual question about your checked sources… (Enter to send, Shift+Enter for newline)"
                  : "Upload and select sources on the right to ask grounded questions…"
              }
              className="w-full resize-none bg-transparent px-2 py-1 text-sm text-[#373737] placeholder:text-[#373737]/45 focus:outline-none max-h-40"
            />

            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-2 text-[11px] text-[#373737]/60">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#c1dbe3]/45 px-2 py-0.5 font-medium text-[#373737]">
                  <Lock className="h-3 w-3" />
                  Strictly Sources Only
                </span>
                <span className="font-mono">
                  {input.length.toLocaleString()} / {MAX_QUERY_CHARS.toLocaleString()}
                </span>
              </div>

              <button
                id="chat-send-btn"
                type="button"
                disabled={isSending || !input.trim()}
                onClick={() => void submitCurrent()}
                className="btn-graphite inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-[#f6feaa] cursor-pointer"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Streaming…</span>
                  </>
                ) : (
                  <>
                    <span>Ask Sources</span>
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
