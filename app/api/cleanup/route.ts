import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  cleanupExpiredFiles,
  getRetentionMinutes,
  setRetentionMinutes,
} from "@/lib/cleanup";
import { readdir, stat } from "fs/promises";
import path from "path";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const retentionMinutes = await getRetentionMinutes();

  let diskFilesCount = 0;
  let diskTotalBytes = 0;

  try {
    const uploadsDir = path.join(process.cwd(), "uploads");
    const files = await readdir(uploadsDir);
    diskFilesCount = files.length;
    for (const f of files) {
      try {
        const s = await stat(path.join(uploadsDir, f));
        diskTotalBytes += s.size;
      } catch {
        // ignore
      }
    }
  } catch {
    // folder might not exist yet
  }

  return NextResponse.json({
    retentionMinutes,
    diskFilesCount,
    diskTotalBytes,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body.retentionMinutes === "number" && body.retentionMinutes > 0) {
      await setRetentionMinutes(body.retentionMinutes);
    }

    const result = await cleanupExpiredFiles();

    return NextResponse.json({
      success: true,
      ...result,
      currentRetention: await getRetentionMinutes(),
    });
  } catch (err) {
    console.error("Cleanup API error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
