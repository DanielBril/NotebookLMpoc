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
  MAX_TOTAL_STORAGE_BYTES,
} from "@/lib/constants";
import { formatTokensCompact } from "@/lib/pricing";
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
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
  const storagePercent = Math.min(
    100,
    Math.round((summary.totalSizeBytes / MAX_TOTAL_STORAGE_BYTES) * 100)
  );

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

    let projectedBytes = summary.totalSizeBytes;
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
      projectedBytes += file.size;
      if (projectedBytes > MAX_TOTAL_STORAGE_BYTES) {
        setLocalError(t.sources.errTotalStorage(file.name));
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

  async function handleConfirmDelete(docId: string) {
    setDeletingId(docId);
    try {
      await onDeleteDoc(docId);
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  const activeAlert = localError || toastError;

  return (
    <aside className="relative flex flex-col h-full bg-slate-50 border-s border-slate-200 w-full lg:w-[340px] xl:w-[380px] shrink-0 overflow-hidden">
      {/* Header */}
      <div
        dir={isHe ? "rtl" : "ltr"}
        className="px-5 pt-5 pb-4 flex items-start justify-between shrink-0"
      >
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            {t.sources.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 font-mono" dir="ltr">
            {summary.count}/{MAX_FILES_PER_USER} ·{" "}
            {t.sources.activeTok(formatTokensCompact(summary.activeTokens))}
          </p>
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title={t.sources.closePanel}
            className="rounded-md p-1 text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Inline Alerts (Rose for Error, Amber for Warning) */}
      {activeAlert && (
        <div
          dir={isHe ? "rtl" : "ltr"}
          className="mx-5 mb-3 rounded-lg bg-rose-50 border border-rose-200 border-s-4 border-s-rose-500 px-3 py-2.5 text-xs text-rose-900 flex items-start gap-2 shrink-0"
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
          className="mx-5 mb-3 rounded-lg bg-amber-50 border border-amber-200 border-s-4 border-s-amber-500 px-3 py-2.5 text-xs text-amber-900 flex items-start gap-2 shrink-0"
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

      {/* Upload Dropzone — Teal interactive affordance */}
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
          className={`rounded-lg border border-dashed px-4 py-3 transition-colors ${
            isAtFileCap
              ? "border-slate-300 bg-slate-100/60"
              : isDragging
                ? "border-teal-600 bg-teal-50"
                : "border-teal-400/70 hover:border-teal-600 bg-teal-50/40 hover:bg-teal-50/80"
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
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-teal-600 text-white shrink-0">
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </span>
            </button>
          )}
        </div>

        {/* Storage meter */}
        <div className="mt-3 flex items-center gap-2.5 text-[11px] text-slate-400 font-mono">
          <div className="h-1 flex-1 rounded-full bg-slate-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                storagePercent > 85 ? "bg-amber-500" : "bg-teal-600"
              }`}
              style={{
                width: `${Math.max(summary.totalSizeBytes > 0 ? 3 : 0, storagePercent)}%`,
              }}
            />
          </div>
          <span dir="ltr">
            {t.sources.storageLabel(formatFileSize(summary.totalSizeBytes))}
          </span>
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto px-5 pb-4 border-t border-slate-200">
        {isLoading ? (
          <div className="divide-y divide-slate-200/70">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="py-3.5">
                <div className="h-3 w-2/3 rounded bg-slate-200 animate-pulse" />
                <div className="mt-2 h-2.5 w-1/3 rounded bg-slate-200/60 animate-pulse" />
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
          <div className="divide-y divide-slate-200/70">
            {documents.map((doc) => {
              const ext = getFileTypeBadge(doc.filename).label;
              const isHighlighted = highlightedDocId === doc.id;
              const isConfirming = confirmDeleteId === doc.id;
              const isBusy = pendingToggleId === doc.id || deletingId === doc.id;

              return (
                <div
                  key={doc.id}
                  id={`source-card-${doc.id}`}
                  className={`group -mx-2 px-2 py-3 rounded-md flex items-start gap-3 transition-colors ${
                    isHighlighted
                      ? "bg-teal-50 ring-1 ring-teal-400 source-highlight-pulse"
                      : "hover:bg-white"
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
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center transition-colors cursor-pointer ${
                      doc.isSelected
                        ? "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-white border-slate-300 text-transparent hover:border-emerald-500"
                    }`}
                  >
                    {pendingToggleId === doc.id ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-white" />
                    ) : (
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    )}
                  </button>

                  {/* File info */}
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => onOpenPreview(doc.id, doc.previewSnippet)}
                      title={doc.filename}
                      className="block w-full text-start text-sm font-medium text-slate-900 truncate hover:text-teal-700 hover:underline underline-offset-2 cursor-pointer"
                    >
                      {doc.filename}
                    </button>
                    <p
                      className="mt-0.5 text-[11px] font-mono text-slate-400"
                      dir="ltr"
                    >
                      <span className="font-semibold text-slate-500">{ext}</span>{" "}
                      · {formatTokensCompact(doc.tokenCount)}{" "}
                      {t.sources.tokUnit} · {formatFileSize(doc.sizeBytes)}
                    </p>
                  </div>

                  {/* Row actions — semantic hover colors */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingId === doc.id}
                          onClick={() => void handleConfirmDelete(doc.id)}
                          className="rounded px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          {deletingId === doc.id ? "…" : t.sources.deleteBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
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
                          className="rounded p-1 text-slate-400 hover:text-teal-700 hover:bg-teal-50 cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          title={t.sources.deleteTitle}
                          className="rounded p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
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
        <div className="animate-slide-up-drawer absolute inset-x-0 bottom-0 z-20 max-h-[68%] flex flex-col bg-white border-t border-[#253237]/12 shadow-[0_-8px_24px_rgba(37,50,55,0.08)]">
          <div className="flex items-center justify-between gap-2 bg-white px-5 py-3 border-b border-[#253237]/8">
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
