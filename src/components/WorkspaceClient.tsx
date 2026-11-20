"use client";

import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { BlockedAccountScreen } from "@/components/BlockedAccountScreen";
import {
  ChatPanel,
  type ChatMessageItem,
  type ChatUsageMeta,
  type CitationItem,
} from "@/components/ChatPanel";
import {
  SourcesSidebar,
  type PreviewDocState,
  type SourceDocumentItem,
  type SourcesSummary,
} from "@/components/SourcesSidebar";
import { StudioModal } from "@/components/StudioModal";
import type {
  AuditQuizResult,
  ContradictionsResult,
  ExecutiveBriefResult,
  StudioMode,
} from "@/app/api/studio/route";
import { useLanguage } from "@/lib/i18n";
import {
  MAX_ACTIVE_CONTEXT_TOKENS,
  MAX_FILES_PER_USER,
  MAX_TOTAL_STORAGE_BYTES,
} from "@/lib/constants";

interface WorkspaceClientProps {
  user: {
    id: string;
    username: string;
    name?: string | null;
    image?: string | null;
    role: string;
  };
}

const EMPTY_SUMMARY: SourcesSummary = {
  count: 0,
  activeCount: 0,
  maxFiles: MAX_FILES_PER_USER,
  totalSizeBytes: 0,
  maxTotalSizeBytes: MAX_TOTAL_STORAGE_BYTES,
  activeTokens: 0,
  maxActiveTokens: MAX_ACTIVE_CONTEXT_TOKENS,
};

function recomputeSummary(docs: SourceDocumentItem[]): SourcesSummary {
  let totalSizeBytes = 0;
  let activeTokens = 0;
  let activeCount = 0;
  for (const d of docs) {
    totalSizeBytes += d.sizeBytes;
    if (d.isSelected) {
      activeTokens += d.tokenCount;
      activeCount += 1;
    }
  }
  return {
    count: docs.length,
    activeCount,
    maxFiles: MAX_FILES_PER_USER,
    totalSizeBytes,
    maxTotalSizeBytes: MAX_TOTAL_STORAGE_BYTES,
    activeTokens,
    maxActiveTokens: MAX_ACTIVE_CONTEXT_TOKENS,
  };
}

