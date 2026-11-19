import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAX_ACTIVE_CONTEXT_TOKENS } from "@/lib/fileParser";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const doc = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      tokenCount: true,
      isSelected: true,
      createdAt: true,
      extractedText: true,
    },
  });

  if (!doc) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  return NextResponse.json({
    document: {
      ...doc,
      createdAt: doc.createdAt.toISOString(),
      excerpt:
        doc.extractedText.length > 6000
          ? `${doc.extractedText.slice(0, 6000)}\n\n… [Truncated preview — full ${doc.tokenCount.toLocaleString()} tokens available in context]`
          : doc.extractedText,
    },
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await req.json()) as { isSelected?: boolean };

  if (typeof body.isSelected !== "boolean") {
    return NextResponse.json(
      { error: "Missing boolean field `isSelected`." },
      { status: 400 }
    );
  }

  const target = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, filename: true, tokenCount: true, isSelected: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  if (body.isSelected && !target.isSelected) {
    const otherActive = await prisma.document.aggregate({
      where: {
        userId: session.user.id,
        isSelected: true,
        id: { not: target.id },
      },
      _sum: { tokenCount: true },
    });

    const currentActiveTokens = otherActive._sum.tokenCount ?? 0;
    const projectedTokens = currentActiveTokens + target.tokenCount;

    if (projectedTokens > MAX_ACTIVE_CONTEXT_TOKENS) {
      return NextResponse.json(
        {
          error: `Enabling "${target.filename}" (${target.tokenCount.toLocaleString()} tokens) would reach ${projectedTokens.toLocaleString()} tokens, exceeding the 150,000 active context token limit. Uncheck a large source first.`,
        },
        { status: 400 }
      );
    }
  }

  const updated = await prisma.document.update({
    where: { id: target.id },
    data: { isSelected: body.isSelected },
    select: {
      id: true,
      filename: true,
      isSelected: true,
      tokenCount: true,
    },
  });

  return NextResponse.json({ document: updated });
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await prisma.document.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await prisma.document.delete({ where: { id: existing.id } });

  return NextResponse.json({ deletedId: existing.id });
}
