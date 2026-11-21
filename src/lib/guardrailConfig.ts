import { prisma } from "@/lib/prisma";
import {
  DEFAULT_GUARDRAIL_CONFIG,
  type GroundingStrictnessMode,
  type GuardrailConfig,
} from "@/lib/guardrailConfigTypes";

export {
  DEFAULT_GUARDRAIL_CONFIG,
  type GroundingStrictnessMode,
  type GuardrailConfig,
};

const SETTING_KEY_GUARDRAILS = "guardrail_config";
const CACHE_TTL_MS = 5000;

let bootstrapPromise: Promise<void> | null = null;
let cachedConfig: {
  config: GuardrailConfig;
  updatedBy: string | null;
  updatedAt: string | null;
  expiresAt: number;
} | null = null;

async function ensureAppSettingTable(): Promise<void> {
  if (bootstrapPromise) return bootstrapPromise;
  bootstrapPromise = (async () => {
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "AppSetting" (
          "key" TEXT NOT NULL,
          "value" TEXT NOT NULL,
          "updatedBy" TEXT,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
        );
      `);
    } catch {
      // Ignore if table already exists
    }
  })();
  return bootstrapPromise;
}

function sanitizeTerms(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const unique = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const cleaned = item.trim().slice(0, 120);
    if (cleaned.length >= 2) unique.add(cleaned);
    if (unique.size >= 40) break;
  }
  return Array.from(unique);
}

export function sanitizeGuardrailConfig(raw: unknown): GuardrailConfig {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_GUARDRAIL_CONFIG };
  }
  const obj = raw as Record<string, unknown>;
  const mode = obj.strictnessMode;
  const strictnessMode: GroundingStrictnessMode =
    mode === "strict" || mode === "balanced" || mode === "permissive"
      ? mode
      : DEFAULT_GUARDRAIL_CONFIG.strictnessMode;

  return {
    strictnessMode,
    enableLayer1OutOfScope:
      typeof obj.enableLayer1OutOfScope === "boolean"
        ? obj.enableLayer1OutOfScope
        : DEFAULT_GUARDRAIL_CONFIG.enableLayer1OutOfScope,
    enableLayer4MicroClassifier:
      typeof obj.enableLayer4MicroClassifier === "boolean"
        ? obj.enableLayer4MicroClassifier
        : DEFAULT_GUARDRAIL_CONFIG.enableLayer4MicroClassifier,
    enableLayer4OutputCanary:
      typeof obj.enableLayer4OutputCanary === "boolean"
        ? obj.enableLayer4OutputCanary
        : DEFAULT_GUARDRAIL_CONFIG.enableLayer4OutputCanary,
    allowGeneralDocOverviews:
      typeof obj.allowGeneralDocOverviews === "boolean"
        ? obj.allowGeneralDocOverviews
        : DEFAULT_GUARDRAIL_CONFIG.allowGeneralDocOverviews,
    customAllowTerms: sanitizeTerms(obj.customAllowTerms),
    customBlockTerms: sanitizeTerms(obj.customBlockTerms),
    customSystemGuidance:
      typeof obj.customSystemGuidance === "string"
        ? obj.customSystemGuidance.trim().slice(0, 1200)
        : "",
  };
}

export interface GuardrailConfigInfo {
  config: GuardrailConfig;
  updatedBy: string | null;
  updatedAt: string | null;
}

export async function getGuardrailConfigInfo(): Promise<GuardrailConfigInfo> {
  const now = Date.now();
  if (cachedConfig && cachedConfig.expiresAt > now) {
    return {
      config: cachedConfig.config,
      updatedBy: cachedConfig.updatedBy,
      updatedAt: cachedConfig.updatedAt,
    };
  }

  try {
    await ensureAppSettingTable();
    const rows = await prisma.$queryRaw<
      Array<{ value: string; updatedBy: string | null; updatedAt: Date }>
    >`SELECT "value", "updatedBy", "updatedAt" FROM "AppSetting" WHERE "key" = ${SETTING_KEY_GUARDRAILS} LIMIT 1`;

    const row = rows[0];
    let parsed: unknown = null;
    if (row?.value) {
      try {
        parsed = JSON.parse(row.value);
      } catch {
        parsed = null;
      }
    }

    const config = sanitizeGuardrailConfig(parsed);
    const info: GuardrailConfigInfo = {
      config,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
    cachedConfig = { ...info, expiresAt: now + CACHE_TTL_MS };
    return info;
  } catch {
    return {
      config: { ...DEFAULT_GUARDRAIL_CONFIG },
      updatedBy: null,
      updatedAt: null,
    };
  }
}

export async function getGuardrailConfig(): Promise<GuardrailConfig> {
  const info = await getGuardrailConfigInfo();
  return info.config;
}

export async function setGuardrailConfig(
  incoming: unknown,
  updatedBy: string
): Promise<GuardrailConfigInfo> {
  const config = sanitizeGuardrailConfig(incoming);
  await ensureAppSettingTable();
  const now = new Date();
  const serialized = JSON.stringify(config);

  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "updatedBy", "updatedAt")
    VALUES (${SETTING_KEY_GUARDRAILS}, ${serialized}, ${updatedBy}, ${now})
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = EXCLUDED."updatedAt"
  `;

  const info: GuardrailConfigInfo = {
    config,
    updatedBy,
    updatedAt: now.toISOString(),
  };
  cachedConfig = { ...info, expiresAt: Date.now() + CACHE_TTL_MS };
  return info;
}
