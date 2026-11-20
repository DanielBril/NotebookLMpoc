import { LogLevel } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface SystemLogInput {
  level: LogLevel;
  source: string;
  message: string;
  error?: unknown;
  meta?: Record<string, unknown>;
  userId?: string | null;
  username?: string | null;
}

function extractErrorDetails(err: unknown): {
  errorMessage: string;
  stack: string | null;
} {
  if (err instanceof Error) {
    return {
      errorMessage: err.message,
      stack: err.stack ?? null,
    };
  }
  if (typeof err === "string") {
    return { errorMessage: err, stack: null };
  }
  if (err && typeof err === "object") {
    try {
      return { errorMessage: JSON.stringify(err), stack: null };
    } catch {
      return { errorMessage: String(err), stack: null };
    }
  }
  return { errorMessage: "", stack: null };
}

let schemaBootstrapPromise: Promise<void> | null = null;

/**
 * Ensures the `DEVELOPER` value on the `Role` enum, the `LogLevel` enum,
 * and the `SystemLog` table exist in PostgreSQL even if `prisma db push`
 * has not been manually re-run after deploying to Vercel.
 */
export async function ensureDeveloperSchemaBootstrapped(): Promise<void> {
  if (schemaBootstrapPromise) {
    return schemaBootstrapPromise;
  }

  schemaBootstrapPromise = (async () => {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DEVELOPER';`
      );
    } catch {
      // Ignore if Role enum already contains DEVELOPER
    }

    try {
      await prisma.$executeRawUnsafe(`
        DO $$ BEGIN
          CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
    } catch {
      // Ignore if LogLevel already exists
    }

    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "SystemLog" (
          "id" TEXT NOT NULL,
          "level" "LogLevel" NOT NULL DEFAULT 'INFO',
          "source" TEXT NOT NULL,
          "message" TEXT NOT NULL,
          "stack" TEXT,
          "meta" JSONB,
          "userId" TEXT,
          "username" TEXT,
          "resolved" BOOLEAN NOT NULL DEFAULT false,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
        );
      `);
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "SystemLog_level_idx" ON "SystemLog"("level");`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "SystemLog_source_idx" ON "SystemLog"("source");`
      );
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "SystemLog_createdAt_idx" ON "SystemLog"("createdAt");`
      );
    } catch {
      // Ignore if table/indexes already exist
    }
  })();

  return schemaBootstrapPromise;
}

/**
 * Structured system & error logger that writes to both stdout/stderr and the
 * `SystemLog` PostgreSQL table for the Developer Diagnostics Portal.
 * Never throws so application flows remain resilient even if DB logging fails.
 */
export async function writeSystemLog(input: SystemLogInput): Promise<void> {
  const { errorMessage, stack } = extractErrorDetails(input.error);
  const fullMessage =
    errorMessage && !input.message.includes(errorMessage)
      ? `${input.message} — ${errorMessage}`
      : input.message;

  const prefix = `[ContextLM:${input.level}:${input.source}]`;
  if (input.level === LogLevel.ERROR || input.level === LogLevel.CRITICAL) {
    console.error(prefix, fullMessage, input.meta ?? "", stack ?? "");
  } else if (input.level === LogLevel.WARN) {
    console.warn(prefix, fullMessage, input.meta ?? "");
  } else {
    console.log(prefix, fullMessage);
  }

  try {
    await ensureDeveloperSchemaBootstrapped();
    await prisma.systemLog.create({
      data: {
        level: input.level,
        source: input.source.slice(0, 120),
        message: fullMessage.slice(0, 4000),
        stack: stack ? stack.slice(0, 8000) : null,
        meta: input.meta ? (input.meta as object) : undefined,
        userId: input.userId ?? null,
        username: input.username ?? null,
      },
    });
  } catch (dbErr) {
    console.error("[ContextLM:LoggerFallback] Could not persist SystemLog:", dbErr);
  }
}

export const sysLogger = {
  info(
    source: string,
    message: string,
    opts?: {
      meta?: Record<string, unknown>;
      userId?: string | null;
      username?: string | null;
    }
  ) {
    return writeSystemLog({
      level: LogLevel.INFO,
      source,
      message,
      meta: opts?.meta,
      userId: opts?.userId,
      username: opts?.username,
    });
  },
  warn(
    source: string,
    message: string,
    opts?: {
      error?: unknown;
      meta?: Record<string, unknown>;
      userId?: string | null;
      username?: string | null;
    }
  ) {
    return writeSystemLog({
      level: LogLevel.WARN,
      source,
      message,
      error: opts?.error,
      meta: opts?.meta,
      userId: opts?.userId,
      username: opts?.username,
    });
  },
  error(
    source: string,
    message: string,
    opts?: {
      error?: unknown;
      meta?: Record<string, unknown>;
      userId?: string | null;
      username?: string | null;
    }
  ) {
    return writeSystemLog({
      level: LogLevel.ERROR,
      source,
      message,
      error: opts?.error,
      meta: opts?.meta,
      userId: opts?.userId,
      username: opts?.username,
    });
  },
  critical(
    source: string,
    message: string,
    opts?: {
      error?: unknown;
      meta?: Record<string, unknown>;
      userId?: string | null;
      username?: string | null;
    }
  ) {
    return writeSystemLog({
      level: LogLevel.CRITICAL,
      source,
      message,
      error: opts?.error,
      meta: opts?.meta,
      userId: opts?.userId,
      username: opts?.username,
    });
  },
};
