import { prisma } from "@/lib/prisma";
import { getModelRate } from "@/lib/pricing";

export interface ModelOption {
  id: string;
  label: string;
  descriptionEn: string;
  descriptionHe: string;
  inputPer1M: number;
  outputPer1M: number;
}

const BASE_MODELS: Array<Omit<ModelOption, "inputPer1M" | "outputPer1M">> = [
  {
    id: "gpt-4o-mini",
    label: "GPT-4o mini",
    descriptionEn: "Fast & economical default for grounded Q&A",
    descriptionHe: "מהיר וחסכוני — ברירת מחדל מומלצת",
  },
  {
    id: "gpt-4.1-nano",
    label: "GPT-4.1 nano",
    descriptionEn: "Ultra-fast, lowest cost per token",
    descriptionHe: "מהיר במיוחד ועלות טוקן הנמוכה ביותר",
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 mini",
    descriptionEn: "Strong instruction-following & long-context grounding",
    descriptionHe: "דיוק גבוה והיצמדות מצוינת למקורות ארוכים",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    descriptionEn: "Top-tier accuracy for dense & multi-document synthesis",
    descriptionHe: "דיוק מרבי לניתוח מסמכים מורכבים ומרובים",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    descriptionEn: "High-accuracy flagship with strong Hebrew & English",
    descriptionHe: "מודל דגל מדויק במיוחד בעברית ובאנגלית",
  },
  {
    id: "gpt-5-nano",
    label: "GPT-5 nano",
    descriptionEn: "Next-gen ultra-fast compact model",
    descriptionHe: "דור חדש — מהיר וחסכוני במיוחד",
  },
  {
    id: "gpt-5-mini",
    label: "GPT-5 mini",
    descriptionEn: "Next-gen reasoning & deep synthesis",
    descriptionHe: "דור חדש — הסקה וסינתזה מעמיקה",
  },
];

export function getAvailableModels(): ModelOption[] {
  const envDefault = (process.env.OPENAI_PRIMARY_MODEL ?? "").trim();
  const list = BASE_MODELS.map((m) => {
    const rate = getModelRate(m.id);
    return {
      ...m,
      inputPer1M: rate.inputPer1M,
      outputPer1M: rate.outputPer1M,
    };
  });

  if (envDefault && !list.some((m) => m.id === envDefault)) {
    const rate = getModelRate(envDefault);
    list.unshift({
      id: envDefault,
      label: `${envDefault} (env)`,
      descriptionEn: "Configured via server environment variable",
      descriptionHe: "מוגדר במשתנה הסביבה של השרת",
      inputPer1M: rate.inputPer1M,
      outputPer1M: rate.outputPer1M,
    });
  }

  return list;
}

/**
 * Reasoning / GPT-5 series models reject custom temperature values other than default.
 */
export function supportsCustomTemperature(modelId: string): boolean {
  const m = modelId.toLowerCase().trim();
  return !(
    m.startsWith("gpt-5") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  );
}

const SETTING_KEY_PRIMARY_MODEL = "primary_model";
const CACHE_TTL_MS = 5000;

let appSettingBootstrapPromise: Promise<void> | null = null;
let cachedPrimaryModel: {
  model: string;
  updatedBy: string | null;
  updatedAt: string | null;
  expiresAt: number;
} | null = null;

async function ensureAppSettingTable(): Promise<void> {
  if (appSettingBootstrapPromise) return appSettingBootstrapPromise;
  appSettingBootstrapPromise = (async () => {
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
  return appSettingBootstrapPromise;
}

export interface ActiveModelInfo {
  model: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

export async function getActivePrimaryModelInfo(): Promise<ActiveModelInfo> {
  const now = Date.now();
  if (cachedPrimaryModel && cachedPrimaryModel.expiresAt > now) {
    return {
      model: cachedPrimaryModel.model,
      updatedBy: cachedPrimaryModel.updatedBy,
      updatedAt: cachedPrimaryModel.updatedAt,
    };
  }

  const fallbackModel =
    (process.env.OPENAI_PRIMARY_MODEL ?? "").trim() || "gpt-4o-mini";

  try {
    await ensureAppSettingTable();
    const rows = await prisma.$queryRaw<
      Array<{ value: string; updatedBy: string | null; updatedAt: Date }>
    >`SELECT "value", "updatedBy", "updatedAt" FROM "AppSetting" WHERE "key" = ${SETTING_KEY_PRIMARY_MODEL} LIMIT 1`;

    const row = rows[0];
    const resolvedModel = row?.value?.trim() || fallbackModel;
    const info: ActiveModelInfo = {
      model: resolvedModel,
      updatedBy: row?.updatedBy ?? null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
    cachedPrimaryModel = { ...info, expiresAt: now + CACHE_TTL_MS };
    return info;
  } catch {
    return { model: fallbackModel, updatedBy: null, updatedAt: null };
  }
}

export async function getActivePrimaryModel(): Promise<string> {
  const info = await getActivePrimaryModelInfo();
  return info.model;
}

export async function setActivePrimaryModel(
  modelId: string,
  updatedBy: string
): Promise<ActiveModelInfo> {
  const trimmed = modelId.trim();
  const allowedIds = new Set(getAvailableModels().map((m) => m.id));
  if (!allowedIds.has(trimmed)) {
    throw new Error(`Unsupported model "${trimmed}".`);
  }

  await ensureAppSettingTable();
  const now = new Date();
  await prisma.$executeRaw`
    INSERT INTO "AppSetting" ("key", "value", "updatedBy", "updatedAt")
    VALUES (${SETTING_KEY_PRIMARY_MODEL}, ${trimmed}, ${updatedBy}, ${now})
    ON CONFLICT ("key")
    DO UPDATE SET
      "value" = EXCLUDED."value",
      "updatedBy" = EXCLUDED."updatedBy",
      "updatedAt" = EXCLUDED."updatedAt"
  `;

  const info: ActiveModelInfo = {
    model: trimmed,
    updatedBy,
    updatedAt: now.toISOString(),
  };
  cachedPrimaryModel = { ...info, expiresAt: Date.now() + CACHE_TTL_MS };
  return info;
}
