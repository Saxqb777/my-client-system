import { and, asc, count, desc, eq, gte, inArray, isNull, max, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, clients, meetings, milestones, people, tasks, type Client, type Milestone } from "@/lib/db/schema";
import { CLIENT_HUES, HEALTH, phaseLabel } from "@/lib/core/constants";
import { formatDate, todayISO } from "@/lib/core/dates";
import type { ClientInput, ClientPatch } from "@/lib/validation";
import type { ActivitySource } from "@/lib/db/schema";

export type ClientSummary = Client & {
  activityCount14d: number;
  openTasks: number;
  waitingTasks: number;
  nextMilestone: Milestone | null;
  lastActivityAt: Date | null;
};

export async function listClients(opts: { includeArchived?: boolean } = {}): Promise<Client[]> {
  const db = await getDb();
  return db.query.clients.findMany({
    where: opts.includeArchived ? undefined : isNull(clients.archivedAt),
    orderBy: [asc(clients.sortOrder), asc(clients.name)],
  });
}

export async function listClientSummaries(opts: { includeArchived?: boolean } = {}): Promise<ClientSummary[]> {
  const db = await getDb();
  const rows = await listClients(opts);
  if (rows.length === 0) return [];
  const ids = rows.map((c) => c.id);
  const since = new Date(Date.now() - 14 * 24 * 3600 * 1000);
  const today = todayISO();

  const [actCounts, lastActs, openTaskCounts, waitingCounts, upcoming] = await Promise.all([
    db
      .select({ clientId: activities.clientId, n: count() })
      .from(activities)
      .where(and(inArray(activities.clientId, ids), gte(activities.occurredAt, since)))
      .groupBy(activities.clientId),
    db
      .select({ clientId: activities.clientId, last: max(activities.occurredAt) })
      .from(activities)
      .where(inArray(activities.clientId, ids))
      .groupBy(activities.clientId),
    db
      .select({ clientId: tasks.clientId, n: count() })
      .from(tasks)
      .where(and(inArray(tasks.clientId, ids), inArray(tasks.status, ["todo", "in_progress", "waiting"])))
      .groupBy(tasks.clientId),
    db
      .select({ clientId: tasks.clientId, n: count() })
      .from(tasks)
      .where(and(inArray(tasks.clientId, ids), eq(tasks.status, "waiting")))
      .groupBy(tasks.clientId),
    db.query.milestones.findMany({
      where: and(inArray(milestones.clientId, ids), eq(milestones.status, "upcoming"), gte(milestones.date, today)),
      orderBy: [asc(milestones.date)],
    }),
  ]);

  const byId = <T extends { clientId: string | null }>(list: T[]) => {
    const m = new Map<string, T>();
    for (const r of list) if (r.clientId && !m.has(r.clientId)) m.set(r.clientId, r);
    return m;
  };
  const a = byId(actCounts);
  const l = byId(lastActs);
  const o = byId(openTaskCounts);
  const w = byId(waitingCounts);
  const nextM = byId(upcoming);

  return rows.map((c) => ({
    ...c,
    activityCount14d: Number(a.get(c.id)?.n ?? 0),
    openTasks: Number(o.get(c.id)?.n ?? 0),
    waitingTasks: Number(w.get(c.id)?.n ?? 0),
    nextMilestone: nextM.get(c.id) ?? null,
    lastActivityAt: (l.get(c.id)?.last as Date | null | undefined) ?? null,
  }));
}

export async function getClient(id: string) {
  const db = await getDb();
  return db.query.clients.findFirst({
    where: eq(clients.id, id),
    with: {
      people: { orderBy: [desc(people.isPrimary), asc(people.name)] },
      milestones: { orderBy: [asc(milestones.date)] },
      tasks: { orderBy: [asc(tasks.dueDate), desc(tasks.createdAt)] },
      activities: { orderBy: [desc(activities.occurredAt)], limit: 80 },
      meetings: { orderBy: [desc(meetings.heldAt)] },
    },
  });
}

export async function getClientByCode(code: string) {
  const db = await getDb();
  return db.query.clients.findFirst({ where: eq(clients.code, code.toUpperCase()) });
}

function nextHue(existing: Client[]): string {
  const used = new Set(existing.map((c) => c.color).filter(Boolean));
  const free = CLIENT_HUES.find((h) => !used.has(String(h)));
  return String(free ?? CLIENT_HUES[existing.length % CLIENT_HUES.length]);
}

export async function createClient(input: ClientInput, source: ActivitySource = "app"): Promise<Client> {
  const db = await getDb();
  const existing = await listClients({ includeArchived: true });
  if (existing.some((c) => c.code === input.code)) {
    throw new Error(`Code ${input.code} is already used`);
  }
  const [row] = await db
    .insert(clients)
    .values({
      ...input,
      color: input.color ?? nextHue(existing),
      phaseTargetOriginal: input.phaseTargetDate ?? null,
      sortOrder: existing.length,
    })
    .returning();
  await db.insert(activities).values({
    clientId: row.id,
    type: "update",
    title: `Client added: ${row.name}`,
    source,
  });
  return row;
}

