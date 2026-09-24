import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, type Activity, type ActivitySource, type ActivityType, type Client } from "@/lib/db/schema";
import type { ActivityInput } from "@/lib/validation";

export type ActivityWithClient = Activity & { client: Client | null };

export async function listActivities(opts: {
  clientId?: string;
  type?: ActivityType;
  source?: ActivitySource;
  q?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<ActivityWithClient[]> {
  const db = await getDb();
  const filters: SQL[] = [];
  if (opts.clientId) filters.push(eq(activities.clientId, opts.clientId));
  if (opts.type) filters.push(eq(activities.type, opts.type));
  if (opts.source) filters.push(eq(activities.source, opts.source));
  if (opts.q && opts.q.trim()) {
    const term = `%${opts.q.trim()}%`;
    filters.push(or(ilike(activities.title, term), ilike(activities.body, term))!);
  }
  return db.query.activities.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { client: true },
    orderBy: [desc(activities.occurredAt), desc(activities.createdAt)],
    limit: opts.limit ?? 60,
    offset: opts.offset ?? 0,
  });
}

export async function createActivity(input: ActivityInput): Promise<Activity> {
  const db = await getDb();
  const [row] = await db.insert(activities).values(input).returning();
  return row;
}

export async function updateActivity(id: string, patch: Partial<ActivityInput>): Promise<Activity> {
  const db = await getDb();
  const [row] = await db.update(activities).set(patch).where(eq(activities.id, id)).returning();
  return row;
}

export async function deleteActivity(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(activities).where(eq(activities.id, id));
}
