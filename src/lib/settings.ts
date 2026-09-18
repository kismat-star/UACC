import { db } from "@/lib/db";
import type { SettingsShape } from "@/lib/types";

const KEY_AUTO_DELETE = "autoDeleteAfterPrint";
const KEY_RETENTION = "retentionHours";

const DEFAULT_AUTO_DELETE = false;
const DEFAULT_RETENTION_HOURS = 1;

let cachedSettings: SettingsShape | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Read current settings from the Setting table (key/value singleton rows).
 * Falls back to documented defaults if rows are missing or unparseable.
 */
export async function getSettings(): Promise<SettingsShape> {
  const now = Date.now();
  if (cachedSettings && now < cacheExpiresAt) {
    return cachedSettings;
  }

  let autoDeleteAfterPrint = DEFAULT_AUTO_DELETE;
  let retentionHours = DEFAULT_RETENTION_HOURS;

  try {
    const rows = await db.setting.findMany({
      where: { id: { in: [KEY_AUTO_DELETE, KEY_RETENTION] } },
    });
    for (const row of rows) {
      if (row.id === KEY_AUTO_DELETE) {
        autoDeleteAfterPrint = row.value === "true";
      } else if (row.id === KEY_RETENTION) {
        const parsed = Number.parseInt(row.value, 10);
        if (Number.isFinite(parsed)) {
          retentionHours = parsed;
        }
      }
    }
  } catch (err) {
    console.error("[settings] getSettings failed, returning defaults:", err);
  }

  const result: SettingsShape = { autoDeleteAfterPrint, retentionHours };
  cachedSettings = result;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return result;
}

/**
 * Upsert the provided keys. Returns the full settings object after update.
 */
export async function updateSettings(
  patch: Partial<SettingsShape>,
): Promise<SettingsShape> {
  const ops: Promise<unknown>[] = [];

  if (typeof patch.autoDeleteAfterPrint === "boolean") {
    ops.push(
      db.setting.upsert({
        where: { id: KEY_AUTO_DELETE },
        update: { value: String(patch.autoDeleteAfterPrint) },
        create: { id: KEY_AUTO_DELETE, value: String(patch.autoDeleteAfterPrint) },
      }),
    );
  }

  if (typeof patch.retentionHours === "number" && Number.isFinite(patch.retentionHours)) {
    ops.push(
      db.setting.upsert({
        where: { id: KEY_RETENTION },
        update: { value: String(Math.trunc(patch.retentionHours)) },
        create: { id: KEY_RETENTION, value: String(Math.trunc(patch.retentionHours)) },
      }),
    );
  }

  if (ops.length > 0) {
    await Promise.all(ops);
  }

  cachedSettings = null;
  cacheExpiresAt = 0;

  return getSettings();
}

/**
 * Compute the absolute expiry Date for a file uploaded now, given the
 * configured retention hours. Returns null when retention is disabled (<=0).
 */
export function computeExpiresAt(retentionHours: number): Date | null {
  if (typeof retentionHours !== "number" || !Number.isFinite(retentionHours) || retentionHours <= 0) {
    return null;
  }
  return new Date(Date.now() + retentionHours * 3600 * 1000);
}
