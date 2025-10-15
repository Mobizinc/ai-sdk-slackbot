import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { appSettings } from "../db/schema";

export const APP_SETTING_KEYS = {
  leaderboardChannel: "mobiz_leaderboard_channel",
  queueReportChannel: "mobiz_queue_report_channel",
} as const;

let ensured = false;

async function ensureTable() {
  if (ensured) return;

  const db = getDb();
  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  await db.execute(
    `CREATE TABLE IF NOT EXISTS "app_settings" (
      "key" text PRIMARY KEY,
      "value" text NOT NULL,
      "updated_at" timestamptz NOT NULL DEFAULT now()
    );`
  );

  await db.execute(
    `CREATE INDEX IF NOT EXISTS "idx_app_settings_updated" ON "app_settings" ("updated_at");`
  );

  ensured = true;
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = getDb();
  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  await ensureTable();

  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  await ensureTable();

  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: {
        value,
        updatedAt: new Date(),
      },
    });
}

export async function getAppSettingWithFallback(
  key: string,
  fallback?: string | null,
): Promise<string | null> {
  const value = await getAppSetting(key);
  if (value !== null && value !== undefined) {
    return value;
  }
  return fallback ?? null;
}
