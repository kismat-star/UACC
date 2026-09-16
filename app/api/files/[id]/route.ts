import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "File not found" }, { status: 404 });

  // If stored in Vercel Blob (URL)
  if (file.storagePath.startsWith("http://") || file.storagePath.startsWith("https://")) {
    return NextResponse.redirect(file.storagePath);
  }

  // If stored locally on disk
  const filePath = path.join(process.cwd(), "uploads", file.storagePath);

  try {
    const buffer = await readFile(filePath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.originalName)}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "File not found on disk" }, { status: 404 });
  }
}
