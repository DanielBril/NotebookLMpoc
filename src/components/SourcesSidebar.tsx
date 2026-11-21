"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Check,
  Eye,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  ALLOWED_EXTENSIONS,
  MAX_ACTIVE_CONTEXT_TOKENS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_USER,
} from "@/lib/constants";
import { useLanguage } from "@/lib/i18n";

export interface SourceDocumentItem {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  tokenCount: number;
  isSelected: boolean;
  createdAt: string;
  previewSnippet: string;
}

export interface SourcesSummary {
  count: number;
  activeCount: number;
  maxFiles: number;
  totalSizeBytes: number;
  maxTotalSizeBytes: number;
  activeTokens: number;
  maxActiveTokens: number;
}

export interface PreviewDocState {
  id: string;
  filename: string;
  excerpt: string;
  tokenCount: number;
  loading: boolean;
  matchedQuote?: string;
  claimText?: string;
  confidence?: "verbatim" | "high" | "synthesized";
  matchScore?: number;
}

interface SourcesSidebarProps {
  documents: SourceDocumentItem[];
  summary: SourcesSummary;
  isLoading: boolean;
  isSyncingDelete?: boolean;
  highlightedDocId: string | null;
  previewDoc: PreviewDocState | null;
  onClosePreview: () => void;
  onOpenPreview: (docId: string, fallbackSnippet?: string) => void;
  onUploadFiles: (files: File[]) => Promise<void>;
  onToggleSelect: (docId: string, nextSelected: boolean) => Promise<void>;
  onDeleteDoc: (docId: string) => Promise<void>;
  onCollapse?: () => void;
  toastError: string | null;
  toastWarning: string | null;
  onDismissToast: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileTypeBadge(filename: string): { label: string } {
  const dot = filename.lastIndexOf(".");
  const ext = dot >= 0 ? filename.slice(dot + 1).toUpperCase() : "DOC";
  return { label: ext || "DOC" };
}

export function SourcesSidebar({
  documents,
  summary,
  isLoading,
  isSyncingDelete = false,
  highlightedDocId,
  previewDoc,
  onClosePreview,
  onOpenPreview,
  onUploadFiles,
  onToggleSelect,
  onDeleteDoc,
  onCollapse,
  toastError,
  toastWarning,
  onDismissToast,
}: SourcesSidebarProps) {
  const { lang, t } = useLanguage();
  const isHe = lang === "he";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const highlightMarkRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingToggleId, setPendingToggleId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (previewDoc && !previewDoc.loading && previewDoc.matchedQuote) {
      const timer = setTimeout(() => {
        highlightMarkRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 90);
      return () => clearTimeout(timer);
    }
  }, [previewDoc]);

  const isAtFileCap = summary.count >= MAX_FILES_PER_USER;

