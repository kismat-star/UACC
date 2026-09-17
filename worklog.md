# Project Worklog — QR File Collector

## Project Overview
A QR-based file collection system for classroom/office use:
- **Admin** generates a QR code for a "collection session".
- **Students** scan the QR and land on a mobile-friendly upload page (image or PDF).
- **Admin** receives files in real time, can **view / download / print / delete** them.
- Files are **never stored permanently**: manual delete, delete-after-print, and time-based auto-delete are all supported.

## Architecture
- **Single visible route** `/` (Next.js App Router). The page switches between two views based on the `?upload=CODE` query param:
  - No `upload` param → **Admin Dashboard**
  - `?upload=CODE` present → **Student Upload view** (the QR points here)
- **Database**: SQLite via Prisma (`Session`, `File`, `Setting` models) — see `prisma/schema.prisma`.
- **File storage**: disk under `/home/z/my-project/uploads/` (files referenced by `storedName`). Metadata in DB. Deleting a file removes both DB row and disk file.
- **Real-time**: WebSocket mini-service on port **3003** (`mini-services/file-notify/`) pushes instant notifications to the admin. The Next.js API notifies the WS service over HTTP `POST http://localhost:3003/internal/notify` (server-to-server, no gateway). Polling every 4s is the reliable fallback on the admin page.
- **Auto-delete**: cleanup-on-read (the list-files API deletes expired rows before returning) + a manual "Cleanup now" button + the scheduled `webDevReview` cron.

---

## CONTRACT (all agents MUST follow this exactly)

### Data shapes
```ts
type FileType = "image" | "pdf"

interface SessionShape {
  id: string
  name: string
  code: string        // short code used in ?upload=CODE
  createdAt: string   // ISO
  closed: boolean
  fileCount: number   // computed when listing
}

interface FileShape {
  id: string
  sessionId: string
  filename: string
  storedName: string
  mimeType: string
  size: number
  fileType: FileType
  studentName: string | null
  createdAt: string   // ISO
  printedAt: string | null
  printed: boolean
  expiresAt: string | null
}
```

### API routes (Next.js Route Handlers, base path `/api`, port 3000)
| Method | Path | Body / Query | Response |
|--------|------|--------------|----------|
| GET    | `/api/sessions` | — | `{ sessions: SessionShape[] }` |
| POST   | `/api/sessions` | `{ name: string }` | `{ session: SessionShape }` |
| GET    | `/api/sessions/[code]` | — | `{ session: SessionShape }` (by code) |
| PATCH  | `/api/sessions/[id]` | `{ closed?: boolean, name?: string }` | `{ session: SessionShape }` |
| DELETE | `/api/sessions/[id]` | — | `{ ok: true }` (also deletes files on disk) |
| GET    | `/api/sessions/[id]/files` | — | `{ files: FileShape[] }` (cleans expired first) |
| POST   | `/api/upload` | multipart: `code` (string), `studentName?` (string), `file` (File) | `{ file: FileShape }` |
| GET    | `/api/files/[id]` | — | streams the raw file (inline) for view/iframe |
| GET    | `/api/files/[id]?download=1` | — | streams file with `Content-Disposition: attachment` |
| DELETE | `/api/files/[id]` | — | `{ ok: true }` (removes disk + DB) |
| PATCH  | `/api/files/[id]` | `{ printed?: boolean, expiresAt?: string\|null }` | `{ file: FileShape }` |
| GET    | `/api/print/[id]` | — | HTML page that embeds the file and auto-calls `window.print()` on load |
| POST   | `/api/cleanup` | — | `{ deleted: number }` (deletes expired files) |
| GET    | `/api/settings` | — | `{ autoDeleteAfterPrint: boolean, retentionHours: number, deleteAfterPrint: boolean }` |
| PATCH  | `/api/settings` | `{ autoDeleteAfterPrint?: boolean, retentionHours?: number }` | `{ settings }` |

#### Upload validation
- Accepted mime types: `image/*` (png, jpeg, webp, gif, heic) and `application/pdf`.
- Max size: 15 MB.
- `fileType` = `mimeType.startsWith("image/") ? "image" : "pdf"`.
- `storedName` = `${cuid()}-${sanitized-original-name}`.
- On success, the API POSTs to `http://localhost:3003/internal/notify` with `{ event: "file-uploaded", payload: { file: FileShape } }` (best-effort, wrapped in try/catch).

