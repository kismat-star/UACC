import type { File as PrismaFile, Session as PrismaSession } from "@prisma/client";

export type FileType = "image" | "pdf" | "url" | "text" | "other";

export interface SessionShape {
  id: string;
  name: string;
  code: string;
  createdAt: string; // ISO
  closed: boolean;
  fileCount: number;
}

export interface FileShape {
  id: string;
  sessionId: string;
  filename: string;
  storedName: string;
  mimeType: string;
  size: number;
  fileType: FileType;
  pageCount: number;
  studentName: string | null;
  createdAt: string; // ISO
  printedAt: string | null;
  printed: boolean;
  expiresAt: string | null;
  content?: string | null;
}

export interface SettingsShape {
  autoDeleteAfterPrint: boolean;
  retentionHours: number;
  totalPrintsCount: number;
}

type PrismaFileWithCount = PrismaFile & { _count?: { files?: number } };

/**
 * Map a Prisma File row into the API-safe FileShape.
 * Handles Date -> ISO conversion. Supports image, pdf, url, text.
 */
export function toFileShape(
  prismaFile: Omit<PrismaFile, "data"> & { data?: unknown },
): FileShape {
  let fileType: FileType = "other";
  if (
    prismaFile.fileType === "image" ||
    prismaFile.fileType === "pdf" ||
    prismaFile.fileType === "url" ||
    prismaFile.fileType === "text"
  ) {
    fileType = prismaFile.fileType as FileType;
  } else if (prismaFile.mimeType.startsWith("image/")) {
    fileType = "image";
  } else if (prismaFile.mimeType === "application/pdf") {
    fileType = "pdf";
  }

  return {
    id: prismaFile.id,
    sessionId: prismaFile.sessionId,
    filename: prismaFile.filename,
    storedName: prismaFile.storedName,
    mimeType: prismaFile.mimeType,
    size: prismaFile.size,
    fileType,
    pageCount: prismaFile.pageCount ?? 1,
    studentName: prismaFile.studentName,
    createdAt: prismaFile.createdAt.toISOString(),
    printedAt: prismaFile.printedAt ? prismaFile.printedAt.toISOString() : null,
    printed: prismaFile.printed,
    expiresAt: prismaFile.expiresAt ? prismaFile.expiresAt.toISOString() : null,
    content:
      fileType === "url" || fileType === "text"
        ? prismaFile.storedName
        : null,
  };
}

/**
 * Map a Prisma Session (optionally with _count.files) into SessionShape.
 * If the session was loaded via include: { _count: { select: { files: true } } },
 * the fileCount is read from _count.files. Otherwise 0.
 */
export function toSessionShape(
  prismaSession: PrismaSession & {
    _count?: { files?: number };
    files?: unknown[];
  },
): SessionShape {
  let fileCount = 0;
  if (typeof prismaSession._count?.files === "number") {
    fileCount = prismaSession._count.files;
  } else if (Array.isArray((prismaSession as PrismaFileWithCount).files)) {
    // Fallback: if files were actually included as a relation array.
    fileCount = ((prismaSession as { files: unknown[] }).files as unknown[]).length;
  }
  return {
    id: prismaSession.id,
    name: prismaSession.name,
    code: prismaSession.code,
    createdAt: prismaSession.createdAt.toISOString(),
    closed: prismaSession.closed,
    fileCount,
  };
}
