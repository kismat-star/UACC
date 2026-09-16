import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateToken } from "@/lib/tokens";
import { saveFile } from "@/lib/storage";

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
];
const MAX_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const studentName = (formData.get("studentName") as string)?.trim();
    if (!studentName) {
      return NextResponse.json({ error: "Student name is required" }, { status: 400 });
    }

    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "At least one file is required" }, { status: 400 });
    }

    // Validate files
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `File type not allowed: ${file.name}. Only PDF, JPG, PNG are accepted.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_SIZE) {
        return NextResponse.json(
          { error: `File too large: ${file.name}. Maximum 20 MB per file.` },
          { status: 400 }
        );
      }
    }

    const savedFiles: { originalName: string; storagePath: string; mimeType: string; fileSize: number }[] = [];

    // Save each file (Vercel Blob in cloud or local/tmp disk in dev)
    for (const file of files) {
      const { storagePath } = await saveFile(file);
      savedFiles.push({
        originalName: file.name,
        storagePath,
        mimeType: file.type,
        fileSize: file.size,
      });
    }

    const token = await generateToken();

    const submission = await prisma.submission.create({
      data: {
        token,
        studentName,
        status: "SUBMITTED",
        files: {
          create: savedFiles,
        },
      },
      include: { files: true },
    });

    return NextResponse.json({ success: true, token: submission.token, id: submission.id });
  } catch (err: unknown) {
    console.error("Submit error details:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: `Upload error: ${message}` }, { status: 500 });
  }
}
