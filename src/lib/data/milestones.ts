import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, clients, milestones, type ActivitySource, type Client, type Milestone } from "@/lib/db/schema";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { addDaysISO, delayText, formatDate, todayISO } from "@/lib/core/dates";
import type { MilestoneInput, MilestonePatch } from "@/lib/validation";

export type MilestoneWithClient = Milestone & { client: Client };

export async function listUpcomingMilestones(days = 14): Promise<MilestoneWithClient[]> {
  const db = await getDb();
  const today = todayISO();
  const until = addDaysISO(today, days);
  const rows = await db.query.milestones.findMany({
    where: and(eq(milestones.status, "upcoming"), gte(milestones.date, today), lte(milestones.date, until)),
    with: { client: true },
    orderBy: [asc(milestones.date)],
  });
  return rows.filter((r) => !r.client.archivedAt);
}

export async function listOverdueMilestones(): Promise<MilestoneWithClient[]> {
  const db = await getDb();
  const today = todayISO();
  const rows = await db.query.milestones.findMany({
    where: and(eq(milestones.status, "upcoming"), lt(milestones.date, today)),
    with: { client: true },
    orderBy: [asc(milestones.date)],
  });
  return rows.filter((r) => !r.client.archivedAt);
}

export async function createMilestone(input: MilestoneInput, source: ActivitySource = "app"): Promise<Milestone> {
  const db = await getDb();
  const [row] = await db
    .insert(milestones)
    .values({ ...input, originalDate: input.date })
    .returning();
  await db.insert(activities).values({
    clientId: input.clientId,
    type: "update",
    title: `${MILESTONE_TYPES[row.type].label} date set: ${row.title} on ${formatDate(row.date)}`,
    source,
  });
  return row;
}

export async function updateMilestone(id: string, patch: MilestonePatch, source: ActivitySource = "app"): Promise<Milestone> {
  const db = await getDb();
  const before = await db.query.milestones.findFirst({ where: eq(milestones.id, id) });
  if (!before) throw new Error("Milestone not found");

  const values: Partial<typeof milestones.$inferInsert> = {};
  const lines: string[] = [];
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.type !== undefined) values.type = patch.type;
  if (patch.notes !== undefined) values.notes = patch.notes;

  if (patch.date !== undefined && patch.date !== before.date) {
    values.date = patch.date;
    values.dateHistory = [
      ...before.dateHistory,
      { from: before.date, to: patch.date, at: new Date().toISOString(), reason: patch.reason ?? undefined },
    ];
    const slip = delayText(before.originalDate, patch.date);
    lines.push(
      `${before.title} moved: ${formatDate(before.date)} to ${formatDate(patch.date)}${slip ? ` (delayed ${slip} overall)` : ""}${patch.reason ? `. ${patch.reason}` : ""}`,
    );
  }
  if (patch.status !== undefined && patch.status !== before.status) {
    values.status = patch.status;
    values.completedAt = patch.status === "done" ? new Date() : null;
    if (patch.status === "done") lines.push(`${before.title} completed`);
    else if (patch.status === "cancelled") lines.push(`${before.title} cancelled`);
    else if (patch.status === "missed") lines.push(`${before.title} missed`);
    else lines.push(`${before.title} reopened`);
  }

  const [row] = await db.update(milestones).set(values).where(eq(milestones.id, id)).returning();
  if (lines.length) {
    await db.insert(activities).values(
      lines.map((title) => ({ clientId: before.clientId, type: "update" as const, title, source })),
    );
  }
  return row;
}

export async function deleteMilestone(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(milestones).where(eq(milestones.id, id));
}

/** Upcoming milestones of a given type for a client, soonest first. */
export async function findClientMilestones(clientId: string, types?: Milestone["type"][]): Promise<Milestone[]> {
  const db = await getDb();
  return db.query.milestones.findMany({
    where: and(
      eq(milestones.clientId, clientId),
      inArray(milestones.status, ["upcoming", "missed"]),
      types && types.length ? inArray(milestones.type, types) : undefined,
    ),
    orderBy: [asc(milestones.date)],
  });
}

export const _clients = clients;
