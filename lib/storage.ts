import { put, del } from "@vercel/blob";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import os from "os";
import { v4 as uuidv4 } from "uuid";

export const isVercelBlobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export function getLocalUploadsDir(): string {
  // On Vercel or cloud serverless, process.cwd() is read-only. Use os.tmpdir()
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return path.join(os.tmpdir(), "college-print-uploads");
  }
  return path.join(process.cwd(), "uploads");
}

/**
 * Saves a file either to Vercel Blob (cloud) or local/tmp disk.
 * Returns the storage identifier (URL for blob, or filename for local disk).
 */
export async function saveFile(
  file: File,
  prefix = "submissions"
): Promise<{ storagePath: string; url?: string }> {
  const ext = file.name.split(".").pop() || "bin";
  const uniqueName = `${prefix}/${uuidv4()}.${ext}`;

  if (isVercelBlobEnabled()) {
    // Cloud storage on Vercel
    const buffer = Buffer.from(await file.arrayBuffer());
    const blob = await put(uniqueName, buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type || "application/octet-stream",
    });
    return {
      storagePath: blob.url,
      url: blob.url,
    };
  } else {
    // Local / tmp disk fallback (works both locally and in serverless /tmp)
    const uploadsDir = getLocalUploadsDir();
    await mkdir(uploadsDir, { recursive: true });
    const filename = `${uuidv4()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return {
      storagePath: filename,
    };
  }
}

/**
 * Deletes a file either from Vercel Blob or local disk.
 */
export async function removeFile(storagePath: string): Promise<boolean> {
  try {
    if (storagePath.startsWith("http://") || storagePath.startsWith("https://")) {
      // Vercel Blob URL
      await del(storagePath);
      return true;
    } else {
      // Local or /tmp disk filename
      const uploadsDir = getLocalUploadsDir();
      const filePath = path.join(uploadsDir, storagePath);
      await unlink(filePath);
      return true;
    }
  } catch (err) {
    console.error(`Failed to remove file ${storagePath}:`, err);
    return false;
  }
}
