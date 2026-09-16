import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteSubmissionAndFiles } from "@/lib/cleanup";
import { removeFile } from "@/lib/storage";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { files: true },
  });

  if (!submission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(submission);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { status, rejectionReason, deleteFilesNow } = body;

  const data: Record<string, unknown> = { status };
  if (status === "COMPLETED") data.completedAt = new Date();
  if (status === "REJECTED" && rejectionReason) data.rejectionReason = rejectionReason;

  const submission = await prisma.submission.update({
    where: { id },
    data,
    include: { files: true },
  });

  // If user requested deleting files immediately upon complete/print
  if (deleteFilesNow && submission.files.length > 0) {
    for (const f of submission.files) {
      await removeFile(f.storagePath);
    }
  }

  return NextResponse.json(submission);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const success = await deleteSubmissionAndFiles(id);

  if (!success) {
    return NextResponse.json({ error: "Failed to delete submission" }, { status: 404 });
  }

  return NextResponse.json({ success: true, message: "Submission and files deleted permanently" });
}
