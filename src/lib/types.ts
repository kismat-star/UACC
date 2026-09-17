import type { File as PrismaFile, Session as PrismaSession } from "@prisma/client";

export type FileType = "image" | "pdf";

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
  studentName: string | null;
  createdAt: string; // ISO
  printedAt: string | null;
  printed: boolean;
  expiresAt: string | null;
}

export interface SettingsShape {
  autoDeleteAfterPrint: boolean;
  retentionHours: number;
}

type PrismaFileWithCount = PrismaFile & { _count?: { files?: number } };

/**
 * Map a Prisma File row into the API-safe FileShape.
 * Handles Date -> ISO conversion. fileType is constrained to "image" | "pdf".
 */
export function toFileShape(prismaFile: PrismaFile): FileShape {
  const fileType: FileType =
    prismaFile.fileType === "image" || prismaFile.fileType === "pdf"
      ? (prismaFile.fileType as FileType)
      : prismaFile.mimeType.startsWith("image/")
        ? "image"
        : "pdf";

  return {
    id: prismaFile.id,
    sessionId: prismaFile.sessionId,
    filename: prismaFile.filename,
    storedName: prismaFile.storedName,
    mimeType: prismaFile.mimeType,
    size: prismaFile.size,
    fileType,
    studentName: prismaFile.studentName,
    createdAt: prismaFile.createdAt.toISOString(),
    printedAt: prismaFile.printedAt ? prismaFile.printedAt.toISOString() : null,
    printed: prismaFile.printed,
    expiresAt: prismaFile.expiresAt ? prismaFile.expiresAt.toISOString() : null,
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
