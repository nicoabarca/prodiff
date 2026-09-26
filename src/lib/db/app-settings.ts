import { eq } from "drizzle-orm";
import { db } from "$lib/db/client";
import { appSettings } from "$lib/db/schema";

/** Every key the `app_settings` table holds, with the shape of its value. */
export interface AppSettings {
  toursSeen: string[];
}

/** A stored value, or null when the key has never been written. */
export async function readSetting<K extends keyof AppSettings>(
  key: K
): Promise<AppSettings[K] | null> {
  const rows = await db().select().from(appSettings).where(eq(appSettings.key, key));
  return rows.length > 0 ? (rows[0].value as AppSettings[K]) : null;
}

export async function writeSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  await db()
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } });
}
