import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { toSessionShape } from "@/lib/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const upper = code.toUpperCase();

  const session = await db.session.findUnique({
    where: { code: upper },
    include: { _count: { select: { files: true } } },
  });
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  return NextResponse.json({ session: toSessionShape(session) });
}
