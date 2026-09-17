import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toSessionShape } from "@/lib/types";
import { notify } from "@/lib/ws-notify";
import { deleteUpload } from "@/lib/files";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await db.session.findUnique({
    where: { id },
    include: { _count: { select: { files: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ session: toSessionShape(session) });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let body: { closed?: unknown; name?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { closed?: boolean; name?: string } = {};
  if (typeof body.closed === "boolean") data.closed = body.closed;
  if (typeof body.name === "string" && body.name.trim().length > 0) {
    data.name = body.name.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
  }

  let session;
  try {
    session = await db.session.update({
      where: { id },
      data,
      include: { _count: { select: { files: true } } },
    });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const shape = toSessionShape(session);
  void notify("session-updated", { session: shape });
  return NextResponse.json({ session: shape });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Load files first so we can wipe them from disk before cascading the DB row.
  const files = await db.file.findMany({ where: { sessionId: id }, select: { storedName: true } });
  for (const f of files) {
    await deleteUpload(f.storedName);
  }

  try {
    await db.session.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
