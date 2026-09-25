import { and, asc, desc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, clients, documents, meetings, type ActionItem, type ActivitySource, type Client, type Meeting } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/core/dates";
import type { MeetingInput, MeetingPatch } from "@/lib/validation";
import type { MinutesPlan } from "@/lib/ai/mom";
import { updateClient } from "./clients";
import { findClientMilestones, updateMilestone } from "./milestones";
import { createTask } from "./tasks";

export type MeetingWithClient = Meeting & { client: Client };

export async function listMeetings(opts: { clientId?: string; status?: Meeting["status"][]; limit?: number } = {}): Promise<MeetingWithClient[]> {
  const db = await getDb();
  const filters: SQL[] = [];
  if (opts.clientId) filters.push(eq(meetings.clientId, opts.clientId));
  if (opts.status?.length) filters.push(inArray(meetings.status, opts.status));
  const rows = await db.query.meetings.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { client: true },
    orderBy: [desc(meetings.heldAt)],
    limit: opts.limit ?? 200,
  });
  return rows as MeetingWithClient[];
}

/** Planned meetings from now, soonest first. */
export async function listUpcomingMeetings(days = 14): Promise<MeetingWithClient[]> {
  const db = await getDb();
  const now = new Date();
  const until = new Date(now.getTime() + days * 86400000);
  const rows = await db.query.meetings.findMany({
    where: and(eq(meetings.status, "planned"), gte(meetings.heldAt, now), lt(meetings.heldAt, until)),
    with: { client: true },
    orderBy: [asc(meetings.heldAt)],
  });
  return (rows as MeetingWithClient[]).filter((m) => !m.client.archivedAt);
}

/** Meetings whose time has passed and that have no minutes yet. These ask for a transcript. */
export async function listMeetingsAwaitingMinutes(): Promise<MeetingWithClient[]> {
  const db = await getDb();
  const rows = await db.query.meetings.findMany({
    where: and(inArray(meetings.status, ["planned", "held"]), lt(meetings.heldAt, new Date())),
    with: { client: true },
    orderBy: [desc(meetings.heldAt)],
    limit: 20,
  });
  return (rows as MeetingWithClient[]).filter((m) => !m.client.archivedAt && !m.mom);
}

export async function getMeeting(id: string): Promise<MeetingWithClient | null> {
  const db = await getDb();
  const row = await db.query.meetings.findFirst({ where: eq(meetings.id, id), with: { client: true } });
  return (row as MeetingWithClient | undefined) ?? null;
}

export async function createMeeting(input: MeetingInput, source: ActivitySource = "app"): Promise<Meeting> {
  const db = await getDb();
  const planned = input.heldAt.getTime() > Date.now();
  const [row] = await db
    .insert(meetings)
    .values({ ...input, status: planned ? "planned" : "held" })
    .returning();
  await db.insert(activities).values({
    clientId: input.clientId,
    type: "meeting",
    title: planned ? `Meeting set: ${row.title}, ${formatDateTime(row.heldAt)}` : `Meeting held: ${row.title}`,
    occurredAt: planned ? new Date() : row.heldAt,
    source,
    meetingId: row.id,
  });
  return row;
}

export async function updateMeeting(id: string, patch: MeetingPatch): Promise<Meeting> {
  const db = await getDb();
  const [row] = await db.update(meetings).set(patch).where(eq(meetings.id, id)).returning();
  if (!row) throw new Error("Meeting not found");
  return row;
}

export async function deleteMeeting(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(meetings).where(eq(meetings.id, id));
}

export type SavedMinutes = { lines: string[] };

/**
 * Saves reviewed minutes: the MOM text, action items, follow up tasks for Saaqib, decisions,
 * date moves, health and next step changes, and the client notes. One activity per real change.
 */
