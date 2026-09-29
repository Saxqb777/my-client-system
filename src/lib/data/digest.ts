import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { meetings, tasks } from "@/lib/db/schema";
import { todayISO } from "@/lib/core/dates";
import { listChanges, type ChangeWithLinks } from "./changeLog";
import type { MeetingWithClient } from "./meetings";
import type { TaskWithClient } from "./tasks";

/** What happened today without Saaqib touching anything: for the home page digest. */
export type Digest = {
  processed: MeetingWithClient[];
  changes: ChangeWithLinks[];
  newTasks: TaskWithClient[];
  needsReview: MeetingWithClient[];
  failed: MeetingWithClient[];
  empty: boolean;
};

export async function getDigest(): Promise<Digest> {
  const db = await getDb();
  const today = todayISO();
  const start = new Date(`${today}T00:00:00+04:00`);
  const [processed, changes, newTasks, review] = await Promise.all([
    db.query.meetings.findMany({ where: and(eq(meetings.processing, "processed"), gte(meetings.processedAt, start)), with: { client: true }, orderBy: [desc(meetings.processedAt)], limit: 10 }),
    listChanges({ from: today, to: today, limit: 30 }),
    db.query.tasks.findMany({ where: and(eq(tasks.origin, "meeting"), gte(tasks.createdAt, start), inArray(tasks.status, ["todo", "in_progress", "waiting"])), with: { client: true }, orderBy: [desc(tasks.createdAt)], limit: 20 }),
    db.query.meetings.findMany({ where: inArray(meetings.processing, ["needs_review", "failed"]), with: { client: true }, orderBy: [desc(meetings.heldAt)], limit: 10 }),
  ]);
  const needsReview = (review as MeetingWithClient[]).filter((m) => m.processing === "needs_review");
  const failed = (review as MeetingWithClient[]).filter((m) => m.processing === "failed");
  return {
    processed: processed as MeetingWithClient[],
    changes,
    newTasks: newTasks as TaskWithClient[],
    needsReview,
    failed,
    empty: processed.length + changes.length + newTasks.length + needsReview.length + failed.length === 0,
  };
}
