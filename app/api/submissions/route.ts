import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanupExpiredFiles } from "@/lib/cleanup";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Passive cleanup check: ensures expired files are cleared on disk & DB
  cleanupExpiredFiles().catch((err) => console.error("Passive cleanup error:", err));

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { token: { contains: search } },
      { studentName: { contains: search } },
    ];
  }
  if (status) where.status = status;

  const submissions = await prisma.submission.findMany({
    where,
    include: { files: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(submissions);
}
