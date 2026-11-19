import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  MAX_ACTIVE_CONTEXT_TOKENS,
  MAX_FILE_SIZE_BYTES,
  MAX_FILES_PER_USER,
  MAX_TOTAL_STORAGE_BYTES,
  parseDocumentBuffer,
} from "@/lib/fileParser";

export const runtime = "nodejs";

function buildSummary(
  docs: Array<{ sizeBytes: number; tokenCount: number; isSelected: boolean }>
) {
  let totalSizeBytes = 0;
  let activeTokens = 0;
  let activeCount = 0;

  for (const doc of docs) {
    totalSizeBytes += doc.sizeBytes;
    if (doc.isSelected) {
      activeTokens += doc.tokenCount;
      activeCount += 1;
    }
  }

  return {
    count: docs.length,
    activeCount,
    maxFiles: MAX_FILES_PER_USER,
    totalSizeBytes,
    maxTotalSizeBytes: MAX_TOTAL_STORAGE_BYTES,
    activeTokens,
    maxActiveTokens: MAX_ACTIVE_CONTEXT_TOKENS,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const docs = await prisma.document.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
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

  const formatted = docs.map((d) => ({
    id: d.id,
    filename: d.filename,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    tokenCount: d.tokenCount,
    isSelected: d.isSelected,
    createdAt: d.createdAt.toISOString(),
    previewSnippet:
      d.extractedText.length > 480
        ? `${d.extractedText.slice(0, 480).trim()}…`
        : d.extractedText,
  }));

  return NextResponse.json({
    documents: formatted,
    summary: buildSummary(docs),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const rawFiles = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((entry): entry is File => entry instanceof File);

    if (rawFiles.length === 0) {
      return NextResponse.json(
        { error: "No files were provided in the upload request." },
        { status: 400 }
      );
    }

    const existingDocs = await prisma.document.findMany({
      where: { userId: session.user.id },
      select: { sizeBytes: true, tokenCount: true, isSelected: true },
    });

    let currentCount = existingDocs.length;
    let currentTotalBytes = existingDocs.reduce((acc, d) => acc + d.sizeBytes, 0);
    let currentActiveTokens = existingDocs.reduce(
      (acc, d) => (d.isSelected ? acc + d.tokenCount : acc),
      0
    );

    if (currentCount >= MAX_FILES_PER_USER) {
      return NextResponse.json(
        {
          error:
            "Maximum 10 sources reached. Delete a source to upload another.",
        },
        { status: 400 }
      );
    }

    if (currentCount + rawFiles.length > MAX_FILES_PER_USER) {
      const remaining = MAX_FILES_PER_USER - currentCount;
      return NextResponse.json(
        {
          error: `You can only upload ${remaining} more ${remaining === 1 ? "source" : "sources"} (maximum 10 sources per user).`,
        },
        { status: 400 }
      );
    }

    const createdDocs = [];
    const warnings: string[] = [];

    for (const file of rawFiles) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          {
            error: `"${file.name}" exceeds the 10 MB per-file size limit.`,
          },
          { status: 400 }
        );
      }

      if (currentTotalBytes + file.size > MAX_TOTAL_STORAGE_BYTES) {
        return NextResponse.json(
          {
            error: `Uploading "${file.name}" would exceed the 50 MB cumulative storage limit.`,
          },
          { status: 400 }
        );
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let parsed;
      try {
        parsed = await parseDocumentBuffer(buffer, file.name, file.type);
      } catch (parseErr) {
        return NextResponse.json(
          {
            error:
              parseErr instanceof Error
                ? parseErr.message
                : `Failed to parse "${file.name}".`,
          },
          { status: 400 }
        );
      }

      const fitsTokenCeiling =
        currentActiveTokens + parsed.tokenCount <= MAX_ACTIVE_CONTEXT_TOKENS;

      if (!fitsTokenCeiling) {
        warnings.push(
          `"${file.name}" was uploaded unchecked because selecting it would exceed the 150,000 active context token limit. Uncheck a large source to enable it.`
        );
      }

      const created = await prisma.document.create({
        data: {
          userId: session.user.id,
          filename: file.name.slice(0, 180),
          mimeType: parsed.normalizedMimeType,
          sizeBytes: file.size,
          extractedText: parsed.extractedText,
          tokenCount: parsed.tokenCount,
          isSelected: fitsTokenCeiling,
        },
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

      currentCount += 1;
      currentTotalBytes += file.size;
      if (fitsTokenCeiling) {
        currentActiveTokens += parsed.tokenCount;
      }

      createdDocs.push({
        id: created.id,
        filename: created.filename,
        mimeType: created.mimeType,
        sizeBytes: created.sizeBytes,
        tokenCount: created.tokenCount,
        isSelected: created.isSelected,
        createdAt: created.createdAt.toISOString(),
        previewSnippet:
          created.extractedText.length > 480
            ? `${created.extractedText.slice(0, 480).trim()}…`
            : created.extractedText,
      });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { lastActiveAt: new Date() },
    });

    const allDocs = await prisma.document.findMany({
      where: { userId: session.user.id },
      select: { sizeBytes: true, tokenCount: true, isSelected: true },
    });

    return NextResponse.json(
      {
        documents: createdDocs,
        warnings,
        summary: buildSummary(allDocs),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[Documents POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to process uploaded documents." },
      { status: 500 }
    );
  }
}
