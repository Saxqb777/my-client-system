import { and, asc, desc, eq, gte, inArray, lt, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, tasks, type ActivitySource, type Client, type Evidence, type Task, type TaskOrigin, type TaskStatus } from "@/lib/db/schema";
import { todayISO } from "@/lib/core/dates";
import type { TaskInput, TaskPatch } from "@/lib/validation";

export type TaskWithClient = Task & { client: Client | null };

const OPEN: TaskStatus[] = ["todo", "in_progress", "waiting"];

export async function listTasks(opts: {
  clientId?: string;
  status?: TaskStatus[] | "open";
  dueBefore?: string;
  limit?: number;
} = {}): Promise<TaskWithClient[]> {
  const db = await getDb();
  const filters: SQL[] = [];
  if (opts.clientId) filters.push(eq(tasks.clientId, opts.clientId));
  if (opts.status === "open") filters.push(inArray(tasks.status, OPEN));
  else if (opts.status?.length) filters.push(inArray(tasks.status, opts.status));
  if (opts.dueBefore) filters.push(lte(tasks.dueDate, opts.dueBefore));
  return db.query.tasks.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { client: true },
    orderBy: [asc(tasks.dueDate), desc(tasks.priority), desc(tasks.createdAt)],
    limit: opts.limit ?? 200,
  });
}

export async function listOverdueTasks(): Promise<TaskWithClient[]> {
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: and(inArray(tasks.status, OPEN), lt(tasks.dueDate, todayISO())),
    with: { client: true },
    orderBy: [asc(tasks.dueDate)],
  });
  return rows.filter((t) => !t.client?.archivedAt);
}

export async function listTasksDueToday(): Promise<TaskWithClient[]> {
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: and(inArray(tasks.status, OPEN), eq(tasks.dueDate, todayISO())),
    with: { client: true },
    orderBy: [desc(tasks.priority)],
  });
  return rows.filter((t) => !t.client?.archivedAt);
}

export async function listWaitingTasks(): Promise<TaskWithClient[]> {
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: eq(tasks.status, "waiting"),
    with: { client: true },
    orderBy: [asc(tasks.waitingSince)],
  });
  return rows.filter((t) => !t.client?.archivedAt);
}

export type TaskLinks = {
  sourceActivityId?: string | null;
  sourceMeetingId?: string | null;
  /** manual by default; meeting for action items Orbit picked up; email for pasted threads. */
  origin?: TaskOrigin;
  evidence?: Evidence | null;
};

export async function createTask(input: TaskInput, source: ActivitySource = "app", links: TaskLinks = {}): Promise<Task> {
  return (await createTaskFull(input, source, links)).task;
}

/** Creates the task and returns the activity written for it, so the change log can link the two. */
export async function createTaskFull(input: TaskInput, source: ActivitySource = "app", links: TaskLinks = {}): Promise<{ task: Task; activityId: string | null }> {
  const db = await getDb();
  const status = input.waitingOn && input.status === "todo" ? "waiting" : input.status;
  const [row] = await db
    .insert(tasks)
    .values({
      ...input,
      status,
      waitingSince: status === "waiting" ? todayISO() : null,
      sourceActivityId: links.sourceActivityId ?? null,
      sourceMeetingId: links.sourceMeetingId ?? null,
      origin: links.origin ?? "manual",
      evidenceQuote: links.evidence?.quote ?? null,
      evidenceAt: links.evidence?.at ?? null,
    })
    .returning();
  let activityId: string | null = null;
  if (input.clientId) {
    const [a] = await db
      .insert(activities)
      .values({
        clientId: input.clientId,
        type: "update",
        title: status === "waiting" ? `Waiting on ${input.waitingOn}: ${row.title}` : `Task added: ${row.title}`,
        source,
        meetingId: links.sourceMeetingId ?? null,
      })
      .returning({ id: activities.id });
    activityId = a?.id ?? null;
  }
  return { task: row, activityId };
}

export async function updateTask(id: string, patch: TaskPatch, source: ActivitySource = "app"): Promise<Task> {
  return (await updateTaskFull(id, patch, source)).task;
}

/** The change itself, with the activity id it wrote (only a completion writes one) and extra links for meeting tasks. */
export async function updateTaskFull(
  id: string,
  patch: TaskPatch,
  source: ActivitySource = "app",
  links: { sourceMeetingId?: string | null; evidence?: Evidence | null; origin?: TaskOrigin } = {},
): Promise<{ task: Task; before: Task; activityId: string | null }> {
  const db = await getDb();
  const before = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!before) throw new Error("Task not found");
  const values: Partial<typeof tasks.$inferInsert> = { ...patch };
  if (links.sourceMeetingId) values.sourceMeetingId = links.sourceMeetingId;
  if (links.origin) values.origin = links.origin;
  if (links.evidence) {
    values.evidenceQuote = links.evidence.quote;
    values.evidenceAt = links.evidence.at;
  }
  if (patch.status && patch.status !== before.status) {
    values.completedAt = patch.status === "done" ? new Date() : null;
    if (patch.status === "waiting") values.waitingSince = before.waitingSince ?? todayISO();
    if (patch.status !== "waiting") values.waitingSince = null;
  }
  if (patch.waitingOn && !patch.status && before.status !== "waiting") {
    values.status = "waiting";
    values.waitingSince = todayISO();
  }
  const [row] = await db.update(tasks).set(values).where(eq(tasks.id, id)).returning();
  let activityId: string | null = null;
  if (before.clientId && patch.status === "done" && before.status !== "done") {
    const [a] = await db
      .insert(activities)
      .values({ clientId: before.clientId, type: "delivery", title: `Done: ${row.title}`, source, meetingId: links.sourceMeetingId ?? null })
      .returning({ id: activities.id });
    activityId = a?.id ?? null;
  }
  return { task: row, before, activityId };
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(tasks).where(eq(tasks.id, id));
}

/** Open tasks for the tasks page, oldest manual order first within a day. */
export async function listOpenTasks(): Promise<TaskWithClient[]> {
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: inArray(tasks.status, OPEN),
    with: { client: true },
    orderBy: [asc(tasks.sortOrder), asc(tasks.dueDate), desc(tasks.priority), asc(tasks.createdAt)],
    limit: 500,
  });
  return rows.filter((t) => !t.client?.archivedAt);
}

/** Tasks finished since the given time, newest first. */
export async function listDoneSince(since: Date): Promise<TaskWithClient[]> {
  const db = await getDb();
  const rows = await db.query.tasks.findMany({
    where: and(eq(tasks.status, "done"), gte(tasks.completedAt, since)),
    with: { client: true },
    orderBy: [desc(tasks.completedAt)],
    limit: 100,
  });
  return rows;
}

/** Saves a manual order. Position in the list becomes sort_order. */
export async function reorderTasks(ids: string[]): Promise<void> {
  const db = await getDb();
  await Promise.all(ids.map((id, i) => db.update(tasks).set({ sortOrder: i }).where(eq(tasks.id, id))));
}
