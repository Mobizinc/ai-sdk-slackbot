import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { appSettings, type AppSetting } from "../schema";
import { withWriteRetry, withQueryRetry } from "../retry-wrapper";

export async function getAppSetting(key: string): Promise<AppSetting | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  try {
    return await withQueryRetry(async () => {
      const [setting] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, key))
        .limit(1);

      return setting ?? null;
    }, `get app setting: ${key}`);
  } catch (error) {
    console.error(`[DB] Error getting app setting ${key}:`, error);
    return null;
  }
}

export async function getAppSettingValue(key: string): Promise<string | null> {
  const setting = await getAppSetting(key);
  return setting?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = getDb();
  if (!db) {
    return;
  }

  try {
    const exists = await getAppSetting(key);

    await withWriteRetry(async () => {
      if (exists) {
        await db
          .update(appSettings)
          .set({
            value,
            updatedAt: new Date(),
          })
          .where(eq(appSettings.key, key));
      } else {
        await db.insert(appSettings).values({
          key,
          value,
          updatedAt: new Date(),
        });
      }
    }, `set app setting: ${key}`);

    console.log(`[DB] Saved app setting ${key}`);
  } catch (error) {
    console.error(`[DB] Error setting app setting ${key}:`, error);
  }
}
