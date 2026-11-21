export const MAX_FILES_PER_USER = 100;
export const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB per file
export const MAX_TOTAL_STORAGE_BYTES = 30 * 1024 * 1024 * 100; // Effectively uncapped (100 files x 30 MB)
export const MAX_ACTIVE_CONTEXT_TOKENS = 150_000;

export const ALLOWED_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".docx"] as const;
export type AllowedExtension = (typeof ALLOWED_EXTENSIONS)[number];
