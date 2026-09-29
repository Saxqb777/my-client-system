import { and, desc, eq, gte, inArray, isNull, lte, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, changeLog, clients, documents, meetings, milestones, tasks, type ChangeLogRow, type Client, type Meeting, type NewChangeLogRow } from "@/lib/db/schema";
import { HEALTH } from "@/lib/core/constants";
import { formatDate } from "@/lib/core/dates";
import { applyClientChange } from "./clients";
import { applyMilestoneChange } from "./milestones";
import { updateTaskFull } from "./tasks";

/**
 * The change log: every change Orbit made by itself from a meeting, and the way back.
 * Rows are never deleted. Undo writes the old value back, marks the row undone and leaves a timeline entry.
 */

export type ChangeWithLinks = ChangeLogRow & { client: Client | null; meeting: Meeting | null };

export async function logChange(row: NewChangeLogRow): Promise<ChangeLogRow> {
  const db = await getDb();
  const [r] = await db.insert(changeLog).values(row).returning();
  return r;
}

export async function listChanges(opts: { clientId?: string; meetingId?: string; from?: string; to?: string; limit?: number; includeUndone?: boolean } = {}): Promise<ChangeWithLinks[]> {
  const db = await getDb();
  const filters: SQL[] = [];
  if (opts.clientId) filters.push(eq(changeLog.clientId, opts.clientId));
  if (opts.meetingId) filters.push(eq(changeLog.meetingId, opts.meetingId));
  if (opts.from) filters.push(gte(changeLog.appliedAt, new Date(`${opts.from}T00:00:00+04:00`)));
  if (opts.to) filters.push(lte(changeLog.appliedAt, new Date(`${opts.to}T23:59:59+04:00`)));
  if (opts.includeUndone === false) filters.push(isNull(changeLog.undoneAt));
  const rows = await db.query.changeLog.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { client: true, meeting: true },
    orderBy: [desc(changeLog.appliedAt)],
    limit: opts.limit ?? 200,
  });
  return rows as ChangeWithLinks[];
}

export async function getChange(id: string): Promise<ChangeWithLinks | null> {
  const db = await getDb();
  const row = await db.query.changeLog.findFirst({ where: eq(changeLog.id, id), with: { client: true, meeting: true } });
  return (row as ChangeWithLinks | undefined) ?? null;
}

export async function changesForMeeting(meetingId: string): Promise<ChangeLogRow[]> {
  const db = await getDb();
  return db.query.changeLog.findMany({ where: eq(changeLog.meetingId, meetingId), orderBy: [desc(changeLog.appliedAt)] });
}

/** Change rows behind a set of timeline entries, keyed by activity id. */
export async function changesByActivity(activityIds: string[]): Promise<Map<string, ChangeLogRow>> {
  const out = new Map<string, ChangeLogRow>();
  if (!activityIds.length) return out;
  const db = await getDb();
  const rows = await db.query.changeLog.findMany({ where: inArray(changeLog.activityId, activityIds) });
  for (const r of rows) if (r.activityId) out.set(r.activityId, r);
  return out;
}

export async function countChangesSince(since: Date): Promise<number> {
  const db = await getDb();
  const rows = await db.query.changeLog.findMany({ where: and(gte(changeLog.appliedAt, since), isNull(changeLog.undoneAt)), columns: { id: true } });
  return rows.length;
}

