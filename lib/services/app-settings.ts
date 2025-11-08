import { eq } from "drizzle-orm";

import { getDb } from "../db/client";
import { appSettings } from "../db/schema";

export const APP_SETTING_KEYS = Object.freeze({
  leaderboardChannel: "mobiz_leaderboard_channel",
  queueReportChannel: "mobiz_queue_report_channel",
} as const);

let appSettingsTableAvailable = true;
let appSettingsTableWarningLogged = false;

function isAppSettingsMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: string }).code;
  if (code === "42P01") {
    // Postgres undefined_table
    return true;
  }

  const message = (error as { message?: string }).message;
  return typeof message === "string" && message.includes("app_settings");
}

function logAppSettingsMissingOnce(): void {
  if (appSettingsTableWarningLogged) {
    return;
  }
  appSettingsTableWarningLogged = true;
  console.warn(
    "[AppSettings] app_settings table is not available. Falling back to defaults and environment overrides only."
  );
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = getDb();
  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  if (!appSettingsTableAvailable) {
    return null;
  }

  try {
    const rows = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, key))
      .limit(1);

    return rows[0]?.value ?? null;
  } catch (error) {
    if (isAppSettingsMissingError(error)) {
      appSettingsTableAvailable = false;
      logAppSettingsMissingOnce();
      return null;
    }
    throw error;
  }
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Neon database is not configured (missing DATABASE_URL)");
  }

  if (!appSettingsTableAvailable) {
    throw new Error("app_settings table is unavailable; run migrations before modifying app settings.");
  }

  try {
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
  } catch (error) {
    if (isAppSettingsMissingError(error)) {
      appSettingsTableAvailable = false;
      logAppSettingsMissingOnce();
      throw new Error("app_settings table is unavailable; run migrations before modifying app settings.");
    }
    throw error;
  }
}

export async function getAppSettingWithFallback(
  key: string,
  fallback?: string | null,
): Promise<string | null> {
  const value = await getAppSetting(key);
  if (value !== null && value !== undefined && value !== '') {
    return value;
  }
  return fallback ?? null;
}
