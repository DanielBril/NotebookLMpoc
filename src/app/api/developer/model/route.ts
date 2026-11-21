import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import {
  getAvailableModels,
  setActivePrimaryModel,
} from "@/lib/modelConfig";
import { sysLogger } from "@/lib/logger";

export const runtime = "nodejs";

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

  let body: { model?: string };
  try {
    body = (await req.json()) as { model?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const nextModel = (body.model ?? "").trim();
  const allowed = getAvailableModels();
  if (!nextModel || !allowed.some((m) => m.id === nextModel)) {
    return NextResponse.json(
      { error: "Invalid or unsupported model selection." },
      { status: 400 }
    );
  }

  try {
    const updated = await setActivePrimaryModel(
      nextModel,
      session.user.username
    );

    await sysLogger.info(
      "developer.config.model",
      `Global active model changed to "${updated.model}" for all users by @${session.user.username}.`,
      {
        userId: session.user.id,
        username: session.user.username,
        meta: { model: updated.model },
      }
    );

    return NextResponse.json({
      ok: true,
      primaryModel: updated.model,
      updatedBy: updated.updatedBy,
      updatedAt: updated.updatedAt,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update active model.";
    await sysLogger.error("developer.config.model", message, {
      error: err,
      userId: session.user.id,
      username: session.user.username,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