  function validateClientFiles(incoming: File[]): File[] | null {
    setLocalError(null);
    if (incoming.length === 0) return null;

    if (summary.count >= MAX_FILES_PER_USER) {
      setLocalError(t.sources.errMaxFiles);
      return null;
    }

    if (summary.count + incoming.length > MAX_FILES_PER_USER) {
      const remaining = MAX_FILES_PER_USER - summary.count;
      setLocalError(t.sources.errRemainingFiles(remaining));
      return null;
    }

    for (const file of incoming) {
      const dotIdx = file.name.lastIndexOf(".");
      const ext = dotIdx >= 0 ? file.name.slice(dotIdx).toLowerCase() : "";
      if (!(ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
        setLocalError(t.sources.errUnsupportedType(file.name));
        return null;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setLocalError(t.sources.errFileTooLarge(file.name));
        return null;
      }
    }

    return incoming;
  }

  async function processFiles(files: File[]) {
    const valid = validateClientFiles(files);
    if (!valid) return;

    setIsUploading(true);
    try {
      await onUploadFiles(valid);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (isAtFileCap || isUploading) return;
    const dropped = Array.from(e.dataTransfer.files);
    void processFiles(dropped);
  }

  async function handleCheckboxToggle(doc: SourceDocumentItem) {
    setLocalError(null);
    if (
      !doc.isSelected &&
      summary.activeTokens + doc.tokenCount > MAX_ACTIVE_CONTEXT_TOKENS
    ) {
      setLocalError(t.sources.errTokenCeiling(doc.filename));
      return;
    }

    setPendingToggleId(doc.id);
    try {
      await onToggleSelect(doc.id, !doc.isSelected);
    } finally {
      setPendingToggleId(null);
    }
  }

  function handleConfirmDelete(docId: string) {
    setConfirmDeleteId(null);
    void onDeleteDoc(docId);
  }

  const activeAlert = localError || toastError;

  return (
    <aside className="relative flex flex-col h-full glass-panel border-s border-white/75 shadow-[-10px_0_32px_-16px_rgba(15,23,42,0.12)] w-full lg:w-[350px] xl:w-[385px] shrink-0 overflow-hidden">
      {/* Subtle indeterminate sync bar when deleting in the background */}
      {isSyncingDelete && (
        <div className="absolute inset-x-0 top-0 h-[2.5px] bg-teal-100 overflow-hidden z-30">
          <div className="h-full w-2/5 rounded-full bg-teal-600 animate-indeterminate-bar" />
        </div>
      )}

      {/* Header — Shows only Sources title and uploaded / allowed count (no tokens!) */}
      <div
        dir={isHe ? "rtl" : "ltr"}
        className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0"
      >
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            {t.sources.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 font-mono" dir="ltr">
            {summary.count} / {MAX_FILES_PER_USER}
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title={t.sources.closePanel}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-800 hover:bg-white/80 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Inline Alerts (Rose for Error, Amber for Warning) */}
      {activeAlert && (
        <div
          dir={isHe ? "rtl" : "ltr"}
          className="animate-toast-in mx-5 mb-3 rounded-xl bg-rose-50/90 backdrop-blur-md border border-rose-200 border-s-4 border-s-rose-500 px-3 py-2.5 text-xs text-rose-900 flex items-start gap-2 shrink-0"
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-rose-600" />
          <span className="flex-1 leading-snug">{activeAlert}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              onDismissToast();
            }}
            className="text-rose-500 hover:text-rose-800 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {toastWarning && !activeAlert && (
        <div
          dir={isHe ? "rtl" : "ltr"}
          className="animate-toast-in mx-5 mb-3 rounded-xl bg-amber-50/90 backdrop-blur-md border border-amber-200 border-s-4 border-s-amber-500 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2 shrink-0"
        >
          <span className="flex-1 leading-snug">{toastWarning}</span>
          <button
            type="button"
            onClick={onDismissToast}
            className="text-amber-600 hover:text-amber-900 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Glassy Upload Dropzone (no storage cap bar below) */}
      <div className="px-5 pb-4 shrink-0">
        <input
          ref={fileInputRef}
          id="source-file-input"
          type="file"
          multiple
          accept=".pdf,.txt,.md,.csv,.docx"
          disabled={isAtFileCap || isUploading}
          onChange={(e) => {
            const list = e.target.files ? Array.from(e.target.files) : [];
            void processFiles(list);
          }}
          className="hidden"
        />

        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!isAtFileCap && !isUploading) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border border-dashed px-4 py-3.5 transition-all duration-200 ${
            isAtFileCap
              ? "border-slate-300 bg-white/40"
              : isDragging
                ? "border-teal-600 bg-teal-50/90 scale-[1.01] shadow-sm"
                : "border-teal-400/70 hover:border-teal-600 bg-white/60 hover:bg-white/85"
          }`}
        >
          {isAtFileCap ? (
            <div dir={isHe ? "rtl" : "ltr"}>
              <p className="text-xs font-medium text-slate-800">
                {t.sources.maxReachedTitle}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t.sources.maxReachedDesc}
              </p>
            </div>
          ) : (
            <button
              id="add-sources-btn"
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              dir={isHe ? "rtl" : "ltr"}
              className="w-full flex items-center justify-between gap-3 text-start cursor-pointer disabled:cursor-wait"
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-teal-800">
                  {isUploading ? t.sources.extracting : t.sources.addSources}
                </span>
                <span className="block text-[11px] text-slate-500 truncate mt-0.5">
                  {t.sources.formatsHint}
                </span>
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-[0_4px_12px_-2px_rgba(13,148,136,0.45)] shrink-0">
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Sources List (no per-file token counts) */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 border-t border-slate-200/70">
        {isLoading ? (
          <div className="divide-y divide-slate-200/60">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="py-3.5">
                <div className="h-3 w-2/3 rounded bg-slate-200/80 animate-pulse" />
                <div className="mt-2 h-2.5 w-1/3 rounded bg-slate-200/50 animate-pulse" />
              </div>
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div dir={isHe ? "rtl" : "ltr"} className="py-10">
            <p className="text-sm font-medium text-slate-800">
              {t.sources.emptyTitle}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {t.sources.emptyDesc}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/60">
            {documents.map((doc) => {
              const ext = getFileTypeBadge(doc.filename).label;
              const isHighlighted = highlightedDocId === doc.id;
              const isConfirming = confirmDeleteId === doc.id;
              const isBusy = pendingToggleId === doc.id;

              return (
                <div
                  key={doc.id}
                  id={`source-card-${doc.id}`}
                  className={`group -mx-2 px-2.5 py-3 rounded-xl flex items-start gap-3 transition-all duration-150 ${
                    isHighlighted
                      ? "bg-teal-50/90 ring-1 ring-teal-400 source-highlight-pulse"
                      : "hover:bg-white/80"
                  } ${doc.isSelected ? "" : "opacity-55 hover:opacity-100"}`}
                >
                  {/* Emerald active checkbox */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={doc.isSelected}
                    aria-label={t.sources.includeAria(doc.filename)}
                    disabled={isBusy}
                    onClick={() => void handleCheckboxToggle(doc)}
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center cursor-pointer ${
                      doc.isSelected
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-xs"
                        : "bg-white/90 border-slate-300 text-transparent hover:border-emerald-500"
                    }`}
                  >
                    {pendingToggleId === doc.id ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                    ) : (
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    )}
                  </button>

