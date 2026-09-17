import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { deleteUpload } from "@/lib/files";

/**
 * POST /api/cleanup
 * Sweep every expired file across all sessions (expiresAt != null && < now):
 * delete from disk first, then from the DB. Returns `{ deleted: number }`.
 */
export async function POST() {
  const now = new Date();

  const expired = await db.file.findMany({
    where: { expiresAt: { not: null, lt: now } },
    select: { id: true, storedName: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ deleted: 0 });
  }

  for (const f of expired) {
    await deleteUpload(f.storedName);
  }
  const result = await db.file.deleteMany({
    where: { id: { in: expired.map((f) => f.id) } },
  });

  return NextResponse.json({ deleted: result.count });
}
