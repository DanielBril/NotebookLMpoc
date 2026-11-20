"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  FileSpreadsheet,
  FileText,
  FileType2,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
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

function getFileTypeBadge(filename: string): {
  label: string;
  bg: string;
  text: string;
  icon: "pdf" | "text" | "sheet";
} {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    return { label: "PDF", bg: "#253237", text: "#e0fbfc", icon: "pdf" };
  }
  if (lower.endsWith(".md")) {
    return { label: "MD", bg: "#c2dfe3", text: "#253237", icon: "text" };
  }
  if (lower.endsWith(".txt")) {
    return { label: "TXT", bg: "#e0fbfc", text: "#253237", icon: "text" };
  }
  if (lower.endsWith(".csv")) {
    return { label: "CSV", bg: "#9db4c0", text: "#253237", icon: "sheet" };
  }
  return { label: "DOCX", bg: "#5c6b73", text: "#e0fbfc", icon: "text" };
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
    <aside className="relative flex flex-col h-full bg-white border-s border-[#9db4c0]/40 w-full lg:w-[360px] xl:w-[400px] shrink-0 overflow-hidden">
      {/* Light-Blue Header Bar */}
      <div className="bg-[#c2dfe3] px-4 py-3 flex items-center justify-between border-b border-[#9db4c0]/50 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-[#253237]">
            {t.sources.title}
          </h2>
          <span
            dir="ltr"
            className="rounded-full bg-[#e0fbfc] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#253237] border border-[#9db4c0]/60"
          >
            {summary.count} / {MAX_FILES_PER_USER}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-[#253237]/80">
            {t.sources.activeTok(formatTokensCompact(summary.activeTokens))}
          </span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              title={t.sources.closePanel}
              className="rounded-md p-1 text-[#253237]/70 hover:text-[#253237] hover:bg-white/50 transition-colors cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Toast Alerts */}
      {activeAlert && (
        <div className="animate-toast-in mx-3.5 mt-3 rounded-xl bg-[#253237] px-3 py-2.5 text-xs font-medium text-[#e0fbfc] border border-[#5c6b73] flex items-start gap-2 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#c2dfe3]" />
          <span className="flex-1 leading-snug">{activeAlert}</span>
          <button
            type="button"
            onClick={() => {
              setLocalError(null);
              onDismissToast();
            }}
            className="text-[#c2dfe3] hover:text-[#e0fbfc] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {toastWarning && !activeAlert && (
        <div className="animate-toast-in mx-3.5 mt-3 rounded-xl bg-[#e0fbfc] px-3 py-2.5 text-xs font-medium text-[#253237] border border-[#5c6b73]/45 flex items-start gap-2 shrink-0">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-[#5c6b73]" />
          <span className="flex-1 leading-snug">{toastWarning}</span>
          <button
            type="button"
            onClick={onDismissToast}
            className="text-[#5c6b73] hover:text-[#253237] cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Upload Dropzone */}
      <div className="p-3.5 border-b border-[#9db4c0]/30 shrink-0">
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
          className={`rounded-xl border-[1.5px] border-dashed px-3.5 py-4 text-center transition-all duration-200 ${
            isAtFileCap
              ? "border-[#9db4c0]/50 bg-[#f2fafb] opacity-85"
              : isDragging
                ? "border-[#253237] bg-[#e0fbfc] scale-[1.015] shadow-md"
                : "border-[#5c6b73]/55 bg-[#e0fbfc]/40 hover:bg-[#e0fbfc]/75 hover:border-[#253237]/70"
          }`}
        >
          {isAtFileCap ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[#253237]">
                {t.sources.maxReachedTitle}
              </p>
              <p className="text-[11px] text-[#5c6b73]">
                {t.sources.maxReachedDesc}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-[#253237] border border-[#9db4c0]/55 shadow-xs">
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#253237]">
                  {isUploading ? t.sources.extracting : t.sources.dropOrBrowse}
                </p>
                <p className="text-[11px] text-[#5c6b73] mt-0.5">
                  {t.sources.formatsHint}
                </p>
              </div>
              <button
                id="add-sources-btn"
                type="button"
                disabled={isAtFileCap || isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="btn-jet mt-0.5 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>{t.sources.addSources}</span>
              </button>
            </div>
          )}
        </div>

        {/* Storage & Active Context Summary Bar */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#5c6b73] font-mono">
          <span>{t.sources.storageLabel(formatFileSize(summary.totalSizeBytes))}</span>
          <span>{storagePercent}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full rounded-full bg-[#c2dfe3]/45 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${Math.max(summary.totalSizeBytes > 0 ? 3 : 0, storagePercent)}%`,
              backgroundColor: storagePercent > 85 ? "#253237" : "#5c6b73",
            }}
          />
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="h-16 rounded-xl bg-[#e0fbfc]/45 border border-[#9db4c0]/35 animate-pulse"
              />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 animate-fade-in">
            <div className="h-10 w-10 rounded-xl bg-[#c2dfe3]/60 flex items-center justify-center text-[#253237] mb-3">
              <FileText className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-[#253237]">
              {t.sources.emptyTitle}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#5c6b73]">
              {t.sources.emptyDesc}
            </p>
          </div>
        ) : (
          documents.map((doc) => {
            const badge = getFileTypeBadge(doc.filename);
            const isHighlighted = highlightedDocId === doc.id;
            const isConfirming = confirmDeleteId === doc.id;
            const isBusy = pendingToggleId === doc.id || deletingId === doc.id;

            return (
              <div
                key={doc.id}
                id={`source-card-${doc.id}`}
                className={`interactive-card group rounded-xl border p-3 ${
                  isHighlighted
                    ? "border-[#253237] bg-[#e0fbfc] source-highlight-pulse"
                    : doc.isSelected
                      ? "border-[#9db4c0]/60 bg-white hover:border-[#5c6b73] shadow-[0_1px_4px_rgba(37,50,55,0.04)]"
                      : "border-[#9db4c0]/30 bg-[#f2fafb] opacity-75 hover:opacity-100"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {/* Include in Context Checkbox */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={doc.isSelected}
                    aria-label={t.sources.includeAria(doc.filename)}
                    disabled={isBusy}
                    onClick={() => void handleCheckboxToggle(doc)}
                    className={`mt-0.5 h-4.5 w-4.5 shrink-0 rounded-md border flex items-center justify-center transition-all duration-150 active:scale-90 cursor-pointer ${
                      doc.isSelected
                        ? "bg-[#253237] border-[#253237] text-[#e0fbfc]"
                        : "bg-white border-[#9db4c0] text-transparent hover:border-[#253237]"
                    }`}
                  >
                    {pendingToggleId === doc.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-[#c2dfe3]" />
                    ) : (
                      <Check className="h-3 w-3 stroke-[3]" />
                    )}
                  </button>

                  {/* File info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide shrink-0"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {badge.icon === "sheet" ? (
                          <FileSpreadsheet className="h-2.5 w-2.5" />
                        ) : badge.icon === "pdf" ? (
                          <FileType2 className="h-2.5 w-2.5" />
                        ) : (
                          <FileText className="h-2.5 w-2.5" />
                        )}
                        {badge.label}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          onOpenPreview(doc.id, doc.previewSnippet)
                        }
                        title={doc.filename}
                        className="text-start text-xs font-semibold text-[#253237] truncate hover:underline cursor-pointer"
                      >
                        {doc.filename}
                      </button>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2 text-[11px] font-mono text-[#5c6b73]">
                      <span className="rounded bg-[#f2fafb] px-1.5 py-0.5 border border-[#9db4c0]/40 text-[#253237]">
                        {formatTokensCompact(doc.tokenCount)} {t.sources.tokUnit}
                      </span>
                      <span dir="ltr">{formatFileSize(doc.sizeBytes)}</span>
                    </div>
                  </div>

                  {/* Quick actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {isConfirming ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deletingId === doc.id}
                          onClick={() => void handleConfirmDelete(doc.id)}
                          className="rounded-md bg-[#253237] px-2 py-1 text-[10px] font-semibold text-[#e0fbfc] hover:bg-[#1a2428] cursor-pointer"
                        >
                          {deletingId === doc.id ? "…" : t.sources.deleteBtn}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="rounded-md bg-[#f2fafb] px-1.5 py-1 text-[10px] font-medium text-[#253237] border border-[#9db4c0]/50 cursor-pointer"
                        >
                          {t.sources.cancelBtn}
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            onOpenPreview(doc.id, doc.previewSnippet)
                          }
                          title={t.sources.previewTitle}
                          className="rounded-md p-1 text-[#5c6b73] hover:text-[#253237] hover:bg-[#c2dfe3]/50 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(doc.id)}
                          title={t.sources.deleteTitle}
                          className="rounded-md p-1 text-[#5c6b73] hover:text-[#253237] hover:bg-[#e0fbfc] transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Snippet & Verify-Claim Preview Drawer */}
      {previewDoc && (
        <div className="animate-slide-up-drawer absolute inset-x-0 bottom-0 z-20 max-h-[68%] flex flex-col bg-white border-t-2 border-[#253237] shadow-[0_-14px_34px_rgba(37,50,55,0.2)]">
          <div className="flex items-center justify-between gap-2 bg-[#c2dfe3] px-3.5 py-2.5 border-b border-[#9db4c0]/50">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#5c6b73]">
                  {t.sources.verifiedPreviewLabel}
                </p>
                {previewDoc.confidence && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      previewDoc.confidence === "verbatim"
                        ? "bg-[#253237] text-[#e0fbfc]"
                        : "bg-[#e0fbfc] text-[#253237] border border-[#5c6b73]/40"
                    }`}
                  >
                    <CheckCircle2 className="h-2.5 w-2.5" />
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
              className="px-3.5 py-2 bg-[#e0fbfc]/65 border-b border-[#9db4c0]/45 text-[11px] text-[#253237]"
            >
              <span className="font-bold text-[#5c6b73]">
                {isHe ? "טענה מאומתת:" : "Verified Claim:"}{" "}
              </span>
              <span>{previewDoc.claimText}</span>
            </div>
          )}

          <div
            dir="auto"
            className="p-3.5 overflow-y-auto text-xs leading-relaxed text-[#253237]/90 font-mono whitespace-pre-wrap bg-[#f2fafb]"
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
                        className="block rounded-lg bg-[#e0fbfc] text-[#253237] px-2.5 py-1.5 border-s-4 border-[#253237] font-semibold shadow-xs"
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
                      className="rounded-md bg-[#e0fbfc] text-[#253237] px-1.5 py-0.5 border-b-2 border-[#253237] font-semibold shadow-xs"
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
