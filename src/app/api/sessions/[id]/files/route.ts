import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toFileShape, type FileShape } from "@/lib/types";
import { deleteUpload } from "@/lib/files";

/**
 * GET /api/sessions/[id]/files
 * First sweeps expired files for this session (silent delete), then returns
 * the remaining files ordered by createdAt desc.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const now = new Date();
  // Find expired rows belonging to this session.
  const expired = await db.file.findMany({
    where: { sessionId: id, expiresAt: { not: null, lt: now } },
    select: { id: true, storedName: true },
  });

  if (expired.length > 0) {
    // Wipe disk files first, then DB rows.
    for (const f of expired) {
      await deleteUpload(f.storedName);
    }
    await db.file.deleteMany({
      where: { id: { in: expired.map((f) => f.id) } },
    });
  }

  const files = await db.file.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "desc" },
  });

  const shapes: FileShape[] = files.map((f) => toFileShape(f));
  return NextResponse.json({ files: shapes });
}
