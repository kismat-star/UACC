/**
 * Best-effort notifier for the WebSocket mini-service on port 3003.
 *
 * Sends `POST http://localhost:3003/internal/notify` with `{ event, payload }`.
 * Server-to-server, no gateway needed. Never throws — log and swallow.
 */

const NOTIFY_URL = "http://localhost:3003/internal/notify";
const TIMEOUT_MS = 3000;

export async function notify(event: string, payload: unknown): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(NOTIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[ws-notify] non-ok response ${res.status} ${res.statusText} for event=${event}`,
      );
    }
  } catch (err) {
    const aborted = (err as Error)?.name === "AbortError";
    if (aborted) {
      console.error(`[ws-notify] timeout for event=${event}`);
    } else {
      console.error(`[ws-notify] failed for event=${event}:`, err);
    }
  } finally {
    clearTimeout(timer);
  }
}
