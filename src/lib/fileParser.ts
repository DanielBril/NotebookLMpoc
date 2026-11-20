import mammoth from "mammoth";
import { ensurePdfDomPolyfills } from "@/lib/domMatrixPolyfill";
import { sysLogger } from "@/lib/logger";
import {
  ALLOWED_EXTENSIONS,
  MAX_ACTIVE_CONTEXT_TOKENS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_USER,
  MAX_TOTAL_STORAGE_BYTES,
  type AllowedExtension,
} from "@/lib/constants";

export {
  ALLOWED_EXTENSIONS,
  MAX_ACTIVE_CONTEXT_TOKENS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_USER,
  MAX_TOTAL_STORAGE_BYTES,
  type AllowedExtension,
};

export const ALLOWED_MIME_TYPES: Record<AllowedExtension, string[]> = {
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain", "application/octet-stream", ""],
  ".md": ["text/markdown", "text/x-markdown", "text/plain", "application/octet-stream", ""],
  ".csv": ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", ""],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
    "",
  ],
};

export interface ParsedDocumentResult {
  extractedText: string;
  tokenCount: number;
  normalizedMimeType: string;
  extension: AllowedExtension;
}

export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx === -1) return "";
  return filename.slice(idx).toLowerCase();
}

export function validateFileType(
  filename: string,
  mimeType: string
): { valid: true; extension: AllowedExtension; normalizedMimeType: string } | { valid: false; error: string } {
  const ext = getFileExtension(filename) as AllowedExtension;
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `Unsupported file type "${ext || "unknown"}". Allowed formats: PDF, TXT, MD, CSV, DOCX.`,
    };
  }

  const normalizedIncoming = (mimeType || "").toLowerCase().trim();
  const allowedMimes = ALLOWED_MIME_TYPES[ext];
  if (normalizedIncoming && !allowedMimes.includes(normalizedIncoming)) {
    return {
      valid: false,
      error: `Invalid MIME type "${mimeType}" for ${ext.toUpperCase()} file.`,
    };
  }

  const canonicalMimeMap: Record<AllowedExtension, string> = {
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".csv": "text/csv",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };

  return {
    valid: true,
    extension: ext,
    normalizedMimeType: canonicalMimeMap[ext],
  };
}

export function estimateTokenCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

function cleanExtractedText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function assertNotBinaryUtf8(buffer: Buffer): void {
  const sampleLen = Math.min(buffer.length, 4096);
  for (let i = 0; i < sampleLen; i++) {
    if (buffer[i] === 0) {
      throw new Error("Binary content detected in a plain-text file. Upload rejected.");
    }
  }
}

export async function parseDocumentBuffer(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ParsedDocumentResult> {
  if (buffer.length === 0) {
    throw new Error("File is empty.");
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new Error("File exceeds the 10 MB maximum file size limit.");
  }

  const validation = validateFileType(filename, mimeType);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  let extractedText = "";

  try {
    switch (validation.extension) {
      case ".pdf": {
        // Ensure DOMMatrix, ImageData & Path2D globals exist before loading pdfjs-dist
        ensurePdfDomPolyfills();
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(buffer) });
        try {
          const result = await parser.getText();
          extractedText = cleanExtractedText(result.text || "");
        } finally {
          await parser.destroy().catch(() => {});
        }
        break;
      }
      case ".docx": {
        const result = await mammoth.extractRawText({ buffer });
        extractedText = cleanExtractedText(result.value || "");
        break;
      }
      case ".txt":
      case ".md":
      case ".csv": {
        assertNotBinaryUtf8(buffer);
        extractedText = cleanExtractedText(buffer.toString("utf-8"));
        break;
      }
    }
  } catch (err) {
    await sysLogger.error(
      `fileParser.${validation.extension.slice(1)}`,
      `Failed to parse document "${filename}"`,
      {
        error: err,
        meta: {
          filename,
          extension: validation.extension,
          sizeBytes: buffer.length,
          domMatrixDefined: typeof globalThis.DOMMatrix !== "undefined",
        },
      }
    );
    throw err;
  }

  if (!extractedText) {
    const emptyErr = new Error(
      `No readable text could be extracted from "${filename}". Scanned image-only PDFs are not supported.`
    );
    await sysLogger.warn("fileParser.empty", emptyErr.message, {
      meta: { filename, extension: validation.extension, sizeBytes: buffer.length },
    });
    throw emptyErr;
  }

  const tokenCount = estimateTokenCount(extractedText);

  return {
    extractedText,
    tokenCount,
    normalizedMimeType: validation.normalizedMimeType,
    extension: validation.extension,
  };
}
