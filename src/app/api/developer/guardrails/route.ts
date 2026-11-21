import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  getGuardrailConfigInfo,
  setGuardrailConfig,
} from "@/lib/guardrailConfig";
import { sysLogger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.DEVELOPER &&
    session.user.role !== Role.ADMIN
  ) {
    return NextResponse.json(
      { error: "Forbidden: Developer access required." },
      { status: 403 }
    );
  }

  const info = await getGuardrailConfigInfo();
  return NextResponse.json(info);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== Role.DEVELOPER &&
    session.user.role !== Role.ADMIN
  ) {
    return NextResponse.json(
      { error: "Forbidden: Developer access required." },
      { status: 403 }
    );
  }

  let body: { config?: unknown };
  try {
    body = (await req.json()) as { config?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  try {
    const updated = await setGuardrailConfig(
      body.config ?? body,
      session.user.username
    );

    await sysLogger.info(
      "developer.config.guardrails",
      `Security Pipeline configuration updated by @${session.user.username} (strictness=${updated.config.strictnessMode}, L1_outOfScope=${updated.config.enableLayer1OutOfScope}, L4_classifier=${updated.config.enableLayer4MicroClassifier}, allowTerms=${updated.config.customAllowTerms.length}, blockTerms=${updated.config.customBlockTerms.length}).`,
      {
        userId: session.user.id,
        username: session.user.username,
        meta: { config: updated.config },
      }
    );

    return NextResponse.json({
      ok: true,
      ...updated,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to save security pipeline configuration.";
    await sysLogger.error("developer.config.guardrails", message, {
      error: err,
      userId: session.user.id,
      username: session.user.username,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