#### Settings defaults
- `autoDeleteAfterPrint`: `false`
- `retentionHours`: `1` (files uploaded with auto-expire get `expiresAt = now + retentionHours`). Set retentionHours to `0` to disable time-based expiry.

### WebSocket service (port 3003)
- **socket.io** server, `path: "/"` (REQUIRED by gateway), CORS `*`.
- Admin client connects with `io("/?XTransformPort=3003")`, emits `subscribe` `{ room: "admin" }`.
- HTTP `POST /internal/notify` body `{ event: string, payload: any }` → broadcasts `event`/`payload` to the `admin` room. Returns `{ ok: true }`.
- Events broadcast to admin: `file-uploaded` `{ file }`, `file-deleted` `{ fileId }`, `file-printed` `{ file }`, `session-updated` `{ session }`.

### Frontend views (`src/app/page.tsx`)
- Uses `useSearchParams()` to read `upload` param.
- **Admin Dashboard**: header with app title + settings button; left card = QR code for the active session (with session switcher / create session); right/main = live file grid (poll every 4s + WS instant update). Each file card: thumbnail/icon, name, student, size, time, badges (printed), actions (View, Download, Print, Delete). Footer sticky at bottom with stats.
- **Student Upload view**: big friendly header with session name, file picker (accept `image/*,application/pdf`, multiple allowed), camera capture via `capture="environment"`, preview thumbnails, optional student name, upload button with progress, success state, footer sticky.

### File storage helper (`src/lib/files.ts`)
- `UPLOAD_DIR = path.join(process.cwd(), "uploads")`
- `saveUpload(file: File): Promise<{storedName, mimeType, size, fileType, filename}>`
- `readUpload(storedName): Promise<Buffer>`
- `deleteUpload(storedName): Promise<void>` (ignore missing)
- `sanitizeFilename(name): string`

### WS notify helper (`src/lib/ws-notify.ts`)
- `notify(event: string, payload: unknown): Promise<void>` — POST to `http://localhost:3003/internal/notify`, best-effort.

---

## Task Progress

### Task ID: 1 — Foundation (DONE by main agent)
- Installed `qrcode.react`, `socket.io`, `socket.io-client`.
- Wrote `prisma/schema.prisma` (Session / File / Setting) and ran `bun run db:push`.
- Created `uploads/` and `mini-services/file-notify/` directories.
- Authored this worklog + CONTRACT.

Stage Summary:
- DB ready. Packages ready. Contract locked. Ready for parallel build of WS service (Task 2) and API routes (Task 3).

---
Task ID: 3
Agent: full-stack-developer (API routes)
Task: Build all API routes + lib helpers

