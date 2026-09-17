/**
 * file-notify-service
 *
 * Standalone Bun + socket.io mini-service for the QR File Collector app.
 *
 * - socket.io server on port 3003, path: "/" (REQUIRED by Caddy gateway).
 * - CORS origin: "*".
 * - Client emits `subscribe` { room: "admin" } → joins socket to the "admin" room.
 * - HTTP `POST /internal/notify` (on the SAME http server) with body
 *   `{ event: string, payload: any }` → broadcasts `event`/`payload` to all
 *   sockets in the "admin" room via `io.to("admin").emit(event, payload)`.
 *   Returns `{ ok: true }`. OPTIONS returns 204 with CORS.
 * - Logs connections, subscriptions, and broadcasts prefixed with `[file-notify]`.
 * - Graceful SIGTERM / SIGINT shutdown.
 *
 * NOTE on path: "/":
 *   With `path: "/"`, engine.io's internal `check()` matches every URL (since
 *   `path === req.url.slice(0, path.length)` is true for any URL when path is
 *   "/"). That means engine.io intercepts EVERY incoming HTTP request — including
 *   `/internal/notify` — before the http server's own request listener would
 *   normally run. To handle `/internal/notify` (and CORS preflight) reliably,
 *   we register an engine.io middleware via `io.engine.use(...)` that runs
 *   BEFORE engine.io's `verify()` step. The middleware short-circuits
 *   `/internal/notify` POST + OPTIONS preflight, and calls `next()` for
 *   everything else so engine.io/socket.io can handle its own handshake /
 *   upgrade / polling requests normally. We ALSO keep a plain http request
 *   listener on `createServer(...)` as a defensive fallback (it would only run
 *   if engine.io ever decided NOT to intercept a request).
 */

import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Server, type Socket as IoSocket } from "socket.io";

const PORT = 3003;
const ADMIN_ROOM = "admin";

const log = (...args: unknown[]): void => {
  console.log("[file-notify]", ...args);
};

// ---------------------------------------------------------------------------
// Shared request handling for /internal/notify + CORS preflight.
// Used both by the engine.io middleware (primary) and the http server's
// request listener (defensive fallback).
// ---------------------------------------------------------------------------

function setCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// `io` is declared with `let` so handler closures can reference it. It is
// assigned synchronously below before any request can arrive.
let io: Server;

function handleNotifyPost(body: string, res: ServerResponse): void {
  let event: string | undefined;
  let payload: unknown;
  try {
    const parsed: unknown = body ? JSON.parse(body) : {};
    if (parsed && typeof parsed === "object") {
      const p = parsed as { event?: unknown; payload?: unknown };
      event = typeof p.event === "string" ? p.event : undefined;
      payload = p.payload;
    }
  } catch (err) {
    log("/internal/notify JSON parse error:", err);
  }

  if (typeof event === "string" && event.length > 0) {
    io.to(ADMIN_ROOM).emit(event, payload);
    log(`broadcast event="${event}" to room "${ADMIN_ROOM}"`);
  } else {
    log("/internal/notify called without a valid 'event' string field");
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
}

/**
 * Returns `true` if the request was handled (i.e. the caller should NOT call
 * `next()`). Returns `false` if the request should fall through to engine.io.
 */
function interceptRequest(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  // Always stamp CORS headers on responses we send.
  setCorsHeaders(res);

  // CORS preflight for /internal/notify (and any other path).
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  // POST /internal/notify → broadcast to admin room.
  if (
    req.method === "POST" &&
    typeof req.url === "string" &&
    req.url.startsWith("/internal/notify")
  ) {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      handleNotifyPost(body, res);
    });
    req.on("error", (err: unknown) => {
      log("/internal/notify stream error:", err);
      try {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        /* response already finished or unusable */
      }
    });
    return true;
  }

  // Not a request we handle — let engine.io / socket.io deal with it.
  return false;
}

// ---------------------------------------------------------------------------
// HTTP server + socket.io
// ---------------------------------------------------------------------------

const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
  // Defensive fallback request listener. In practice (with path: "/"),
  // engine.io intercepts every request and runs its middlewares first, so
  // this listener only runs for requests engine.io explicitly chose NOT to
  // handle. We still handle /internal/notify + CORS here just in case.
  if (interceptRequest(req, res)) return;

  // Unknown non-socket request → 404.
  setCorsHeaders(res);
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

io = new Server(httpServer, {
  // REQUIRED by the Caddy gateway — do NOT change the path.
  path: "/",
  cors: {
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Primary handler for /internal/notify + CORS preflight. Runs inside
// engine.io's middleware chain (BEFORE verify()), so it intercepts requests
// that engine.io would otherwise reject with a 400 "Transport unknown".
io.engine.use(
  (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
    if (interceptRequest(req, res)) return;
    next();
  }
);

// ---------------------------------------------------------------------------
// socket.io connection lifecycle
// ---------------------------------------------------------------------------

io.on("connection", (socket: IoSocket) => {
  log(`socket connected: ${socket.id}`);

  socket.on("subscribe", (data: unknown) => {
    const room =
      data && typeof data === "object" && "room" in data
        ? (data as { room?: unknown }).room
        : undefined;

    if (room === ADMIN_ROOM) {
      socket.join(ADMIN_ROOM);
      log(`socket ${socket.id} subscribed to room "${ADMIN_ROOM}"`);
    } else {
      log(
        `socket ${socket.id} sent subscribe with unknown room: ${String(room)}`
      );
    }
  });

  socket.on("disconnect", (reason: string) => {
    log(`socket disconnected: ${socket.id} (reason: ${reason})`);
  });

  socket.on("error", (err: unknown) => {
    log(`socket error on ${socket.id}:`, err);
  });
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

httpServer.listen(PORT, () => {
  log(`WebSocket server running on port ${PORT}`);
  log(`socket.io path: "/"  (CORS origin: "*")`);
  log(`POST /internal/notify  → broadcasts {event,payload} to room "${ADMIN_ROOM}"`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown (SIGTERM / SIGINT)
// ---------------------------------------------------------------------------

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`received ${signal}, shutting down...`);

  // `io.close()` closes all namespaces, the underlying engine.io, AND the
  // http server (it calls `this.httpServer.close(...)` internally). So we do
  // NOT also call httpServer.close() here — that would throw "Server is not
  // running" on the second close.
  try {
    await io.close();
    log("socket.io + engine.io + http server closed");
  } catch (err) {
    log("error during io.close():", err);
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
