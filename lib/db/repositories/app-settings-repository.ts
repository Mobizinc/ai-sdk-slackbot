import { eq } from "drizzle-orm";
import { getDb } from "../client";
import { appSettings, type AppSetting } from "../schema";

export async function getAppSetting(key: string): Promise<AppSetting | null> {
  const db = getDb();
  if (!db) {
    return null;
  }

  const [setting] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);

  return setting ?? null;
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

  const exists = await getAppSetting(key);

  if (exists) {
    await db
      .update(appSettings)
      .set({
        value,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.key, key));
    return;
  }

  await db.insert(appSettings).values({
    key,
    value,
    updatedAt: new Date(),
  });
}
