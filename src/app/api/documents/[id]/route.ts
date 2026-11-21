import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveUserStatus } from "@/lib/activeUser";
import { prisma } from "@/lib/prisma";
import { MAX_ACTIVE_CONTEXT_TOKENS } from "@/lib/fileParser";

export const runtime = "nodejs";

function blockedResponse(reason: string | null) {
  return NextResponse.json(
    { error: "ACCOUNT_BLOCKED", accountBlocked: true, reason },
    { status: 403 }
  );
}

const PREVIEW_WINDOW_CHARS = 6000;

function normalizeForLookup(text: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let prevSpace = true;

  for (let i = 0; i < text.length; i++) {
    let ch = text[i];
    if (/[\u200B-\u200F\u202A-\u202E\uFEFF]/.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        chars.push(" ");
        map.push(i);
        prevSpace = true;
      }
      continue;
    }
    if (ch === "“" || ch === "”" || ch === "„" || ch === "״") ch = '"';
    else if (ch === "‘" || ch === "’" || ch === "׳") ch = "'";
    else if (ch === "–" || ch === "—") ch = "-";
    chars.push(ch.toLowerCase());
    map.push(i);
    prevSpace = false;
  }

  if (chars.length > 0 && chars[chars.length - 1] === " ") {
    chars.pop();
    map.pop();
  }
  return { norm: chars.join(""), map };
}

function buildCenteredExcerpt(
  fullText: string,
  tokenCount: number,
  query: string | null
): string {
  if (fullText.length <= PREVIEW_WINDOW_CHARS) {
    return fullText;
  }

  let matchStart = -1;
  const trimmedQuery = (query ?? "").trim();

  if (trimmedQuery.length >= 3) {
    const lowerFull = fullText.toLowerCase();
    const lowerQ = trimmedQuery.toLowerCase();
    matchStart = lowerFull.indexOf(lowerQ);

    if (matchStart === -1) {
      const normFull = normalizeForLookup(fullText);
      const normQ = normalizeForLookup(trimmedQuery).norm;
      if (normQ.length >= 3) {
        let normPos = normFull.norm.indexOf(normQ);
        if (normPos === -1 && normQ.length > 36) {
          normPos = normFull.norm.indexOf(normQ.slice(0, 36));
        }
        if (normPos === -1 && normQ.length > 20) {
          normPos = normFull.norm.indexOf(normQ.slice(0, 20));
        }
        if (normPos !== -1) {
          matchStart = normFull.map[normPos] ?? -1;
        }
      }
    }
  }

  if (matchStart === -1) {
    return `${fullText.slice(0, PREVIEW_WINDOW_CHARS)}\n\n… [Truncated preview — full ${tokenCount.toLocaleString()} tokens available in context]`;
  }

  let start = Math.max(0, matchStart - 2200);
  const end = Math.min(fullText.length, start + PREVIEW_WINDOW_CHARS);
  start = Math.max(0, end - PREVIEW_WINDOW_CHARS);

  if (start > 0) {
    const nextBreak = fullText.indexOf("\n", start);
    if (nextBreak !== -1 && nextBreak < matchStart && nextBreak - start < 220) {
      start = nextBreak + 1;
    }
  }

  const prefix = start > 0 ? "… [Excerpt centered on matched passage]\n\n" : "";
  const suffix =
    end < fullText.length
      ? `\n\n… [Truncated preview — full ${tokenCount.toLocaleString()} tokens available in context]`
      : "";

  return `${prefix}${fullText.slice(start, end)}${suffix}`;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userStatus = await getActiveUserStatus(session.user.id);
  if (userStatus.isBlocked) {
    return blockedResponse(userStatus.blockedReason);
  }

  const { id } = await context.params;
  const query = req.nextUrl.searchParams.get("q");

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
      excerpt: buildCenteredExcerpt(doc.extractedText, doc.tokenCount, query),
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

  const userStatus = await getActiveUserStatus(session.user.id);
  if (userStatus.isBlocked) {
    return blockedResponse(userStatus.blockedReason);
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

  const userStatus = await getActiveUserStatus(session.user.id);
  if (userStatus.isBlocked) {
    return blockedResponse(userStatus.blockedReason);
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
