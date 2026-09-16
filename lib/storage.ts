import { put, del } from "@vercel/blob";
import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export const isVercelBlobEnabled = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/**
 * Saves a file either to Vercel Blob (cloud) or local disk.
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
    const blob = await put(uniqueName, file, {
      access: "public",
      addRandomSuffix: true,
    });
    return {
      storagePath: blob.url,
      url: blob.url,
    };
  } else {
    // Local disk fallback
    const uploadsDir = path.join(process.cwd(), "uploads");
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
      // Local disk filename
      const uploadsDir = path.join(process.cwd(), "uploads");
      const filePath = path.join(uploadsDir, storagePath);
      await unlink(filePath);
      return true;
    }
  } catch (err) {
    console.error(`Failed to remove file ${storagePath}:`, err);
    return false;
  }
}
