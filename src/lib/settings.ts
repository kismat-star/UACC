import { db } from "@/lib/db";
import type { SettingsShape } from "@/lib/types";

const KEY_AUTO_DELETE = "autoDeleteAfterPrint";
const KEY_RETENTION = "retentionHours";
const KEY_TOTAL_PRINTS = "totalPrintsCount";

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
  let totalPrintsCount = 0;

  try {
    const rows = await db.setting.findMany({
      where: { id: { in: [KEY_AUTO_DELETE, KEY_RETENTION, KEY_TOTAL_PRINTS] } },
    });
    let foundTotalPrints = false;
    for (const row of rows) {
      if (row.id === KEY_AUTO_DELETE) {
        autoDeleteAfterPrint = row.value === "true";
      } else if (row.id === KEY_RETENTION) {
        const parsed = Number.parseInt(row.value, 10);
        if (Number.isFinite(parsed)) {
          retentionHours = parsed;
        }
      } else if (row.id === KEY_TOTAL_PRINTS) {
        foundTotalPrints = true;
        const parsed = Number.parseInt(row.value, 10);
        if (Number.isFinite(parsed)) {
          totalPrintsCount = parsed;
        }
      }
    }

    // If totalPrintsCount hasn't been initialized yet, count existing printed files in DB
    if (!foundTotalPrints) {
      const existingPrinted = await db.file
        .count({ where: { printed: true } })
        .catch(() => 0);
      totalPrintsCount = existingPrinted;
      await db.setting
        .upsert({
          where: { id: KEY_TOTAL_PRINTS },
          update: {},
          create: { id: KEY_TOTAL_PRINTS, value: String(existingPrinted) },
        })
        .catch(() => null);
    }
  } catch (err) {
    console.error("[settings] getSettings failed, returning defaults:", err);
  }

  const result: SettingsShape = { autoDeleteAfterPrint, retentionHours, totalPrintsCount };
  cachedSettings = result;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;
  return result;
}

/**
 * Increment the permanent lifetime prints counter by a given amount (default 1).
 * Never resets or decreases, even when files are deleted or expired.
 */
export async function incrementPrintCount(amount = 1): Promise<number> {
  if (amount <= 0) return 0;
  try {
    const current = await db.setting.findUnique({
      where: { id: KEY_TOTAL_PRINTS },
    });

    let currentVal = 0;
    if (current) {
      const parsed = Number.parseInt(current.value, 10);
      if (Number.isFinite(parsed)) currentVal = parsed;
    } else {
      const existingPrinted = await db.file
        .count({ where: { printed: true } })
        .catch(() => 0);
      currentVal = existingPrinted;
    }

    const newVal = currentVal + amount;
    await db.setting.upsert({
      where: { id: KEY_TOTAL_PRINTS },
      update: { value: String(newVal) },
      create: { id: KEY_TOTAL_PRINTS, value: String(newVal) },
    });

    if (cachedSettings) {
      cachedSettings.totalPrintsCount = newVal;
    }
    return newVal;
  } catch (err) {
    console.error("[settings] incrementPrintCount failed:", err);
    return 0;
  }
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
