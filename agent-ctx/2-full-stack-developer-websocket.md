# Task ID 2 — WebSocket mini-service (file-notify)

**Agent:** full-stack-developer (WebSocket mini-service)
**Owner task ID:** 2
**Worklog:** `/home/z/my-project/worklog.md` (read full project + CONTRACT before starting)
**Service path:** `/home/z/my-project/mini-services/file-notify/`
**Log file:** `/home/z/my-project/file-notify.log`
**Port:** 3003

## What was built
A standalone Bun + socket.io mini-service that lets the Next.js API layer push
instant notifications to admin clients.

### Files created
- `mini-services/file-notify/package.json`
  - Independent Bun project, `name: "file-notify-service"`, `"type": "module"`.
  - Scripts: `"dev": "bun --hot index.ts"`, `"start": "bun index.ts"`.
  - Single dependency: `socket.io@^4.8.3`.
- `mini-services/file-notify/index.ts`
  - `http.createServer(...)` with a request listener that handles
    `/internal/notify` POST + CORS preflight (defensive fallback).
  - `new Server(httpServer, { path: "/", cors: { origin: "*", methods:
    ["GET","POST","OPTIONS"] }, pingTimeout: 60s, pingInterval: 25s })`.
  - `io.engine.use((req, res, next) => interceptRequest(...) || next())`
    registered as an engine.io middleware. This is the PRIMARY handler and is
    required because with `path: "/"`, engine.io's internal `check()` matches
    every URL (`path === req.url.slice(0, path.length)` is always true), so
    engine.io intercepts EVERY HTTP request before the http server's own
    request listener would normally run. The middleware short-circuits
    `/internal/notify` POST + OPTIONS preflight and calls `next()` for
    everything else so socket.io can handle its own handshake/upgrade/polling.
  - On the `subscribe` event, if `data.room === "admin"`, the socket joins the
    `"admin"` room.
  - `POST /internal/notify` body `{ event, payload }` →
    `io.to("admin").emit(event, payload)` → responds `200 {"ok":true}`.
  - All responses get CORS headers
    `Access-Control-Allow-Origin: *`,
    `Access-Control-Allow-Methods: GET,POST,OPTIONS`,
    `Access-Control-Allow-Headers: Content-Type`.
  - OPTIONS returns `204 No Content`.
  - Logs connections, subscriptions, broadcasts — all prefixed with
    `[file-notify]`.
  - Graceful shutdown on SIGTERM / SIGINT via `await io.close()` (which
    internally closes namespaces, engine.io, AND the http server — so we do
    NOT also call `httpServer.close()`).

## Endpoint / event names (so other agents can consume them)

| Transport | Path / event | Direction | Body / payload | Notes |
|-----------|--------------|-----------|----------------|-------|
| HTTP POST | `/internal/notify` | server→server (Next.js API → mini-service) | `{ event: string, payload: any }` | Returns `200 {"ok":true}`. Best-effort. |
| HTTP OPTIONS | `/internal/notify` | browser preflight | — | Returns `204` + CORS headers. |
| socket.io | `subscribe` | client→server | `{ room: "admin" }` | Joins socket to the `"admin"` room. |
| socket.io | `file-uploaded` | server→admin room | `{ file: FileShape }` | Broadcast by upload API. |
| socket.io | `file-deleted` | server→admin room | `{ fileId: string }` | Broadcast by delete API. |
| socket.io | `file-printed` | server→admin room | `{ file: FileShape }` | Broadcast by print API. |
| socket.io | `session-updated` | server→admin room | `{ session: SessionShape }` | Broadcast by session PATCH/DELETE. |

Admin client connects with:
```ts
io("/?XTransformPort=3003", { transports: ["websocket", "polling"] })
```
and immediately emits `subscribe` `{ room: "admin" }`.

The `/internal/notify` body is `{ event, payload }` — `event` is the
socket.io event name string (one of the four above, or any custom string),
and `payload` is forwarded verbatim to subscribers.

## Verification done

1. `cd mini-services/file-notify && bun install` → 22 packages, `socket.io@4.8.3`.
2. Started in background: `nohup bun run dev > /home/z/my-project/file-notify.log 2>&1 &`.
3. `cat /home/z/my-project/file-notify.log` shows:
   ```
   [file-notify] WebSocket server running on port 3003
   [file-notify] socket.io path: "/"  (CORS origin: "*")
   [file-notify] POST /internal/notify  → broadcasts {event,payload} to room "admin"
   ```
4. `curl -s -X POST http://localhost:3003/internal/notify -H "Content-Type: application/json" -d '{"event":"test","payload":{"hi":1}}'`
   → `{"ok":true}` ✓
5. OPTIONS preflight → `204 No Content` with CORS headers. ✓
6. End-to-end: a real `socket.io-client` connected to
   `http://localhost:3003` (path `/`), emitted `subscribe {room:"admin"}`,
   then we POSTed `/internal/notify` with `{event:"file-uploaded",payload:{file:{id:"f1",filename:"a.png"}}}`
   → the client received the `file-uploaded` event with the correct payload. ✓
7. SIGTERM → graceful log lines:
   ```
   [file-notify] received SIGTERM, shutting down...
   [file-notify] socket.io + engine.io + http server closed
   ```
   Port 3003 released, process exited cleanly. ✓
8. Restarted; service is currently running (PID 2424) on port 3003.

## Constraints respected
- Did NOT modify any Next.js files, prisma schema, or anything outside
  `mini-services/file-notify/`.
- Only created `package.json` and `index.ts` inside the mini-service folder.
- `bun run db:push` not run.
- `path: "/"` kept (REQUIRED by Caddy).
- CORS `origin: "*"`.

## Side notes for other agents
- The mini-service is independent: it has its own `node_modules/`,
  `bun.lock`, and is started with its own `bun run dev`. It does not import
  anything from the Next.js app.
- The Next.js API layer should POST to `http://localhost:3003/internal/notify`
  (server-to-server, NO Caddy gateway). The body is
  `{ event: "file-uploaded", payload: { file: FileShape } }` etc.
  Best-effort, wrapped in try/catch — if the service is down, the API still
  returns 200 to the user; the admin page's 4s polling fallback will catch
  up.
- For the admin client, use `io("/?XTransformPort=3003", {...})` (per the
  gateway contract) and emit `subscribe` `{ room: "admin" }` on connect.
