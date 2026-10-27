import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toFileShape, type FileShape } from "@/lib/types";
import { notify } from "@/lib/ws-notify";
import { computeExpiresAt, getSettings } from "@/lib/settings";

export async function POST(req: Request) {
  let body: {
    code?: string;
    type?: "url" | "text";
    content?: string;
    title?: string;
    studentName?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { code: rawCode, type, content, title, studentName: rawName } = body;

  if (!rawCode || typeof rawCode !== "string") {
    return NextResponse.json({ error: "Session code is required" }, { status: 400 });
  }
  if (type !== "url" && type !== "text") {
    return NextResponse.json({ error: "Type must be 'url' or 'text'" }, { status: 400 });
  }
  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json(
      { error: type === "url" ? "URL is required" : "Text content is required" },
      { status: 400 },
    );
  }

  const code = rawCode.trim().toUpperCase();
  const session = await db.session.findUnique({ where: { code } });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.closed) {
    return NextResponse.json(
      { error: "Session is closed for submissions" },
      { status: 400 },
    );
  }

  const trimmedContent = content.trim();
  const studentName =
    typeof rawName === "string" && rawName.trim().length > 0 ? rawName.trim() : null;

  let filename = "";
  if (typeof title === "string" && title.trim().length > 0) {
    filename = title.trim();
  } else if (type === "url") {
    filename = trimmedContent;
  } else {
    // For notes, take the first line or first 50 chars
    const firstLine = trimmedContent.split("\n")[0].trim();
    filename = firstLine.length > 50 ? `${firstLine.slice(0, 50)}...` : firstLine || "Quick Note";
  }

  const mimeType = type === "url" ? "text/x-url" : "text/plain";
  const size = Buffer.byteLength(trimmedContent, "utf8");

  const settings = await getSettings();
  const expiresAt = computeExpiresAt(settings.retentionHours);

  const file = await db.file.create({
    data: {
      sessionId: session.id,
      filename,
      storedName: trimmedContent,
      mimeType,
      size,
      fileType: type,
      pageCount: 1,
      data: Buffer.from(trimmedContent, "utf8"),
      studentName,
      expiresAt,
    },
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

  const shape: FileShape = toFileShape(file);

  // Real-time broadcast to admin dashboard
  void notify("file-uploaded", { file: shape });

  return NextResponse.json({ file: shape }, { status: 201 });
}
