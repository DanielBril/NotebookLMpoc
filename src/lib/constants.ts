export const MAX_FILES_PER_USER = 10;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_STORAGE_BYTES = 50 * 1024 * 1024; // 50 MB cumulative per user
export const MAX_ACTIVE_CONTEXT_TOKENS = 150_000;

export const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".docx"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];