                  {/* File info — clean ext & file size only (no tokens) */}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenPreview(doc.id, doc.previewSnippet)}
                      title={doc.filename}
                      className="block w-full text-start text-sm font-medium text-slate-900 truncate hover:text-teal-700 cursor-pointer"
                    >
                      {doc.filename}
                    </button>
                    <p
                      className="mt-0.5 text-[11px] font-mono text-slate-400"
                      dir="ltr"
                    >
                      <span className="font-semibold text-slate-500">{ext}</span>{" "}
                      · {formatFileSize(doc.sizeBytes)}
                    </p>
                  </div>

                  {/* Row actions — semantic hover colors */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleConfirmDelete(doc.id)}
                          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 cursor-pointer"
                        >
                          {t.sources.deleteBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-lg px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                        >
                          {t.sources.cancelBtn}
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPreview(doc.id, doc.previewSnippet)
                          }
                          title={t.sources.previewTitle}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          title={t.sources.deleteTitle}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Snippet & Verify-Claim Preview Drawer */}
      {previewDoc && (
        <div className="animate-slide-up-drawer absolute inset-x-0 bottom-0 z-20 max-h-[68%] flex flex-col bg-white/88 backdrop-blur-2xl border-t border-white/80 shadow-[0_-14px_38px_-10px_rgba(15,23,42,0.16)]">
          <div className="flex items-center justify-between gap-2 bg-white/60 px-5 py-3 border-b border-slate-200/70">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6b73]">
                  {t.sources.verifiedPreviewLabel}
                </p>
                {previewDoc.confidence && (
                  <span
                    className="font-mono text-[10px] text-[#253237]"
                  >
                    ·{" "}
                    {previewDoc.confidence === "verbatim"
                      ? isHe
                        ? `התאמה מדויקת (${previewDoc.matchScore ?? 95}%)`
                        : `Verbatim Match (${previewDoc.matchScore ?? 95}%)`
                      : previewDoc.confidence === "high"
                        ? isHe
                          ? `ביסוס גבוה (${previewDoc.matchScore ?? 82}%)`
                          : `High Grounding (${previewDoc.matchScore ?? 82}%)`
                        : isHe
                          ? `סינתזה מבוססת (${previewDoc.matchScore ?? 72}%)`
                          : `Synthesized (${previewDoc.matchScore ?? 72}%)`}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-[#253237] truncate mt-0.5">
                {previewDoc.filename}
              </p>
            </div>
            <button
              type="button"
              onClick={onClosePreview}
              className="rounded-md p-1 text-[#253237] hover:bg-white/60 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {previewDoc.claimText && (
            <div
              dir="auto"
              className="px-5 py-2.5 border-b border-[#253237]/8 text-xs text-[#253237]"
            >
              <span className="font-bold text-[#5c6b73]">
                {isHe ? "טענה מאומתת:" : "Verified Claim:"}{" "}
              </span>
              <span>{previewDoc.claimText}</span>
            </div>
          )}

          <div
            dir="auto"
            className="px-5 py-4 overflow-y-auto text-xs leading-relaxed text-[#253237]/90 font-mono whitespace-pre-wrap bg-[#f8fafb]"
          >
            {previewDoc.loading ? (
              <div className="flex items-center gap-2 py-4 text-[#5c6b73]">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t.sources.loadingPreview}</span>
              </div>
            ) : (
              (() => {
                const full = previewDoc.excerpt || "";
                const quote = (previewDoc.matchedQuote ?? "").trim();
                if (!quote) return full;

                const lowerFull = full.toLowerCase();
                const lowerQuote = quote.toLowerCase();
                let idx = lowerFull.indexOf(lowerQuote);
                let matchLen = quote.length;

                // Fallback to matching the first 45 characters of the quote if whitespace/wrapping differs
                if (idx === -1 && quote.length > 36) {
                  const prefix = lowerQuote.slice(0, 42);
                  idx = lowerFull.indexOf(prefix);
                  matchLen = Math.min(quote.length, full.length - idx);
                }

                if (idx === -1) {
                  return (
                    <div className="space-y-2.5">
                      <mark
                        ref={highlightMarkRef}
                        className="block rounded bg-[#e0fbfc] text-[#253237] px-2.5 py-1.5 border-s-2 border-[#253237] font-semibold"
                      >
                        {quote}
                      </mark>
                      <div>{full}</div>
                    </div>
                  );
                }

                const before = full.slice(0, idx);
                const highlighted = full.slice(idx, idx + matchLen);
                const after = full.slice(idx + matchLen);

                return (
                  <>
                    {before}
                    <mark
                      ref={highlightMarkRef}
                      className="rounded-sm bg-[#e0fbfc] text-[#253237] px-1 py-0.5 font-semibold"
                    >
                      {highlighted}
                    </mark>
                    {after}
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
