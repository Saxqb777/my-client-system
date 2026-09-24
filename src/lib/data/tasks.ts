import { and, asc, desc, eq, inArray, lt, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, tasks, type ActivitySource, type Client, type Task, type TaskStatus } from "@/lib/db/schema";
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

export async function createTask(
  input: TaskInput,
  source: ActivitySource = "app",
  links: { sourceActivityId?: string | null; sourceMeetingId?: string | null } = {},
): Promise<Task> {
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
    })
    .returning();
  if (input.clientId) {
    await db.insert(activities).values({
      clientId: input.clientId,
      type: "update",
      title: status === "waiting" ? `Waiting on ${input.waitingOn}: ${row.title}` : `Task added: ${row.title}`,
      source,
    });
  }
  return row;
}

export async function updateTask(id: string, patch: TaskPatch, source: ActivitySource = "app"): Promise<Task> {
  const db = await getDb();
  const before = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!before) throw new Error("Task not found");
  const values: Partial<typeof tasks.$inferInsert> = { ...patch };
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
  if (before.clientId && patch.status === "done" && before.status !== "done") {
    await db.insert(activities).values({
      clientId: before.clientId,
      type: "delivery",
      title: `Done: ${row.title}`,
      source,
    });
  }
  return row;
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(tasks).where(eq(tasks.id, id));
}