/** Health values, dates and text all live in the log as strings. This reads them back for display. */
export function displayValue(field: string, value: string | null): string {
  if (value === null || value === "") return "none";
  if (field === "health") return HEALTH[value as keyof typeof HEALTH]?.label ?? value;
  if (/_date$|^date$/.test(field) && /^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
  if (field === "status" && value === "done") return "Done";
  if (field === "created") return value;
  return value;
}

export type UndoResult = { ok: true } | { ok: false; conflict: true; current: string | null; message: string } | { ok: false; conflict: false; message: string };

/** What the entity holds right now for the logged field, as the log would store it. */
async function currentValue(row: ChangeLogRow): Promise<string | null | undefined> {
  const db = await getDb();
  if (row.entityType === "client") {
    const c = await db.query.clients.findFirst({ where: eq(clients.id, row.entityId) });
    if (!c) return undefined;
    switch (row.field) {
      case "health":
        return c.health;
      case "next_step":
        return c.nextStep;
      case "phase_start_date":
        return c.phaseStartDate;
      case "phase_target_date":
        return c.phaseTargetDate;
      case "notes":
        return c.notes;
    }
  }
  if (row.entityType === "milestone") {
    const m = await db.query.milestones.findFirst({ where: eq(milestones.id, row.entityId) });
    if (!m) return undefined;
    return row.field === "date" ? m.date : row.field === "status" ? m.status : undefined;
  }
  if (row.entityType === "task") {
    const t = await db.query.tasks.findFirst({ where: eq(tasks.id, row.entityId) });
    if (!t) return undefined;
    switch (row.field) {
      case "created":
        return t.status === "cancelled" ? "cancelled" : t.title;
      case "status":
        return t.status;
      case "due_date":
        return t.dueDate;
      case "waiting_on":
        return t.waitingOn;
    }
  }
  if (row.entityType === "document") {
    const d = await db.query.documents.findFirst({ where: eq(documents.id, row.entityId) });
    if (!d) return undefined;
    return d.content;
  }
  return undefined;
}

/**
 * Puts the old value back. If the field moved again after Orbit's change, the caller gets a conflict and must
 * ask Saaqib before forcing it. A created task is cancelled rather than deleted, nothing is ever removed.
 */
export async function undoChange(id: string, opts: { force?: boolean } = {}): Promise<UndoResult> {
  const db = await getDb();
  const row = await db.query.changeLog.findFirst({ where: eq(changeLog.id, id) });
  if (!row) return { ok: false, conflict: false, message: "Change not found" };
  if (row.undoneAt) return { ok: false, conflict: false, message: "Already undone" };

  const current = await currentValue(row);
  if (current === undefined) return { ok: false, conflict: false, message: "The record this change touched no longer exists" };
  const expected = row.field === "created" ? row.newValue : row.newValue;
  const same = (current ?? "") === (expected ?? "");
  if (!same && !opts.force) {
    return { ok: false, conflict: true, current: current ?? null, message: `This field changed again after Orbit set it. It now reads "${displayValue(row.field, current ?? null)}".` };
  }

  const source = "system" as const;
  const undoneLabel = `Undone: ${row.label}`;
  let activityId: string | null = null;

  if (row.entityType === "client") {
    const key = ({ health: "health", next_step: "nextStep", phase_start_date: "phaseStartDate", phase_target_date: "phaseTargetDate", notes: "notes" } as const)[row.field as "health" | "next_step" | "phase_start_date" | "phase_target_date" | "notes"];
    if (!key) return { ok: false, conflict: false, message: `Cannot undo field ${row.field}` };
    const patch = { [key]: row.oldValue } as Parameters<typeof applyClientChange>[1];
    const res = await applyClientChange(row.entityId, patch, source, row.meetingId);
    activityId = res.activityIds[0] ?? null;
  } else if (row.entityType === "milestone") {
    if (row.field === "date" && row.oldValue) {
      const res = await applyMilestoneChange(row.entityId, { date: row.oldValue, reason: "Undone by Saaqib" }, source, row.meetingId);
      activityId = res.activityIds[0] ?? null;
    } else if (row.field === "status" && row.oldValue) {
      const res = await applyMilestoneChange(row.entityId, { status: row.oldValue as "upcoming" | "done" | "missed" | "cancelled" }, source, row.meetingId);
      activityId = res.activityIds[0] ?? null;
    } else return { ok: false, conflict: false, message: `Cannot undo field ${row.field}` };
  } else if (row.entityType === "task") {
    if (row.field === "created") {
      await updateTaskFull(row.entityId, { status: "cancelled" }, source);
    } else if (row.field === "status") {
      await updateTaskFull(row.entityId, { status: (row.oldValue ?? "todo") as "todo" | "in_progress" | "waiting" | "done" | "cancelled" }, source);
    } else if (row.field === "due_date") {
      await updateTaskFull(row.entityId, { dueDate: row.oldValue }, source);
    } else if (row.field === "waiting_on") {
      await updateTaskFull(row.entityId, { waitingOn: row.oldValue, status: row.oldValue ? "waiting" : "todo" }, source);
    } else return { ok: false, conflict: false, message: `Cannot undo field ${row.field}` };
  } else if (row.entityType === "document") {
    await db.update(documents).set({ content: row.oldValue ?? "" }).where(eq(documents.id, row.entityId));
  }

  if (!activityId && row.clientId) {
    const [a] = await db.insert(activities).values({ clientId: row.clientId, type: "update", title: undoneLabel, source, meetingId: row.meetingId }).returning({ id: activities.id });
    activityId = a?.id ?? null;
  } else if (activityId) {
    await db.update(activities).set({ title: undoneLabel }).where(eq(activities.id, activityId));
  }

  await db.update(changeLog).set({ undoneAt: new Date() }).where(eq(changeLog.id, id));
  void meetings;
  return { ok: true };
}