export async function saveMinutes(id: string, plan: MinutesPlan, accept: { tasks: boolean[]; dateChanges: boolean[]; health: boolean; nextStep: boolean; notes: boolean }, source: ActivitySource = "app"): Promise<SavedMinutes> {
  const db = await getDb();
  const meeting = await getMeeting(id);
  if (!meeting) throw new Error("Meeting not found");
  const clientId = meeting.clientId;
  const lines: string[] = [];

  const actionItems: ActionItem[] = plan.actionItems.map((a) => ({ text: a.text, owner: a.owner ?? undefined, due: a.due ?? undefined }));

  // Follow up tasks for Saaqib
  for (const [i, t] of plan.tasks.entries()) {
    if (!accept.tasks[i]) continue;
    const row = await createTask({ clientId, title: t.title, details: null, status: t.waitingOn ? "waiting" : "todo", priority: t.priority, dueDate: t.dueDate, waitingOn: t.waitingOn }, source, { sourceMeetingId: id });
    const match = actionItems.find((a) => a.text.toLowerCase() === t.title.toLowerCase());
    if (match) match.taskId = row.id;
    lines.push(`Task: ${row.title}`);
  }

  // Dates
  for (const [i, d] of plan.dateChanges.entries()) {
    if (!accept.dateChanges[i]) continue;
    const existing = await findClientMilestones(clientId, [d.type]);
    const byTitle = d.title ? existing.find((e) => e.title.toLowerCase() === d.title!.toLowerCase()) : undefined;
    const target = byTitle ?? existing[0];
    if (!target) continue;
    if (d.newDate && d.newDate !== target.date) {
      await updateMilestone(target.id, { date: d.newDate, reason: `Agreed in ${meeting.title}` }, source);
      lines.push(`${target.title} moved to ${d.newDate}`);
    }
    if (d.markDone) {
      await updateMilestone(target.id, { status: "done" }, source);
      lines.push(`${target.title} marked done`);
    }
  }

  // Client fields
  const patch: Record<string, unknown> = {};
  if (accept.health && plan.health) patch.health = plan.health;
  if (accept.nextStep && plan.nextStep) patch.nextStep = plan.nextStep;
  if (accept.notes && plan.notesUpdate) patch.notes = plan.notesUpdate;
  if (Object.keys(patch).length) {
    await updateClient(clientId, patch, source);
    if (patch.health) lines.push(`Health set to ${String(patch.health).replace("_", " ")}`);
    if (patch.nextStep) lines.push("Next step updated");
    if (patch.notes) lines.push("Client notes updated");
  }

  // The meeting itself
  await db
    .update(meetings)
    .set({ status: "minuted", title: plan.title || meeting.title, attendees: plan.attendees.length ? plan.attendees : meeting.attendees, mom: plan.mom, actionItems })
    .where(eq(meetings.id, id));

  // A searchable document for Phase 4
  const [doc] = await db
    .insert(documents)
    .values({ clientId, type: "mom", title: `${plan.title || meeting.title} minutes`, content: plan.mom, tags: ["mom"], meetingId: id })
    .returning();
  await db.update(meetings).set({ documentId: doc.id }).where(eq(meetings.id, id));

  // Timeline entries
  await db.insert(activities).values({
    clientId,
    type: "meeting",
    title: `Minutes ready: ${plan.title || meeting.title}`,
    body: plan.summary,
    occurredAt: meeting.heldAt,
    source,
    meetingId: id,
  });
  if (plan.decisions.length) {
    await db.insert(activities).values({
      clientId,
      type: "decision",
      title: plan.decisions.length === 1 ? plan.decisions[0] : `${plan.decisions.length} decisions in ${plan.title || meeting.title}`,
      body: plan.decisions.length > 1 ? plan.decisions.map((d, i) => `${i + 1}. ${d}`).join("\n") : null,
      occurredAt: new Date(meeting.heldAt.getTime() + 60_000),
      source,
      meetingId: id,
    });
    lines.push(`${plan.decisions.length} ${plan.decisions.length === 1 ? "decision" : "decisions"} logged`);
  }
  lines.unshift("Minutes saved");
  void clients;
  return { lines };
}
