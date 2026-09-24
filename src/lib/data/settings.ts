import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { DEFAULT_OWNER, SETTINGS_KEYS } from "@/lib/core/constants";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getDb();
  const row = await db.query.settings.findFirst({ where: eq(settings.key, key) });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db
    .insert(settings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: settings.key, set: { value: value as object, updatedAt: new Date() } });
}

export async function getOwnerName(): Promise<string> {
  return getSetting<string>(SETTINGS_KEYS.ownerName, DEFAULT_OWNER);
}
