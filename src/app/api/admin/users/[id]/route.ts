import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sysLogger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Permanently deletes a blocked user and ALL of their data from the site:
 * - Uploaded documents (cascade)
 * - Chat messages (cascade)
 * - Usage logs (cascade)
 * - System logs referencing the user
 * - User account record itself
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  if (id === session.user.id) {
    return NextResponse.json(
      { error: "You cannot permanently delete your own account." },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      role: true,
      isBlocked: true,
      _count: {
        select: {
          documents: true,
          messages: true,
          usageLogs: true,
        },
      },
    },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  if (target.role === Role.ADMIN || target.role === Role.DEVELOPER) {
    return NextResponse.json(
      { error: "Protected administrator and developer accounts cannot be deleted." },
      { status: 403 }
    );
  }

  if (!target.isBlocked) {
    return NextResponse.json(
      {
        error:
          "Block the user first before permanently deleting all of their data.",
      },
      { status: 400 }
    );
  }

  const [deletedSysLogs] = await prisma.$transaction([
    prisma.systemLog.deleteMany({
      where: {
        OR: [{ userId: target.id }, { username: target.username }],
      },
    }),
    prisma.user.delete({
      where: { id: target.id },
    }),
  ]);

  await sysLogger.warn(
    "admin.user.permanent_delete",
    `Admin @${session.user.username} permanently deleted blocked user "${target.username}" and all associated data (${target._count.documents} docs, ${target._count.messages} messages, ${target._count.usageLogs} usage logs, ${deletedSysLogs.count} system logs).`,
    {
      userId: session.user.id,
      username: session.user.username,
      meta: {
        deletedUsername: target.username,
        documentsRemoved: target._count.documents,
        messagesRemoved: target._count.messages,
        usageLogsRemoved: target._count.usageLogs,
        systemLogsRemoved: deletedSysLogs.count,
      },
    }
  );

  return NextResponse.json({
    deletedUserId: target.id,
    deletedUsername: target.username,
    deletedCounts: {
      documents: target._count.documents,
      messages: target._count.messages,
      usageLogs: target._count.usageLogs,
      systemLogs: deletedSysLogs.count,
    },
  });
}
