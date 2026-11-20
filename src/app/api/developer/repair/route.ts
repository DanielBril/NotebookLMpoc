import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { QueryStatus, Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePdfDomPolyfills } from "@/lib/domMatrixPolyfill";
import { estimateTokenCount } from "@/lib/fileParser";
import { sysLogger } from "@/lib/logger";
import { MAX_ACTIVE_CONTEXT_TOKENS } from "@/lib/constants";

export const runtime = "nodejs";

export type RepairAction =
  | "VERIFY_PDF_POLYFILL"
  | "RECALCULATE_DOCUMENT_TOKENS"
  | "PURGE_CORRUPTED_DOCUMENTS"
  | "RESOLVE_ALL_ERRORS"
  | "CLEAR_RESOLVED_LOGS"
  | "RESET_ADMIN_AND_DEV_ACCOUNTS"
  | "UNBLOCK_ALL_USERS";

/**
 * Generates a minimal valid 1-page PDF buffer containing "ContextLM PDF Diagnostic OK"
 * to test PDFParse + DOMMatrix polyfill execution end-to-end in the live Node runtime.
 */
function buildMinimalTestPdfBuffer(): Buffer {
  const lines = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 55 >> stream",
    "BT /F1 12 Tf 20 100 Td (ContextLM PDF Diagnostic OK) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "xref",
    "0 6",
    "0000000000 65535 f ",
    "0000000009 00000 n ",
    "0000000058 00000 n ",
    "0000000115 00000 n ",
    "0000000241 00000 n ",
    "0000000346 00000 n ",
    "trailer << /Size 6 /Root 1 0 R >>",
    "startxref",
    "416",
    "%%EOF",
  ];
  return Buffer.from(lines.join("\n"), "utf-8");
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

  let body: { action?: RepairAction; logId?: string };
  try {
    body = (await req.json()) as { action?: RepairAction; logId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  // Optional single-log resolve toggle
  if (body.logId) {
    const updated = await prisma.systemLog.update({
      where: { id: body.logId },
      data: { resolved: true },
    });
    return NextResponse.json({
      ok: true,
      summary: `Marked log ${updated.id} as resolved.`,
    });
  }

  const action = body.action;
  if (!action) {
    return NextResponse.json({ error: "Missing repair action." }, { status: 400 });
  }

  try {
    switch (action) {
      case "VERIFY_PDF_POLYFILL": {
        const poly = ensurePdfDomPolyfills();
        const m1 = new globalThis.DOMMatrix([1, 0, 0, 1, 10, 20]);
        const m2 = m1.scale(2, 2).invertSelf();
        const matrixWorking =
          typeof m2.a === "number" && !Number.isNaN(m2.a);

        // Also run an end-to-end PDFParse self-test on a minimal in-memory PDF
        let pdfExtracted = "";
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({
          data: new Uint8Array(buildMinimalTestPdfBuffer()),
        });
        try {
          const res = await parser.getText();
          pdfExtracted = (res.text || "").trim();
        } finally {
          await parser.destroy().catch(() => {});
        }

        const msg = `DOMMatrix polyfill active (${poly.domMatrixInstalled}), matrix math verified (${matrixWorking}), PDFParse self-test extracted: "${pdfExtracted}"`;
        await sysLogger.info("developer.repair.pdf_polyfill", msg, {
          userId: session.user.id,
          username: session.user.username,
          meta: { ...poly, matrixWorking, pdfExtracted },
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      case "RECALCULATE_DOCUMENT_TOKENS": {
        const docs = await prisma.document.findMany({
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            userId: true,
            filename: true,
            extractedText: true,
            tokenCount: true,
            isSelected: true,
          },
        });

        let updatedTokensCount = 0;
        let deselectedOverflowCount = 0;
        const activePerUser = new Map<string, number>();

        for (const d of docs) {
          const trueTokens = estimateTokenCount(d.extractedText);
          const currentUserTokens = activePerUser.get(d.userId) ?? 0;
          let nextSelected = d.isSelected;

          if (
            nextSelected &&
            currentUserTokens + trueTokens > MAX_ACTIVE_CONTEXT_TOKENS
          ) {
            nextSelected = false;
            deselectedOverflowCount += 1;
          }

          if (nextSelected) {
            activePerUser.set(d.userId, currentUserTokens + trueTokens);
          }

          if (trueTokens !== d.tokenCount || nextSelected !== d.isSelected) {
            await prisma.document.update({
              where: { id: d.id },
              data: { tokenCount: trueTokens, isSelected: nextSelected },
            });
            updatedTokensCount += 1;
          }
        }

        const msg = `Audited ${docs.length} document(s): repaired ${updatedTokensCount} token count(s) and auto-unchecked ${deselectedOverflowCount} overflow source(s) (>150k cap).`;
        await sysLogger.info("developer.repair.recalc_tokens", msg, {
          userId: session.user.id,
          username: session.user.username,
          meta: {
            audited: docs.length,
            updatedTokensCount,
            deselectedOverflowCount,
          },
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      case "PURGE_CORRUPTED_DOCUMENTS": {
        const docs = await prisma.document.findMany({
          select: {
            id: true,
            filename: true,
            sizeBytes: true,
            tokenCount: true,
            extractedText: true,
          },
        });
        const corruptedIds = docs
          .filter(
            (d) =>
              d.sizeBytes <= 0 ||
              d.tokenCount <= 0 ||
              !d.extractedText ||
              d.extractedText.trim().length === 0
          )
          .map((d) => d.id);

        if (corruptedIds.length > 0) {
          await prisma.document.deleteMany({
            where: { id: { in: corruptedIds } },
          });
        }

        const msg = `Purged ${corruptedIds.length} corrupted/empty document(s).`;
        await sysLogger.info("developer.repair.purge_docs", msg, {
          userId: session.user.id,
          username: session.user.username,
          meta: { purgedCount: corruptedIds.length },
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      case "RESOLVE_ALL_ERRORS": {
        const [resLogs, delFailedUsage] = await Promise.all([
          prisma.systemLog.updateMany({
            where: { resolved: false },
            data: { resolved: true },
          }),
          prisma.usageLog.deleteMany({
            where: { status: QueryStatus.ERROR },
          }),
        ]);

        const msg = `Marked ${resLogs.count} system log(s) resolved and cleared ${delFailedUsage.count} failed (ERROR) usage log entries.`;
        await sysLogger.info("developer.repair.resolve_errors", msg, {
          userId: session.user.id,
          username: session.user.username,
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      case "CLEAR_RESOLVED_LOGS": {
        const deleted = await prisma.systemLog.deleteMany({
          where: { resolved: true },
        });
        return NextResponse.json({
          ok: true,
          summary: `Deleted ${deleted.count} resolved system log entries.`,
        });
      }

      case "RESET_ADMIN_AND_DEV_ACCOUNTS": {
        const [adminHash, devHash] = await Promise.all([
          bcrypt.hash("admin", 10),
          bcrypt.hash("Developer", 10),
        ]);

        await Promise.all([
          prisma.user.upsert({
            where: { username: "admin" },
            update: {
              role: Role.ADMIN,
              passwordHash: adminHash,
              isBlocked: false,
              blockedAt: null,
              blockedReason: null,
            },
            create: {
              username: "admin",
              email: "admin@contextlm.local",
              name: "מנהל מערכת",
              passwordHash: adminHash,
              role: Role.ADMIN,
              provider: "credentials",
              isBlocked: false,
            },
          }),
          prisma.user.upsert({
            where: { username: "developer" },
            update: {
              role: Role.DEVELOPER,
              passwordHash: devHash,
              isBlocked: false,
              blockedAt: null,
              blockedReason: null,
            },
            create: {
              username: "developer",
              email: "developer@contextlm.local",
              name: "System Developer",
              passwordHash: devHash,
              role: Role.DEVELOPER,
              provider: "credentials",
              isBlocked: false,
            },
          }),
        ]);

        const msg =
          'Verified & restored default credentials for "admin" / "admin" (ADMIN) and "Developer" / "Developer" (DEVELOPER).';
        await sysLogger.info("developer.repair.reset_system_accounts", msg, {
          userId: session.user.id,
          username: session.user.username,
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      case "UNBLOCK_ALL_USERS": {
        const updated = await prisma.user.updateMany({
          where: { isBlocked: true },
          data: { isBlocked: false, blockedAt: null, blockedReason: null },
        });
        const msg = `Unblocked ${updated.count} blocked user account(s).`;
        await sysLogger.info("developer.repair.unblock_all", msg, {
          userId: session.user.id,
          username: session.user.username,
        });
        return NextResponse.json({ ok: true, summary: msg });
      }

      default:
        return NextResponse.json(
          { error: "Unknown repair action." },
          { status: 400 }
        );
    }
  } catch (err) {
    await sysLogger.error("developer.repair", `Repair action ${action} failed`, {
      error: err,
      userId: session.user.id,
      username: session.user.username,
    });
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to execute repair action.",
      },
      { status: 500 }
    );
  }
}
