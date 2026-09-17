# Task 3 — full-stack-developer (API routes)

## Scope
Built the entire backend API surface + shared lib helpers for the QR File Collector app, following the worklog CONTRACT exactly. Did NOT touch the frontend (`src/app/page.tsx`, `layout.tsx`, `globals.css`) — that's another agent.

## Files created

### Lib helpers (`src/lib/`)
- `types.ts` — `FileType`, `SessionShape`, `FileShape`, `SettingsShape` interfaces; `toFileShape(prismaFile)` and `toSessionShape(prismaSession)` mappers (Date→ISO, `_count.files`→`fileCount`).
- `files.ts` — `UPLOAD_DIR` (auto-mkdir on import), `sanitizeFilename`, `saveUpload` (validates image/* or application/pdf, ≤15MB, writes `${randomUUID()}-${sanitized}`), `readUpload` (path-traversal guard via `assertSafeStoredName`), `deleteUpload` (ignores ENOENT), `isImage` / `isPdf` helpers.
- `ws-notify.ts` — `notify(event, payload)` POSTs to `http://localhost:3003/internal/notify` with a 3s AbortController timeout; never throws, logs to console on failure.
- `settings.ts` — `getSettings()` (defaults `autoDeleteAfterPrint=false`, `retentionHours=1`), `updateSettings(patch)` (upserts singleton rows keyed `autoDeleteAfterPrint` / `retentionHours`), `computeExpiresAt(retentionHours)` (null when ≤0).

### API routes (`src/app/api/`)
- `sessions/route.ts` — GET list (with `_count.files`), POST create with unique 6-char alphanumeric code (collision-retry), best-effort `session-updated` notify.
- `sessions/[id]/route.ts` — GET, PATCH (`closed`, `name`), DELETE (loads files → `deleteUpload` each → cascade).
- `sessions/by-code/[code]/route.ts` — GET by uppercase code, 404 on miss.
- `sessions/[id]/files/route.ts` — GET cleans expired rows silently (no notify per task spec) before returning remaining files ordered by createdAt desc.
- `upload/route.ts` — POST multipart. Validates `code` exists + session not closed (404/400). `saveUpload` (mime/size validation), computes `expiresAt` from settings, creates File row, fires `file-uploaded` notify.
- `files/[id]/route.ts` — GET streams raw file (Content-Type from DB, `?download=1` sets attachment `Content-Disposition` with RFC 5987 UTF-8 filename). DELETE removes disk + DB, fires `file-deleted`. PATCH `printed` / `expiresAt`; if `printed` just turned on, fires `file-printed`, and if `autoDeleteAfterPrint` is on, also deletes the file (disk + DB) + fires `file-deleted`, returning the last-known `FileShape`.
- `print/[id]/route.ts` — GET returns text/html: image variant uses `<img onload=print>`; PDF variant uses `<iframe onload=print>`. File id is `encodeURIComponent`-escaped; filename HTML-escaped in title/alt.
- `cleanup/route.ts` — POST sweeps all expired files globally, returns `{ deleted: number }`.
- `settings/route.ts` — GET returns `{ autoDeleteAfterPrint, retentionHours, deleteAfterPrint }` (alias kept for contract compatibility). PATCH accepts `autoDeleteAfterPrint`/`retentionHours` (and legacy `deleteAfterPrint` alias).

## Notes / decisions
- Used `globalThis.crypto.getRandomValues` (Node WebCrypto) for code generation — safe in Next 16 Node runtime.
- Path-traversal guard in `files.ts` rejects storedNames containing `/`, `\`, `..`, or `\0`.
- All WS notify calls are `void`-prefixed (best-effort, non-blocking).
- Did not modify `prisma/schema.prisma` (per task instructions).
- Did not start the dev server (already running).
- Frontend (page.tsx) intentionally untouched — separate agent owns it.

## Validation
- `bun run lint` exits 0, no errors in any created file.
