import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  escapeXml,
  generateNonce,
  inspectUserInput,
  shouldRunMicroClassifier,
  type GuardrailLang,
} from "@/lib/guardrails/inputFilter";
import {
  buildGroundedSystemPrompt,
  CANARY_TOKEN,
  detectQueryLanguage,
  wrapUserQuery,
} from "@/lib/guardrails/systemPrompt";
import { createOutputGuardFilter } from "@/lib/guardrails/outputFilter";

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
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  let body: { testPrompt?: string; simulatedOutput?: string; lang?: string };
  try {
    body = (await req.json()) as {
      testPrompt?: string;
      simulatedOutput?: string;
      lang?: string;
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

  const detectedLang = detectQueryLanguage(prompt, uiLang);

  // Layer 1 Trace
  const t1Start = performance.now();
  const l1 = inspectUserInput(prompt, uiLang);
  const t1Ms = Number(Math.max(0.1, performance.now() - t1Start).toFixed(2));

  // Layer 2 Trace (Cryptographic Nonce XML Sandboxing)
  const t2Start = performance.now();
  const nonce = generateNonce();
  const wrappedQuery = wrapUserQuery(prompt, nonce);
  const escapedPreview = escapeXml(prompt);
  const hasXmlChars = escapedPreview !== prompt;
  const t2Ms = Number(Math.max(0.08, performance.now() - t2Start).toFixed(2));

  // Layer 3 Trace (System Prompt Hierarchy & Deterministic Prefix Ordering)
  const t3Start = performance.now();
  const systemPrompt = buildGroundedSystemPrompt(nonce, detectedLang);
  const t3Ms = Number(Math.max(0.08, performance.now() - t3Start).toFixed(2));

  // Layer 4 Trace (Micro-Classifier Trigger & Streaming Canary Filter)
  const t4Start = performance.now();
  const microClassifierWouldRun = shouldRunMicroClassifier(prompt);
  const outputGuard = createOutputGuardFilter();
  const candidateOutput =
    (body.simulatedOutput ?? "").trim() ||
    (prompt.includes(CANARY_TOKEN) ? prompt : "Safe grounded response [1] doc.pdf");
  const outputCheck = outputGuard.inspectChunk(candidateOutput);
  const t4Ms = Number(Math.max(0.1, performance.now() - t4Start).toFixed(2));

  const layers: PipelineLayerTrace[] = [
    {
      layer: 1,
      title:
        uiLang === "he"
          ? "שכבה 1 — סינון דטרמיניסטי (Regex / Base64 / זיוף XML)"
          : "Layer 1 — Deterministic Pre-Filter (Regex / Base64 / XML Spoofing)",
      status: l1.blocked ? "BLOCKED" : "PASS",
      latencyMs: t1Ms,
      summary: l1.blocked
        ? `${l1.rule}: ${l1.reason}`
        : uiLang === "he"
          ? "עבר בהצלחה (0 טוקנים של LLM, לא נמצאו חתימות הזרקה)"
          : "Passed cleanly (0 LLM tokens consumed, no injection signatures matched)",
      technicalDetail: l1.blocked
        ? `Status: ${l1.status} | Rule: ${l1.rule} | Dangerous Flag: ${l1.isDangerous}`
        : "Checked 10 deterministic signature rules + Base64 payload decoder",
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
          ? "שכבה 3 — היררכיית פרומפט מערכת, זיהוי שפת שאלה ומטמון Prefix"
          : "Layer 3 — Hardened System Hierarchy, Question-Language Lock & Prefix Cache",
      status: "PASS",
      latencyMs: t3Ms,
      summary:
        uiLang === "he"
          ? `שפת השאלה שזוהתה: ${detectedLang === "he" ? "עברית (HE)" : "אנגלית (EN)"} • מיון דטרמיניסטי למקסום מטמון`
          : `Detected question language: ${detectedLang.toUpperCase()} • Deterministic source ordering for OpenAI prefix cache`,
      technicalDetail: systemPrompt.split("\n").slice(0, 6).join("\n") + "\n…",
    },
    {
      layer: 4,
      title:
        uiLang === "he"
          ? "שכבה 4 — מסווג מהיר ובקרת קנרית פלט בזמן הזרמה"
          : "Layer 4 — Micro-Classifier Trigger & Streaming Output Canary Guard",
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
            ? "זוהו מילות מפתח גבוליות — מסווג השכבה ה-4 מופעל לבדיקת כוונה"
            : "Borderline signal detected — Layer 4 LLM micro-classifier invoked before synthesis"
          : uiLang === "he"
            ? "פלט נקי מדליפת קנרית או תגיות מערכת"
            : "Output stream verified free of canary or system-tag leakage",
      technicalDetail: `Canary Token Monitored: ${CANARY_TOKEN} | Micro-Classifier Trigger: ${microClassifierWouldRun} | Output Safe: ${outputCheck.safe}`,
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
