import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { db } from "@/lib/db";
import { readUpload } from "@/lib/files";
import { ZipArchive } from "archiver";

/**
 * GET /api/sessions/[id]/zip
 * Streams a ZIP archive of all (non-expired) files in the session.
 * Files are named `${studentName || "anonymous"}-${filename}` with a
 * numeric suffix when collisions occur, so the admin gets a clean,
 * human-readable archive.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await db.session.findUnique({
    where: { id },
    include: { files: { orderBy: { createdAt: "asc" } } },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Filter out expired files (they may have been swept already, but be safe).
  const now = new Date();
  const files = session.files.filter(
    (f) => !f.expiresAt || f.expiresAt.getTime() >= now.getTime(),
  );

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files to download" },
      { status: 400 },
    );
  }

  const archive = new ZipArchive({ zlib: { level: 5 } });
  archive.on("error", (err: unknown) => {
    console.error("[zip] archiver error:", err);
  });

  const safeSessionName = session.name.replace(/[^\w\d\-]+/g, "_").slice(0, 40);
  const stream = new Readable({ read() {} });
  archive.on("data", (chunk: Buffer) => stream.push(chunk));
  archive.on("end", () => stream.push(null));
  archive.on("error", () => stream.push(null));

  // Track used names so duplicates get a suffix.
  const used = new Set<string>();
  for (const f of files) {
    const base = (f.studentName || "anonymous")
      .replace(/[^\w\d\-]+/g, "_")
      .slice(0, 30);
    const ext = f.filename.includes(".")
      ? f.filename.slice(f.filename.lastIndexOf("."))
      : "";
    const stem = f.filename.includes(".")
      ? f.filename.slice(0, f.filename.lastIndexOf("."))
      : f.filename;
    let candidate = `${base}-${stem}${ext}`.replace(/[^\w\d\-.]+/g, "_");
    if (candidate.startsWith("_")) candidate = candidate.replace(/^_+/, "");
    let n = 1;
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}-${stem}-${n}${ext}`.replace(/[^\w\d\-.]+/g, "_");
      n++;
    }
    used.add(candidate.toLowerCase());

    try {
      const { buffer } = await readUpload(f.storedName);
      archive.append(buffer, { name: candidate, date: f.createdAt });
    } catch (err) {
      console.error("[zip] could not read", f.storedName, err);
    }
  }

  archive.finalize();

  const webStream = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("data", (chunk: Buffer) =>
        controller.enqueue(new Uint8Array(chunk)),
      );
      stream.on("end", () => controller.close());
      stream.on("error", (e) => {
        console.error("[zip] stream error:", e);
        controller.close();
      });
    },
  });

  const filename = `${safeSessionName}-${session.code}.zip`;
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
