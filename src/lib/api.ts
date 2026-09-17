import type { FileShape, SessionShape, SettingsShape } from "@/lib/types";

/* ---------- Sessions ---------- */

export async function listSessions(): Promise<SessionShape[]> {
  const r = await fetch("/api/sessions", { cache: "no-store" });
  if (!r.ok) throw new Error("Failed to load sessions");
  const d = await r.json();
  return d.sessions as SessionShape[];
}

export async function createSession(name: string): Promise<SessionShape> {
  const r = await fetch("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({ error: "Failed" }));
    throw new Error(e.error || "Failed to create session");
  }
  const d = await r.json();
  return d.session as SessionShape;
}

export async function getSessionByCode(code: string): Promise<SessionShape> {
  const r = await fetch(`/api/sessions/by-code/${encodeURIComponent(code)}`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Session not found");
  const d = await r.json();
  return d.session as SessionShape;
}

export async function updateSession(
  id: string,
  patch: { closed?: boolean; name?: string },
): Promise<SessionShape> {
  const r = await fetch(`/api/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Failed to update session");
  const d = await r.json();
  return d.session as SessionShape;
}

export async function deleteSession(id: string): Promise<void> {
  const r = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete session");
}

/* ---------- Files ---------- */

export async function listFiles(sessionId: string): Promise<FileShape[]> {
  const r = await fetch(`/api/sessions/${sessionId}/files`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Failed to load files");
  const d = await r.json();
  return d.files as FileShape[];
}

export async function deleteFile(id: string): Promise<void> {
  const r = await fetch(`/api/files/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Failed to delete file");
}

export async function markPrinted(id: string, printed: boolean): Promise<FileShape | null> {
  const r = await fetch(`/api/files/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ printed }),
  });
  if (!r.ok) throw new Error("Failed to update file");
  // If the file was auto-deleted after print, the API still returns the
  // last-known shape (or { file: null }). Treat gracefully.
  const d = await r.json().catch(() => ({ file: null }));
  return (d.file as FileShape | null) ?? null;
}

export function fileUrl(id: string, download = false): string {
  return `/api/files/${id}${download ? "?download=1" : ""}`;
}

export function printUrl(id: string): string {
  return `/api/print/${id}`;
}

export function printPosterUrl(sessionId: string): string {
  return `/api/print-poster/${sessionId}`;
}

export function printAllUrl(ids: string[]): string {
  return `/api/print-all?ids=${ids.map(encodeURIComponent).join(",")}`;
}

export function sessionZipUrl(sessionId: string): string {
  return `/api/sessions/${sessionId}/zip`;
}

/* ---------- Upload (student) ---------- */

export async function uploadFile(
  code: string,
  file: File,
  studentName: string,
  onProgress?: (pct: number) => void,
): Promise<FileShape> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("code", code);
    if (studentName.trim()) form.append("studentName", studentName.trim());
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const d = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(d.file as FileShape);
        } else {
          reject(new Error(d.error || "Upload failed"));
        }
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(form);
  });
}

/* ---------- Settings / cleanup ---------- */

export async function getSettings(): Promise<SettingsShape> {
  const r = await fetch("/api/settings", { cache: "no-store" });
  if (!r.ok) return { autoDeleteAfterPrint: false, retentionHours: 1 };
  const d = await r.json();
  // Accept both `{ settings: {...} }` and a flat object for resilience.
  const s = (d.settings ?? d) as Partial<SettingsShape>;
  return {
    autoDeleteAfterPrint: Boolean(s.autoDeleteAfterPrint),
    retentionHours:
      typeof s.retentionHours === "number" ? s.retentionHours : 1,
  };
}

export async function updateSettings(
  patch: Partial<SettingsShape>,
): Promise<SettingsShape> {
  const r = await fetch("/api/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error("Failed to update settings");
  const d = await r.json();
  return d.settings as SettingsShape;
}

export async function runCleanup(): Promise<number> {
  const r = await fetch("/api/cleanup", { method: "POST" });
  if (!r.ok) throw new Error("Cleanup failed");
  const d = await r.json();
  return d.deleted as number;
}
