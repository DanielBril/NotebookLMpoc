import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== Role.ADMIN) {
    return NextResponse.json(
      { error: "Forbidden: Admin access required." },
      { status: 403 }
    );
  }

  const { id } = await context.params;
  let body: { isBlocked?: boolean; reason?: string };
  try {
    body = (await req.json()) as { isBlocked?: boolean; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (typeof body.isBlocked !== "boolean") {
    return NextResponse.json(
      { error: "Missing boolean field `isBlocked`." },
      { status: 400 }
    );
  }

  if (id === session.user.id) {
    return NextResponse.json(
      { error: "Administrators cannot block their own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, role: true, isBlocked: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === Role.ADMIN) {
    return NextResponse.json(
      { error: "Admin accounts cannot be blocked." },
      { status: 400 }
    );
  }

  const sanitizedReason = body.isBlocked
    ? (body.reason ?? "").trim().slice(0, 240) || null
    : null;

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      isBlocked: body.isBlocked,
      blockedAt: body.isBlocked ? new Date() : null,
      blockedReason: sanitizedReason,
    },
    select: {
      id: true,
      username: true,
      isBlocked: true,
      blockedAt: true,
      blockedReason: true,
    },
  });

  return NextResponse.json({
    user: {
      ...updated,
      blockedAt: updated.blockedAt ? updated.blockedAt.toISOString() : null,
    },
  });
}
