import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toFileShape, type FileShape } from "@/lib/types";
import { saveUpload } from "@/lib/files";
import { notify } from "@/lib/ws-notify";
import { computeExpiresAt, getSettings } from "@/lib/settings";

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form" }, { status: 400 });
  }

  const codeRaw = form.get("code");
  const studentNameRaw = form.get("studentName");
  const fileField = form.get("file");

  if (typeof codeRaw !== "string" || codeRaw.trim().length === 0) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }
  if (!(fileField instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const code = codeRaw.trim().toUpperCase();
  const session = await db.session.findUnique({ where: { code } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.closed) {
    return NextResponse.json(
      { error: "Session is closed for uploads" },
      { status: 400 },
    );
  }

  const studentName =
    typeof studentNameRaw === "string" && studentNameRaw.trim().length > 0
      ? studentNameRaw.trim()
      : null;

  // saveUpload validates mime type + size and persists the bytes to disk.
  let saved;
  try {
    saved = await saveUpload(fileField);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Compute expiry from current settings.
  const settings = await getSettings();
  const expiresAt = computeExpiresAt(settings.retentionHours);

  const file = await db.file.create({
    data: {
      sessionId: session.id,
      filename: saved.filename,
      storedName: saved.storedName,
      mimeType: saved.mimeType,
      size: saved.size,
      fileType: saved.fileType,
      pageCount: saved.pageCount,
      data: saved.buffer,
      studentName,
      expiresAt,
    },
  });

  const shape: FileShape = toFileShape(file);

  // Best-effort notify the admin over WS.
  void notify("file-uploaded", { file: shape });

  return NextResponse.json({ file: shape }, { status: 201 });
}
