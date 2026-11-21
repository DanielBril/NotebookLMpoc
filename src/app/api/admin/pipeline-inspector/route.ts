import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  escapeXml,
  generateNonce,
  getBorderlineSignals,
  inspectUserInput,
  matchesCustomAllowTerm,
  type GuardrailLang,
} from "@/lib/guardrails/inputFilter";
import {
  buildGroundedSystemPrompt,
  CANARY_TOKEN,
  detectQueryLanguage,
  wrapUserQuery,
} from "@/lib/guardrails/systemPrompt";
import { createOutputGuardFilter } from "@/lib/guardrails/outputFilter";
import {
  getGuardrailConfig,
  sanitizeGuardrailConfig,
} from "@/lib/guardrailConfig";

export const runtime = "nodejs";

export interface PipelineLayerTrace {
  layer: number;
  title: string;
  status: "PASS" | "BLOCKED" | "TRIGGERED" | "STANDBY";
  latencyMs: number;
  summary: string;
  technicalDetail: string;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.ADMIN &&
    session.user.role !== Role.DEVELOPER
  ) {
    return NextResponse.json(
      { error: "Forbidden: Developer access required." },
      { status: 403 }
    );
  }

  let body: {
    testPrompt?: string;
    simulatedOutput?: string;
    lang?: string;
    draftConfig?: unknown;
  };
  try {
    body = (await req.json()) as {
      testPrompt?: string;
      simulatedOutput?: string;
      lang?: string;
      draftConfig?: unknown;
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const uiLang: GuardrailLang = body.lang === "en" ? "en" : "he";
  const prompt = (body.testPrompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: "Test prompt cannot be empty." },
      { status: 400 }
    );
  }

  const activeConfig = body.draftConfig
    ? sanitizeGuardrailConfig(body.draftConfig)
    : await getGuardrailConfig();

  const detectedLang = detectQueryLanguage(prompt, uiLang);
  const allowMatch = matchesCustomAllowTerm(prompt, activeConfig);

  // Layer 1 Trace
  const t1Start = performance.now();
  const l1 = inspectUserInput(prompt, uiLang, activeConfig);
  const t1Ms = Number(Math.max(0.1, performance.now() - t1Start).toFixed(2));

  // Layer 2 Trace (Cryptographic Nonce XML Sandboxing)
  const t2Start = performance.now();
  const nonce = generateNonce();
  const wrappedQuery = wrapUserQuery(prompt, nonce);
  const escapedPreview = escapeXml(prompt);
  const hasXmlChars = escapedPreview !== prompt;
  const t2Ms = Number(Math.max(0.08, performance.now() - t2Start).toFixed(2));

  // Layer 3 Trace (System Prompt Hierarchy & Grounding Strictness)
  const t3Start = performance.now();
  const systemPrompt = buildGroundedSystemPrompt(
    nonce,
    detectedLang,
    activeConfig
  );
  const t3Ms = Number(Math.max(0.08, performance.now() - t3Start).toFixed(2));

  // Layer 4 Trace (Micro-Classifier Trigger & Streaming Canary Filter)
  const t4Start = performance.now();
  const borderlineSignals = getBorderlineSignals(prompt);
  const microClassifierWouldRun =
    activeConfig.enableLayer4MicroClassifier &&
    !allowMatch &&
    borderlineSignals.length > 0;
  const outputGuard = createOutputGuardFilter();
  const candidateOutput =
    (body.simulatedOutput ?? "").trim() ||
    (prompt.includes(CANARY_TOKEN)
      ? prompt
      : "Safe grounded response [1] doc.pdf");
  const outputCheck = activeConfig.enableLayer4OutputCanary
    ? outputGuard.inspectChunk(candidateOutput)
    : { safe: true, reason: undefined };
  const t4Ms = Number(Math.max(0.1, performance.now() - t4Start).toFixed(2));

  const layers: PipelineLayerTrace[] = [
    {
      layer: 1,
      title:
        uiLang === "he"
          ? "שכבה 1 — סינון דטרמיניסטי (Regex / Base64 / חוקים מותאמים)"
          : "Layer 1 — Deterministic Pre-Filter (Regex / Base64 / Custom Rules)",
      status: l1.blocked ? "BLOCKED" : "PASS",
      latencyMs: t1Ms,
      summary: l1.blocked
        ? `${l1.rule}: ${l1.reason}`
        : allowMatch
          ? uiLang === "he"
            ? `אושר באמצעות רשימת ההיתרים ("${allowMatch}") — סינון מחוץ לתחום דולג`
            : `Passed via allowlist ("${allowMatch}") — out-of-scope pre-filter bypassed`
          : uiLang === "he"
            ? `עבר בהצלחה (סינון מחוץ לתחום: ${activeConfig.enableLayer1OutOfScope ? "פעיל" : "כבוי"})`
            : `Passed cleanly (Out-of-scope filter: ${activeConfig.enableLayer1OutOfScope ? "ON" : "OFF"})`,
      technicalDetail: l1.blocked
        ? `Status: ${l1.status} | Rule: ${l1.rule} | Matched: ${l1.matchedFragment ?? "—"} | Dangerous: ${l1.isDangerous}`
        : `OutOfScope=${activeConfig.enableLayer1OutOfScope} | AllowTerms=${activeConfig.customAllowTerms.length} | BlockTerms=${activeConfig.customBlockTerms.length}`,
    },
    {
      layer: 2,
      title:
        uiLang === "he"
          ? "שכבה 2 — ארגז חול XML עם Nonce קריפטוגרפי חד-פעמי"
          : "Layer 2 — Cryptographic Nonce XML Trust-Boundary Sandbox",
      status: "PASS",
      latencyMs: t2Ms,
      summary:
        uiLang === "he"
          ? `נוצר Nonce אקראי (${nonce}) וכל תווי ה-XML עברו ניטרול`
          : `Generated per-request hex nonce (${nonce}) & escaped untrusted XML entities`,
      technicalDetail: `${wrappedQuery}${hasXmlChars ? "  /* XML control tags neutralized */" : ""}`,
    },
    {
      layer: 3,
      title:
        uiLang === "he"
          ? "שכבה 3 — פרומפט עיגון, רמת קשיחות וזיהוי שפה"
          : "Layer 3 — Grounding Strictness, Language Lock & Prefix Cache",
      status: "PASS",
      latencyMs: t3Ms,
      summary:
        uiLang === "he"
          ? `רמת עיגון: ${activeConfig.strictnessMode.toUpperCase()} · סיכומים כלליים: ${activeConfig.allowGeneralDocOverviews ? "מותר" : "מוגבל"} · שפה: ${detectedLang.toUpperCase()}`
          : `Strictness: ${activeConfig.strictnessMode.toUpperCase()} · Doc overviews: ${activeConfig.allowGeneralDocOverviews ? "ALLOWED" : "RESTRICTED"} · Lang: ${detectedLang.toUpperCase()}`,
      technicalDetail:
        systemPrompt.split("\n").slice(-6).join("\n"),
    },
    {
      layer: 4,
      title:
        uiLang === "he"
          ? "שכבה 4 — מסווג מהיר ובקרת קנרית פלט בזמן הזרמה"
          : "Layer 4 — Micro-Classifier & Streaming Output Canary Guard",
      status: !outputCheck.safe
        ? "BLOCKED"
        : microClassifierWouldRun
          ? "TRIGGERED"
          : "PASS",
      latencyMs: t4Ms,
      summary: !outputCheck.safe
        ? `${uiLang === "he" ? "קנרית פלט הופעלה — ההזרמה הופסקה:" : "Output Canary Tripped — Stream Aborted:"} ${outputCheck.reason}`
        : microClassifierWouldRun
          ? uiLang === "he"
            ? `זוהו אותות גבוליים (${borderlineSignals.join(", ")}) — מסווג השכבה ה-4 יופעל`
            : `Borderline signals (${borderlineSignals.join(", ")}) — Layer 4 LLM micro-classifier will run`
          : !activeConfig.enableLayer4MicroClassifier && borderlineSignals.length > 0
            ? uiLang === "he"
              ? `אותות גבוליים (${borderlineSignals.join(", ")}) דולגו כי מסווג שכבה 4 מושבת`
              : `Borderline signals (${borderlineSignals.join(", ")}) skipped because Layer 4 classifier is OFF`
            : uiLang === "he"
              ? "פלט נקי מדליפת קנרית או תגיות מערכת"
              : "Output stream verified free of canary or system-tag leakage",
      technicalDetail: `Classifier=${activeConfig.enableLayer4MicroClassifier ? "ON" : "OFF"} | Canary=${activeConfig.enableLayer4OutputCanary ? "ON" : "OFF"} | Signals=[${borderlineSignals.join(", ")}] | AllowMatch=${allowMatch ?? "none"}`,
    },
  ];

  const overallBlocked = l1.blocked || !outputCheck.safe;

  return NextResponse.json({
    overallVerdict: overallBlocked ? "BLOCKED" : "ALLOWED",
    detectedQueryLanguage: detectedLang,
    nonce,
    totalInspectionMs: Number((t1Ms + t2Ms + t3Ms + t4Ms).toFixed(2)),
    layers,
  });
}
