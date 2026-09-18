import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toFileShape, type FileShape } from "@/lib/types";
import { deleteUpload, readUpload } from "@/lib/files";
import { notify } from "@/lib/ws-notify";
import { getSettings } from "@/lib/settings";

/**
 * GET /api/files/[id]
 * Streams the raw file. Default inline. If `?download=1` is present, sets the
 * attachment Content-Disposition using the original filename.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";

  const file = await db.file.findUnique({ where: { id } });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  let buffer: Buffer;
  if (file.data) {
    buffer = Buffer.from(file.data);
  } else {
    try {
      const result = await readUpload(file.storedName);
      buffer = result.buffer;
    } catch {
      return NextResponse.json({ error: "File missing on disk" }, { status: 410 });
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": file.mimeType,
    "Content-Length": String(buffer.length),
    "Cache-Control": "public, max-age=3600, immutable",
  };

  if (download) {
    // Use RFC 5987 encoding for filenames that may contain non-ASCII chars;
    // also provide an ASCII fallback.
    const asciiFallback = file.filename.replace(/[^\x20-\x7E]/g, "_");
    headers["Content-Disposition"] =
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`;
  } else {
    headers["Content-Disposition"] = "inline";
  }

  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}

/**
 * DELETE /api/files/[id]
 * Removes the file from disk and DB. Best-effort WS notify.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const file = await db.file.findUnique({
    where: { id },
    select: { id: true, storedName: true },
  });
  if (!file) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  await deleteUpload(file.storedName);
  await db.file.delete({ where: { id } });

  void notify("file-deleted", { fileId: id });

  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/files/[id]
 * Body: `{ printed?: boolean, expiresAt?: string | null }`.
 *
 * - `printed: true` sets printedAt = now and printed = true.
 * - `printed: false` clears printedAt and sets printed = false.
 * - `expiresAt` accepts an ISO string or null to disable expiry.
 *
 * If the autoDeleteAfterPrint setting is on AND printed was just turned on,
 * the file is deleted (disk + DB) and the response still returns `{ file }`
 * with the last-known state. We also fire `file-deleted` after `file-printed`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { printed?: unknown; expiresAt?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: {
    printed?: boolean;
    printedAt?: Date | null;
    expiresAt?: Date | null;
  } = {};

  if (typeof body.printed === "boolean") {
    data.printed = body.printed;
    data.printedAt = body.printed ? new Date() : null;
  }

  if (body.expiresAt === null) {
    data.expiresAt = null;
  } else if (typeof body.expiresAt === "string") {
    const parsed = new Date(body.expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "expiresAt must be a valid ISO string or null" },
        { status: 400 },
      );
    }
    data.expiresAt = parsed;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No updatable fields provided" },
      { status: 400 },
    );
  }

  const before = await db.file.findUnique({
    where: { id },
    select: { id: true, printed: true },
  });
  if (!before) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const turnedPrintedOn =
    typeof data.printed === "boolean" ? data.printed === true && !before.printed : false;

  const updated = await db.file.update({
    where: { id },
    data,
    select: {
      id: true,
      sessionId: true,
      filename: true,
      storedName: true,
      mimeType: true,
      size: true,
      fileType: true,
      pageCount: true,
      studentName: true,
      createdAt: true,
      printedAt: true,
      printed: true,
      expiresAt: true,
    },
  });

  if (turnedPrintedOn) {
    const shape: FileShape = toFileShape(updated);
    void notify("file-printed", { file: shape });

    // If auto-delete after print is configured, remove the file now.
    const settings = await getSettings();
    if (settings.autoDeleteAfterPrint) {
      // Give a 2-minute grace period so the print tab can finish loading and rendering
      // without racing against instant deletion!
      const graceExpiresAt = new Date(Date.now() + 2 * 60 * 1000);
      await db.file.update({
        where: { id },
        data: { expiresAt: graceExpiresAt },
      });
      // Delay immediate cleanup by 30 seconds so print previews don't break
      setTimeout(async () => {
        try {
          await deleteUpload(updated.storedName);
          await db.file.delete({ where: { id } }).catch(() => {});
          void notify("file-deleted", { fileId: id });
        } catch {
          /* ignore */
        }
      }, 30000);
      return NextResponse.json({ file: shape });
    }
  }

  return NextResponse.json({ file: toFileShape(updated) });
}