Work Log:
- Read worklog.md + CONTRACT; inspected existing schema, db client, eslint config.
- Created `src/lib/types.ts` with `FileType`, `SessionShape`, `FileShape`, `SettingsShape`, and `toFileShape` / `toSessionShape` mappers (Date→ISO, `_count.files`→`fileCount`).
- Created `src/lib/files.ts` with `UPLOAD_DIR` (auto-mkdir on import), `sanitizeFilename`, `saveUpload` (validates image/* or application/pdf, ≤15MB, `${randomUUID()}-${sanitized}`), `readUpload` + `assertSafeStoredName` (path-traversal guard), `deleteUpload` (ignores ENOENT), `isImage`/`isPdf` helpers.
- Created `src/lib/ws-notify.ts` — `notify(event, payload)` POSTs to `http://localhost:3003/internal/notify` with 3s AbortController timeout, never throws.
- Created `src/lib/settings.ts` — `getSettings` (defaults `false`/`1`), `updateSettings` (upsert), `computeExpiresAt` (null when retentionHours ≤0).
- Created all API routes:
  - `sessions/route.ts` (GET list, POST create with unique 6-char code + notify)
  - `sessions/[id]/route.ts` (GET, PATCH, DELETE with file cleanup)
  - `sessions/by-code/[code]/route.ts` (GET by uppercase code, 404 on miss)
  - `sessions/[id]/files/route.ts` (GET silently sweeps expired first)
  - `upload/route.ts` (POST multipart: validate code/session, saveUpload, compute expiresAt, create row, notify file-uploaded)
  - `files/[id]/route.ts` (GET streams raw file with optional `?download=1`; DELETE; PATCH with printed/expiresAt, auto-delete-after-print handling, notify file-printed/file-deleted)
  - `print/[id]/route.ts` (GET returns text/html — `<img>` for images, `<iframe>` for PDF — auto window.print() on load)
  - `cleanup/route.ts` (POST deletes all expired files globally)
  - `settings/route.ts` (GET, PATCH upsert)
- Ran `bun run lint` — passes with exit code 0, no errors.
- Did not touch `prisma/schema.prisma`, did not run `db:push`, did not modify the frontend, did not start the dev server.

Stage Summary:
- All API routes + lib helpers in place and lint-clean.
- Files created (13 new):
  - src/lib/types.ts
  - src/lib/files.ts
  - src/lib/ws-notify.ts
  - src/lib/settings.ts
  - src/app/api/sessions/route.ts
  - src/app/api/sessions/[id]/route.ts
  - src/app/api/sessions/by-code/[code]/route.ts
  - src/app/api/sessions/[id]/files/route.ts
  - src/app/api/upload/route.ts
  - src/app/api/files/[id]/route.ts
  - src/app/api/print/[id]/route.ts
  - src/app/api/cleanup/route.ts
  - src/app/api/settings/route.ts
- WS mini-service (port 3003) is contacted best-effort on every file/session mutation via `notify()`.
- Frontend agent can now consume all routes per the CONTRACT table.

---
Task ID: 2
Agent: full-stack-developer (WebSocket mini-service)
Task: Build the WebSocket mini-service at mini-services/file-notify/

Work Log:
- Read /home/z/my-project/worklog.md to load the full project context + CONTRACT.
- Read examples/websocket/server.ts and /home/z/my-project/Caddyfile for reference on socket.io path="/" + Caddy gateway conventions.
- Inspected /home/z/my-project/node_modules/engine.io/build/server.js to confirm a critical behaviour: with `path: "/"`, engine.io's internal `check(req)` returns true for EVERY URL (since `path === req.url.slice(0, path.length)` is always true), so engine.io intercepts every HTTP request before the http server's own request listener would normally fire. This means a plain `createServer(handler)` cannot intercept `/internal/notify` on its own.
- Solution: register an engine.io middleware via `io.engine.use((req, res, next) => intercept(req, res) || next())`. Middlewares run inside engine.io's `_applyMiddlewares` BEFORE `verify()`, so we can short-circuit `/internal/notify` POST + OPTIONS preflight, and `next()` for everything else so socket.io handles its own handshake/polling/upgrade requests.
- Created `mini-services/file-notify/package.json` — independent bun project, `"type": "module"`, name `file-notify-service`, scripts `dev: "bun --hot index.ts"` and `start: "bun index.ts"`, single dep `socket.io@^4.8.3`.
- Created `mini-services/file-notify/index.ts`:
  - `http.createServer` with a request listener that handles `/internal/notify` POST + OPTIONS preflight (defensive fallback for any request engine.io might pass through).
  - `new Server(httpServer, { path: "/", cors: { origin: "*", methods: ["GET","POST","OPTIONS"] }, pingTimeout: 60s, pingInterval: 25s })`.
  - `io.engine.use(...)` middleware that intercepts `/internal/notify` POST (parses JSON body `{event, payload}`, calls `io.to("admin").emit(event, payload)`, returns `200 {"ok":true}`) and OPTIONS preflight (returns `204` with CORS headers), then `next()` for everything else.
  - All responses get CORS headers: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET,POST,OPTIONS`, `Access-Control-Allow-Headers: Content-Type`.
  - `io.on("connection")` → on `subscribe` event with `{ room: "admin" }`, calls `socket.join("admin")`.
  - Logs connections, subscriptions, broadcasts, and disconnects, all prefixed with `[file-notify]`.
  - Graceful SIGTERM/SIGINT shutdown via `await io.close()` (which closes namespaces, engine.io, AND the http server — so we do NOT also call `httpServer.close()` to avoid the "Server is not running" double-close error).
- Ran `cd mini-services/file-notify && bun install` → 22 packages, socket.io@4.8.3 installed into the mini-service's own node_modules.
- Started in background: `cd mini-services/file-notify && (nohup bun run dev > /home/z/my-project/file-notify.log 2>&1 &)`.
- Verified startup log shows: `[file-notify] WebSocket server running on port 3003`.
- Verified `curl -s -X POST http://localhost:3003/internal/notify -H "Content-Type: application/json" -d '{"event":"test","payload":{"hi":1}}'` returns `{"ok":true}` and the log shows `[file-notify] broadcast event="test" to room "admin"`.
- Verified OPTIONS preflight returns 204 with all 3 CORS headers.
- Verified CORS headers present on POST responses too.
- End-to-end test: connected a real `socket.io-client` to `http://localhost:3003` (path `/`), emitted `subscribe {room:"admin"}`, POSTed `/internal/notify {event:"file-uploaded", payload:{file:{id:"f1",filename:"a.png"}}}` — client received the `file-uploaded` event with the correct payload. ✓
- Verified graceful SIGTERM shutdown: clean log lines `received SIGTERM, shutting down...` → `socket.io + engine.io + http server closed`, port 3003 freed, process exited 0.
- Restarted service; it is currently running on port 3003 (PID 2424).

Stage Summary:
- WebSocket mini-service DONE and verified at `mini-services/file-notify/`.
- **Port:** 3003.
- **socket.io path:** `/` (Caddy requirement), CORS `origin: "*"`.
- **Client event (subscribe):** `{ room: "admin" }` → joins socket to room `"admin"`.
- **HTTP endpoint (server→server, NOT through Caddy):** `POST http://localhost:3003/internal/notify` body `{ event: string, payload: any }` → `io.to("admin").emit(event, payload)`, returns `200 {"ok":true}`. `OPTIONS /internal/notify` → `204` + CORS.
- **Broadcast event names (consumed by admin client):** `file-uploaded { file }`, `file-deleted { fileId }`, `file-printed { file }`, `session-updated { session }` — these are the event strings the Next.js API layer should pass in the `event` field of the POST body.
- Admin client connects with `io("/?XTransformPort=3003", {...})` and emits `subscribe {room:"admin"}`.
- Service is currently running in the background (PID 2424); logs at `/home/z/my-project/file-notify.log`.
- No Next.js files, prisma schema, or anything outside `mini-services/file-notify/` were modified.
- Detailed work record at `/home/z/my-project/agent-ctx/2-full-stack-developer-websocket.md`.

---
Task ID: 4
Agent: main (frontend)
Task: Build the Admin Dashboard + Student Upload view on the single `/` route

Work Log:
- Created `src/lib/api.ts` — typed API client (sessions CRUD, files, upload with XHR progress, settings, cleanup).
- Created `src/lib/format.ts` — formatBytes, timeAgo, expiryCountdown helpers.
- Created `src/hooks/use-admin-socket.ts` — socket.io hook with heartbeat-based connection status.
- Created `src/components/admin-dashboard.tsx` — full admin UI: QR panel (session switcher, QRCodeSVG, code/link copy, close toggle, delete), live file grid with cards (thumbnail/PDF icon, expiry+printed badges, View/Download/Print/Delete), settings dialog (delete-after-print + retention hours), file viewer dialog (img/iframe), clear-all + cleanup, sticky footer with stats + Live/Polling badge.
- Created `src/components/student-upload-view.tsx` — mobile-friendly upload: drop zone, camera capture (`capture="environment"`), file picker (image+PDF, 15MB cap), previews, optional student name (persisted in localStorage), per-file progress + retry, success state.
- Rewrote `src/app/page.tsx` — Suspense-wrapped router switching on `?upload=CODE`.
- Updated layout metadata.

Stage Summary:
- Lint clean (0 errors/warnings). Single route `/` serves both views.
- Admin polls every 4s AND receives instant WS events; Live/Polling badge reflects status.

---
Task ID: 5
Agent: main (integration testing)
Task: End-to-end verification with agent-browser + bug fixes

Work Log:
- Verified admin empty state, session creation (code NGWCF6 etc.), QR render, copy link, open student page.
- Verified student upload flow: file picker, queue, progress, success "All done!".
- Verified files appear on admin (polling + instant WS).
- Verified View dialog (image + PDF iframe), Download (attachment headers), Print (HTML auto-print), Delete (removes from disk + DB).
- Verified auto-delete-after-print: enabled setting, printed a file → file auto-deleted from disk & DB, dashboard back to empty.
- Verified PDF upload + view.
- Found + fixed contract bug: `/api/settings` GET returned a flat object; client expected `{settings:{}}` → `settings` undefined crash. Fixed API to wrap in `{settings}` and made client defensive.
- Found + fixed socket badge: added heartbeat (any received event → connected=true) so the Live/Polling badge reflects true liveness.
- KEY finding: WebSocket works through the **gateway (port 81)**, NOT via direct `localhost:3000`. The QR/upload preview must be accessed via the gateway for socket.io `/?XTransformPort=3003` to route to the file-notify service. Confirmed: socket `connected:true, transport:websocket` and **instant (<500ms) delivery** through the gateway.

Stage Summary:
- All golden-path flows verified working through the gateway.
- Sticky footer verified (natural push on overflow).
- Both services running (Next 3000, file-notify 3003).
- Demo data: a "Biology Lab Report" session with one sample upload is left in place for the user to see; easily deleted via the UI.

Unresolved / Notes:
- WS does not work when accessing the app via `localhost:3000` directly (bypasses the gateway). This is expected — the real preview uses the gateway. The 4s polling fallback still works in that case.

---
Task ID: 6 (webDevReview round 1)
Agent: main (cron-triggered QA + enhancement)
Task: Assess project, run QA via agent-browser, fix bugs, add features, improve styling

## Project Status Assessment
- Core system (admin QR → student upload → live receive → view/download/print/delete) was verified working through the gateway (port 81).
- Both services healthy: Next.js on 3000, file-notify WS on 3003.
- Settings had been left with `autoDeleteAfterPrint: true` from previous testing (demo file got auto-deleted). Reset to `false` / `retentionHours: 1`.

## Work Log
### Bug fixed
- **archiver ESM import bug (CRITICAL)**: Added `POST /api/sessions/[id]/zip` route using `import archiver from "archiver"`. Archiver 8.x is an ESM package (`"type":"module"`) with named exports (`ZipArchive`, `TarArchive`), NOT the old `module.exports = function` factory. The `import default` syntax caused Turbopack to fail compiling the route, which cascaded into **500 errors on ALL API routes** (sessions, files, upload — everything). Fixed by switching to `import { ZipArchive } from "archiver"` and using `new ZipArchive({ zlib: { level: 5 } })`. Also tried `serverExternalPackages` + `createRequire` (both failed since archiver is ESM, not CJS). Removed the unnecessary config after fix.

### New features
1. **ZIP download** (`GET /api/sessions/[id]/zip`): streams a ZIP of all non-expired files in a session. Files named `${studentName}-${filename}` with numeric suffix on collision. Uses archiver's `ZipArchive` + ReadableStream piping.
2. **Print poster** (`GET /api/print-poster/[id]`): print-optimized HTML page with large QR (server-rendered via `qrcode` package as SVG), session name/code, 5-step instructions, and auto-`window.print()`. Meant for classroom display.
3. **Print all** (`GET /api/print-all?ids=a,b,c`): lays out selected files one-per-page with page breaks and auto-prints. Images as `<img>`, PDFs as `<iframe>`.
4. **Search + filter + sort**: admin can search by student/file name, filter (All/Unprinted/Images/PDFs), sort (Newest/Oldest/Student A-Z). "No files match" empty state with Clear filters button.
5. **Bulk select mode**: Select button toggles multi-select. Per-card checkboxes appear on hover. Bulk action bar with: Download ZIP, Print all, Delete (with confirm dialog). Select-all checkbox for visible files.
6. **QR PNG download**: client-side serializes the QRCodeSVG to canvas → PNG at 1024px.
7. **Richer footer stats**: files count, unique students count, total size, printed count, auto-delete/expire status — each with an icon.

### Styling improvements
- Framer-motion: file cards animate in (fade+slide+scale), exit animations, layout animations on filter changes.
- Pulsing "Live" badge with animated ping dot.
- Gradient header icon (emerald-500 → emerald-700).
- Gradient QR panel background (emerald-50).
- Quick-fact cards in QR panel (files count, created date).
- Filter pills with active emerald state.
- "Waiting for uploads" empty state with floating QR icon animation.
- Per-file-type icons, expiry countdown badges, printed badges.

## Verification Results
- `bun run lint` → 0 errors, 0 warnings ✓
- All API routes return 200 (sessions, files, settings, upload, zip, print-poster, print-all) ✓
- ZIP: valid zip archive, correct filename `Biology_Lab_Report-NGWCF6.zip` ✓
- Poster: HTML with QR SVG + instructions + auto-print ✓
- Print-all: HTML with per-file pages + page breaks ✓
- Admin UI: Live badge, Select mode, search/filter/sort, bulk bar, QR PNG/Poster buttons all render ✓
- No runtime errors in dev.log ✓

## Unresolved / Next-phase recommendations
- The `webDevReview` cron (every 15 min) will continue to QA + propose features.
- Potential future features: upload timeline chart, per-student grouping view, session archiving, sound notification on new upload, dark mode.
- Note: `archiver` 8.x is ESM — any future CJS packages need `serverExternalPackages` + `createRequire`; ESM packages just need correct named imports.