export function WorkspaceClient({ user }: WorkspaceClientProps) {
  const { lang, t } = useLanguage();
  const [documents, setDocuments] = useState<SourceDocumentItem[]>([]);
  const [summary, setSummary] = useState<SourcesSummary>(EMPTY_SUMMARY);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toastError, setToastError] = useState<string | null>(null);
  const [toastWarning, setToastWarning] = useState<string | null>(null);
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);
  const [blockedState, setBlockedState] = useState<{
    blocked: boolean;
    reason: string | null;
  }>({ blocked: false, reason: null });
  const [previewDoc, setPreviewDoc] = useState<PreviewDocState | null>(null);
  const [studioModal, setStudioModal] = useState<{
    mode: StudioMode;
    isLoading: boolean;
    error: string | null;
    data: ContradictionsResult | ExecutiveBriefResult | AuditQuizResult | null;
    sourceIdByIndex: Record<number, string>;
  } | null>(null);

  const activeDocuments = useMemo(
    () => documents.filter((d) => d.isSelected),
    [documents]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadWorkspace() {
      try {
        const [docsRes, chatRes] = await Promise.all([
          fetch("/api/documents", { cache: "no-store" }),
          fetch("/api/chat", { cache: "no-store" }),
        ]);

        if (cancelled) return;

        if (docsRes.status === 403 || chatRes.status === 403) {
          const errRes = docsRes.status === 403 ? docsRes : chatRes;
          const errJson = (await errRes.json().catch(() => ({}))) as {
            accountBlocked?: boolean;
            reason?: string | null;
          };
          if (errJson.accountBlocked) {
            setBlockedState({ blocked: true, reason: errJson.reason ?? null });
            return;
          }
        }

        if (docsRes.ok) {
          const docsJson = (await docsRes.json()) as {
            documents: SourceDocumentItem[];
            summary: SourcesSummary;
          };
          setDocuments(docsJson.documents);
          setSummary(docsJson.summary);
        }

        if (chatRes.ok) {
          const chatJson = (await chatRes.json()) as {
            messages: ChatMessageItem[];
          };
          setMessages(chatJson.messages);
        }
      } catch {
        if (!cancelled) {
          setToastError(t.chat.errLoadWorkspace);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDocs(false);
        }
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [t.chat.errLoadWorkspace]);

  if (blockedState.blocked) {
    return <BlockedAccountScreen reason={blockedState.reason} />;
  }

  async function handleUploadFiles(files: File[]) {
    setToastError(null);
    setToastWarning(null);
    const formData = new FormData();
    for (const file of files) {
      formData.append("files", file);
    }

    const res = await fetch("/api/documents", {
      method: "POST",
      body: formData,
    });

    const data = (await res.json()) as {
      error?: string;
      accountBlocked?: boolean;
      reason?: string | null;
      documents?: SourceDocumentItem[];
      warnings?: string[];
      summary?: SourcesSummary;
    };

    if (res.status === 403 && data.accountBlocked) {
      setBlockedState({ blocked: true, reason: data.reason ?? null });
      return;
    }

    if (!res.ok) {
      setToastError(data.error || t.chat.errUploadFailed);
      return;
    }

    if (data.documents) {
      setDocuments((prev) => [...data.documents!, ...prev]);
    }
    if (data.summary) {
      setSummary(data.summary);
    }
    if (data.warnings && data.warnings.length > 0) {
      setToastWarning(data.warnings.join(" "));
    }
  }

  async function handleToggleSelect(docId: string, nextSelected: boolean) {
    setToastError(null);
    const res = await fetch(`/api/documents/${docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isSelected: nextSelected }),
    });

    const data = (await res.json()) as {
      error?: string;
      accountBlocked?: boolean;
      reason?: string | null;
    };

    if (res.status === 403 && data.accountBlocked) {
      setBlockedState({ blocked: true, reason: data.reason ?? null });
      return;
    }

    if (!res.ok) {
      setToastError(data.error || t.chat.errToggleFailed);
      return;
    }

    setDocuments((prev) => {
      const next = prev.map((d) =>
        d.id === docId ? { ...d, isSelected: nextSelected } : d
      );
      setSummary(recomputeSummary(next));
      return next;
    });
  }

  async function handleDeleteDoc(docId: string) {
    setToastError(null);
    const res = await fetch(`/api/documents/${docId}`, {
      method: "DELETE",
    });

    if (!res.ok) {
      const data = (await res.json()) as {
        error?: string;
        accountBlocked?: boolean;
        reason?: string | null;
      };
      if (res.status === 403 && data.accountBlocked) {
        setBlockedState({ blocked: true, reason: data.reason ?? null });
        return;
      }
      setToastError(data.error || t.chat.errDeleteFailed);
      return;
    }

    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== docId);
      setSummary(recomputeSummary(next));
      return next;
    });

    if (previewDoc?.id === docId) {
      setPreviewDoc(null);
    }
  }

  async function handleOpenPreview(
    docId: string,
    fallbackSnippet?: string,
    verifyMeta?: {
      matchedQuote?: string;
      claimText?: string;
      confidence?: "verbatim" | "high" | "synthesized";
      matchScore?: number;
    }
  ) {
    setSidebarOpen(true);
    setHighlightedDocId(docId);
    setTimeout(() => {
      const card = document.getElementById(`source-card-${docId}`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    setTimeout(() => {
      setHighlightedDocId((curr) => (curr === docId ? null : curr));
    }, 2400);

    const docMeta = documents.find((d) => d.id === docId);
    setPreviewDoc({
      id: docId,
      filename: docMeta?.filename ?? t.sources.sourceDocumentFallback,
      excerpt: fallbackSnippet || docMeta?.previewSnippet || "",
      tokenCount: docMeta?.tokenCount ?? 0,
      loading: true,
      matchedQuote: verifyMeta?.matchedQuote,
      claimText: verifyMeta?.claimText,
      confidence: verifyMeta?.confidence,
      matchScore: verifyMeta?.matchScore,
    });

    try {
      const res = await fetch(`/api/documents/${docId}`, { cache: "no-store" });
      if (res.status === 403) {
        const errJson = (await res.json().catch(() => ({}))) as {
          accountBlocked?: boolean;
          reason?: string | null;
        };
        if (errJson.accountBlocked) {
          setBlockedState({ blocked: true, reason: errJson.reason ?? null });
          return;
        }
      }
      if (res.ok) {
        const json = (await res.json()) as {
          document: { filename: string; excerpt: string; tokenCount: number };
        };
        setPreviewDoc({
          id: docId,
          filename: json.document.filename,
          excerpt: json.document.excerpt,
          tokenCount: json.document.tokenCount,
          loading: false,
          matchedQuote: verifyMeta?.matchedQuote,
          claimText: verifyMeta?.claimText,
          confidence: verifyMeta?.confidence,
          matchScore: verifyMeta?.matchScore,
        });
      } else {
        setPreviewDoc((prev) => (prev ? { ...prev, loading: false } : null));
      }
    } catch {
      setPreviewDoc((prev) => (prev ? { ...prev, loading: false } : null));
    }
  }

  async function handleOpenStudio(mode: StudioMode) {
    const initialMap: Record<number, string> = {};
    const sorted = [...activeDocuments].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    sorted.forEach((d, idx) => {
      initialMap[idx + 1] = d.id;
    });

    setStudioModal({
      mode,
      isLoading: true,
      error: null,
      data: null,
      sourceIdByIndex: initialMap,
    });

    try {
      const res = await fetch("/api/studio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, lang }),
      });

      const json = (await res.json()) as {
        error?: string;
        accountBlocked?: boolean;
        reason?: string | null;
        result?: ContradictionsResult | ExecutiveBriefResult | AuditQuizResult;
        sources?: Array<{ index: number; id: string }>;
      };

      if (res.status === 403 && json.accountBlocked) {
        setStudioModal(null);
        setBlockedState({ blocked: true, reason: json.reason ?? null });
        return;
      }

      if (!res.ok || !json.result) {
        setStudioModal((prev) =>
          prev
            ? {
                ...prev,
                isLoading: false,
                error: json.error || t.chat.errRequestFailed,
              }
            : null
        );
        return;
      }

      const nextMap = { ...initialMap };
      for (const s of json.sources ?? []) {
        nextMap[s.index] = s.id;
      }

      setStudioModal((prev) =>
        prev
          ? {
              ...prev,
              isLoading: false,
              data: json.result!,
              sourceIdByIndex: nextMap,
            }
          : null
      );
    } catch {
      setStudioModal((prev) =>
        prev
          ? {
              ...prev,
              isLoading: false,
              error: t.chat.errConnectionInterrupted,
            }
          : null
      );
    }
  }

  async function handleClearChat() {
    const res = await fetch("/api/chat", { method: "DELETE" });
    if (res.status === 403) {
      const errJson = (await res.json().catch(() => ({}))) as {
        accountBlocked?: boolean;
        reason?: string | null;
      };
      if (errJson.accountBlocked) {
        setBlockedState({ blocked: true, reason: errJson.reason ?? null });
        return;
      }
    }
    if (res.ok) {
      setMessages([]);
    }
  }

  async function handleSendQuery(query: string) {
    setIsSending(true);
    const tempUserId = `temp-user-${Date.now()}`;
    const tempAssistantId = `temp-ai-${Date.now()}`;
    const nowIso = new Date().toISOString();

    setMessages((prev) => [
      ...prev,
      { id: tempUserId, role: "user", content: query, createdAt: nowIso },
      {
        id: tempAssistantId,
        role: "assistant",
        content: "",
        createdAt: nowIso,
        isStreaming: true,
      },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, lang }),
      });

      const contentType = res.headers.get("content-type") || "";

      if (!res.ok || contentType.includes("application/json")) {
        const json = (await res.json()) as {
          blocked?: boolean;
          accountBlocked?: boolean;
          reason?: string | null;
          error?: string;
          message?: ChatMessageItem;
        };

        if (res.status === 403 && json.accountBlocked) {
          setBlockedState({ blocked: true, reason: json.reason ?? null });
          return;
        }

        if (json.blocked && json.message) {
          setMessages((prev) =>
            prev.map((m) => (m.id === tempAssistantId ? json.message! : m))
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId
                ? {
                    ...m,
                    role: "system_alert",
                    content:
                      json.error || json.reason || t.chat.errRequestFailed,
                    isStreaming: false,
                  }
                : m
            )
          );
        }
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Empty streaming response body.");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const rawEvent of events) {
          const lines = rawEvent.split("\n");
          let eventName = "message";
          let dataLine = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLine += line.slice(5).trim();
            }
          }

          if (!dataLine) continue;

          try {
            const payload = JSON.parse(dataLine) as {
              content?: string;
              messageId?: string;
              citations?: CitationItem[];
              usage?: ChatUsageMeta;
              aborted?: boolean;
              error?: string;
            };

            if (eventName === "token" && payload.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? { ...m, content: m.content + payload.content }
                    : m
                )
              );
            } else if (eventName === "guardrail_abort") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? {
                        ...m,
                        role: "system_alert",
                        content: payload.content || t.chat.errOutputGuard,
                        isStreaming: false,
                      }
                    : m
                )
              );
            } else if (eventName === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? {
                        ...m,
                        id: payload.messageId || m.id,
                        citations: payload.citations ?? [],
                        usage: payload.usage,
                        isStreaming: false,
                      }
                    : m
                )
              );
            } else if (eventName === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId
                    ? {
                        ...m,
                        role: "system_alert",
                        content: payload.error || t.chat.errStreamError,
                        isStreaming: false,
                      }
                    : m
                )
              );
            }
          } catch {
            // Ignore partial/malformed SSE JSON frames
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === tempAssistantId
            ? {
                ...m,
                role: "system_alert",
                content: t.chat.errConnectionInterrupted,
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f2fafb]">
      <Navbar
        mode="workspace"
        user={user}
        sourceCount={summary.count}
        activeTokens={summary.activeTokens}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div className="flex-1 flex min-h-0 relative overflow-hidden">
        <ChatPanel
          messages={messages}
          activeDocuments={activeDocuments}
          totalDocumentsCount={documents.length}
          isSending={isSending}
          onSendQuery={handleSendQuery}
          onClearChat={handleClearChat}
          onCitationClick={(cite) =>
            void handleOpenPreview(cite.documentId, cite.snippet, {
              matchedQuote: cite.matchedQuote,
              claimText: cite.claimText,
              confidence: cite.confidence,
              matchScore: cite.matchScore,
            })
          }
          onOpenStudio={(mode) => void handleOpenStudio(mode)}
        />

        {/* Desktop collapsible & Mobile overlay sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-y-0 end-0 top-[59px] z-20 w-full max-w-[380px] lg:static lg:inset-auto lg:w-auto lg:max-w-none shadow-2xl lg:shadow-none animate-fade-in">
            <SourcesSidebar
              documents={documents}
              summary={summary}
              isLoading={isLoadingDocs}
              highlightedDocId={highlightedDocId}
              previewDoc={previewDoc}
              onClosePreview={() => setPreviewDoc(null)}
              onOpenPreview={(docId, snippet) =>
                void handleOpenPreview(docId, snippet)
              }
              onUploadFiles={handleUploadFiles}
              onToggleSelect={handleToggleSelect}
              onDeleteDoc={handleDeleteDoc}
              onCollapse={() => setSidebarOpen(false)}
              toastError={toastError}
              toastWarning={toastWarning}
              onDismissToast={() => {
                setToastError(null);
                setToastWarning(null);
              }}
            />
          </div>
        )}
      </div>

      {studioModal && (
        <StudioModal
          mode={studioModal.mode}
          data={studioModal.data}
          isLoading={studioModal.isLoading}
          error={studioModal.error}
          sourceIdByIndex={studioModal.sourceIdByIndex}
          onClose={() => setStudioModal(null)}
          onInspectSource={(sourceIndex, quote) => {
            const docId = studioModal.sourceIdByIndex[sourceIndex];
            if (docId) {
              setStudioModal(null);
              void handleOpenPreview(docId, quote, {
                matchedQuote: quote,
                confidence: "verbatim",
                matchScore: 95,
              });
            }
          }}
        />
      )}
    </div>
  );
}
