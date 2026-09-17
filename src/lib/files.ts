import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { put, del } from "@vercel/blob";
import type { FileType } from "@/lib/types";

export const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB

export function isVercelBlobEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export function getLocalUploadsDir(): string {
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    return path.join(os.tmpdir(), "uploads");
  }
  return path.join(process.cwd(), "uploads");
}

async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(getLocalUploadsDir(), { recursive: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      throw err;
    }
  }
}

void ensureUploadDir();

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned.length > 0 ? cleaned : "file";
}

export function isImage(mimeType: string): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("image/");
}

export function isPdf(mimeType: string): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase() === "application/pdf";
}

export function isAllowedMime(mimeType: string): boolean {
  return isImage(mimeType) || isPdf(mimeType);
}

export function fileTypeFromMime(mimeType: string): FileType {
  return isImage(mimeType) ? "image" : "pdf";
}

import { PDFDocument } from "pdf-lib";

export interface SavedUpload {
  storedName: string;
  filename: string;
  mimeType: string;
  size: number;
  fileType: FileType;
  pageCount: number;
}

export async function saveUpload(file: File): Promise<SavedUpload> {
  const mimeType = file.type || "application/octet-stream";

  if (!isAllowedMime(mimeType)) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  const size = file.size;
  if (size <= 0) {
    throw new Error("File is empty");
  }
  if (size > MAX_FILE_SIZE) {
    throw new Error(`File too large (max ${MAX_FILE_SIZE} bytes, got ${size})`);
  }

  const fileType = fileTypeFromMime(mimeType);
  const filename = sanitizeFilename(file.name || "file");

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Auto page count
  let pageCount = 1;
  if (fileType === "pdf") {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      pageCount = pdfDoc.getPageCount();
    } catch (e) {
      console.warn("Could not read PDF page count, defaulting to 1", e);
      pageCount = 1;
    }
  }

  if (isVercelBlobEnabled()) {
    const blob = await put(`uploads/${randomUUID()}-${filename}`, buffer, {
      access: "public",
      contentType: mimeType,
    });
    return {
      storedName: blob.url,
      filename,
      mimeType,
      size,
      fileType,
      pageCount,
    };
  }

  const uploadsDir = getLocalUploadsDir();
  await fs.mkdir(uploadsDir, { recursive: true });

  const storedName = `${randomUUID()}-${filename}`;
  await fs.writeFile(path.join(uploadsDir, storedName), buffer);

  return {
    storedName,
    filename,
    mimeType,
    size,
    fileType,
    pageCount,
  };
}

export function assertSafeStoredName(storedName: string): void {
  if (
    typeof storedName !== "string" ||
    storedName.length === 0 ||
    storedName.includes("/") ||
    storedName.includes("\\") ||
    storedName.includes("..") ||
    storedName.includes("\0")
  ) {
    throw new Error("Invalid storedName");
  }
}

export async function readUpload(
  storedName: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  if (storedName.startsWith("http://") || storedName.startsWith("https://")) {
    const response = await fetch(storedName);
    if (!response.ok) {
      throw new Error(`Failed to fetch blob: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: response.headers.get("content-type") || "",
    };
  }

  assertSafeStoredName(storedName);
  const buffer = await fs.readFile(path.join(getLocalUploadsDir(), storedName));
  return { buffer, mimeType: "" };
}

export async function deleteUpload(storedName: string): Promise<void> {
  if (typeof storedName !== "string" || storedName.length === 0) return;

  if (storedName.startsWith("http://") || storedName.startsWith("https://")) {
    try {
      if (isVercelBlobEnabled()) {
        await del(storedName);
      }
    } catch (err) {
      console.error("[storage] failed to delete from blob:", err);
    }
    return;
  }

  try {
    assertSafeStoredName(storedName);
  } catch {
    return;
  }
  try {
    await fs.unlink(path.join(getLocalUploadsDir(), storedName));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      throw err;
    }
  }
}