type ChangeLine = { title: string };

function describeChanges(before: Client, patch: ClientPatch): ChangeLine[] {
  const lines: ChangeLine[] = [];
  if (patch.health !== undefined && patch.health !== before.health) {
    lines.push({ title: `Health: ${HEALTH[before.health].label} to ${HEALTH[patch.health].label}` });
  }
  if (patch.phase !== undefined && patch.phase !== before.phase) {
    lines.push({ title: `Phase: ${phaseLabel(before.phase)} to ${phaseLabel(patch.phase)}` });
  }
  if (patch.nextStep !== undefined && (patch.nextStep ?? "") !== (before.nextStep ?? "")) {
    lines.push({ title: patch.nextStep ? `Next step: ${patch.nextStep}` : "Next step cleared" });
  }
  if (patch.owner !== undefined && patch.owner !== before.owner) {
    lines.push({ title: `Owner: ${before.owner} to ${patch.owner}` });
  }
  if (patch.phaseTargetDate !== undefined && (patch.phaseTargetDate ?? "") !== (before.phaseTargetDate ?? "")) {
    lines.push({
      title: patch.phaseTargetDate
        ? `Target date: ${before.phaseTargetDate ? formatDate(before.phaseTargetDate) : "none"} to ${formatDate(patch.phaseTargetDate)}`
        : "Target date cleared",
    });
  }
  if (patch.phaseStartDate !== undefined && (patch.phaseStartDate ?? "") !== (before.phaseStartDate ?? "")) {
    lines.push({
      title: patch.phaseStartDate
        ? `Start date: ${before.phaseStartDate ? formatDate(before.phaseStartDate) : "none"} to ${formatDate(patch.phaseStartDate)}`
        : "Start date cleared",
    });
  }
  return lines;
}

export async function updateClient(
  id: string,
  patch: ClientPatch,
  source: ActivitySource = "app",
): Promise<Client> {
  const db = await getDb();
  const before = await db.query.clients.findFirst({ where: eq(clients.id, id) });
  if (!before) throw new Error("Client not found");
  if (patch.code && patch.code !== before.code) {
    const clash = await getClientByCode(patch.code);
    if (clash && clash.id !== id) throw new Error(`Code ${patch.code} is already used`);
  }

  const values: Partial<typeof clients.$inferInsert> = { ...patch };
  const statusTouched = ["health", "phase", "nextStep", "owner", "phaseStartDate", "phaseTargetDate"].some(
    (k) => k in patch,
  );
  if (statusTouched && before.demoStatus) values.demoStatus = false;

  if (patch.phaseTargetDate !== undefined && patch.phaseTargetDate !== before.phaseTargetDate) {
    // Remember the first target ever set for this phase so slips can be measured.
    if (!before.phaseTargetOriginal) values.phaseTargetOriginal = before.phaseTargetDate ?? patch.phaseTargetDate;
  }
  if (patch.phase !== undefined && patch.phase !== before.phase) {
    // New phase: the next target set becomes the new baseline.
    if (patch.phaseTargetDate !== undefined) values.phaseTargetOriginal = patch.phaseTargetDate;
    else values.phaseTargetOriginal = before.phaseTargetDate;
  }

  const [row] = await db.update(clients).set(values).where(eq(clients.id, id)).returning();
  const lines = describeChanges(before, patch);
  if (lines.length) {
    await db.insert(activities).values(
      lines.map((l) => ({ clientId: id, type: "update" as const, title: l.title, source })),
    );
  }
  return row;
}

export async function setArchived(id: string, archived: boolean): Promise<Client> {
  const db = await getDb();
  const [row] = await db
    .update(clients)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(clients.id, id))
    .returning();
  await db.insert(activities).values({
    clientId: id,
    type: "update",
    title: archived ? "Client archived" : "Client restored",
    source: "system",
  });
  return row;
}

export async function deleteClient(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(clients).where(eq(clients.id, id));
}

export async function reorderClients(ids: string[]): Promise<void> {
  const db = await getDb();
  await Promise.all(ids.map((id, i) => db.update(clients).set({ sortOrder: i }).where(eq(clients.id, id))));
}

export async function healthCounts() {
  const db = await getDb();
  const rows = await db
    .select({ health: clients.health, n: count() })
    .from(clients)
    .where(isNull(clients.archivedAt))
    .groupBy(clients.health);
  const out = { on_track: 0, at_risk: 0, blocked: 0 };
  for (const r of rows) out[r.health] = Number(r.n);
  return out;
}

export const _sql = sql;
