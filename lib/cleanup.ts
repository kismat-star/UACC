import { prisma } from "@/lib/prisma";
import { removeFile } from "@/lib/storage";
import { stat, readdir } from "fs/promises";
import path from "path";

const DEFAULT_RETENTION_MINUTES = 30;

export async function getRetentionMinutes(): Promise<number> {
  try {
    const setting = await prisma.setting.findUnique({
      where: { key: "retention_minutes" },
    });
    if (setting && setting.value) {
      const val = parseInt(setting.value, 10);
      if (!isNaN(val) && val > 0) return val;
    }
  } catch (err) {
    console.error("Error reading retention setting:", err);
  }
  return DEFAULT_RETENTION_MINUTES;
}

export async function setRetentionMinutes(minutes: number): Promise<number> {
  await prisma.setting.upsert({
    where: { key: "retention_minutes" },
    update: { value: String(minutes) },
    create: { key: "retention_minutes", value: String(minutes) },
  });
  return minutes;
}

/**
 * Automatically deletes files older than retentionMinutes or completed files.
 */
export async function cleanupExpiredFiles(): Promise<{ deletedFiles: number; deletedSubmissions: number }> {
  let deletedFilesCount = 0;
  let deletedSubmissionsCount = 0;

  try {
    const retentionMinutes = await getRetentionMinutes();
    const expiryThreshold = new Date(Date.now() - retentionMinutes * 60 * 1000);
    const completedThreshold = new Date(Date.now() - 5 * 60 * 1000); // completed > 5 mins ago

    // Find submissions that are either expired by age or completed > 5m ago
    const expiredSubmissions = await prisma.submission.findMany({
      where: {
        OR: [
          { createdAt: { lt: expiryThreshold } },
          {
            status: "COMPLETED",
            completedAt: { lt: completedThreshold },
          },
        ],
      },
      include: { files: true },
    });

    for (const sub of expiredSubmissions) {
      for (const file of sub.files) {
        await removeFile(file.storagePath);
        deletedFilesCount++;
      }

      // Delete submission and cascading file records
      try {
        await prisma.submission.delete({
          where: { id: sub.id },
        });
        deletedSubmissionsCount++;
      } catch (err) {
        console.error(`Failed to delete submission ${sub.id}:`, err);
      }
    }

    // Local dev safety sweep: clean local disk if folder exists
    try {
      const uploadsDir = path.join(process.cwd(), "uploads");
      const filesInDir = await readdir(uploadsDir);
      const now = Date.now();
      for (const filename of filesInDir) {
        const filePath = path.join(uploadsDir, filename);
        try {
          const fileStat = await stat(filePath);
          if (now - fileStat.mtimeMs > retentionMinutes * 60 * 1000) {
            await removeFile(filename);
            deletedFilesCount++;
          }
        } catch {
          // ignore individual stat/unlink errors
        }
      }
    } catch {
      // uploads folder might not exist in cloud/serverless
    }
  } catch (error) {
    console.error("Cleanup expired files error:", error);
  }

  return { deletedFiles: deletedFilesCount, deletedSubmissions: deletedSubmissionsCount };
}

/**
 * Deletes all files and the database record for a single submission immediately.
 */
export async function deleteSubmissionAndFiles(submissionId: string): Promise<boolean> {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { files: true },
    });

    if (!submission) return false;

    for (const file of submission.files) {
      await removeFile(file.storagePath);
    }

    await prisma.submission.delete({
      where: { id: submissionId },
    });

    return true;
  } catch (err) {
    console.error(`Error deleting submission ${submissionId}:`, err);
    return false;
  }
}

/**
 * Deletes a single file and its database entry.
 */
export async function deleteSingleFile(fileId: string): Promise<boolean> {
  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) return false;

    await removeFile(file.storagePath);

    await prisma.file.delete({
      where: { id: fileId },
    });

    return true;
  } catch (err) {
    console.error(`Error deleting file ${fileId}:`, err);
    return false;
  }
}
