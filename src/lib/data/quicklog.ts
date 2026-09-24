import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, clients, type Client } from "@/lib/db/schema";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate, todayISO } from "@/lib/core/dates";
import type { QuickLogPlan } from "@/lib/ai/quicklog";
import { updateClient } from "./clients";
import { createMilestone, findClientMilestones, updateMilestone } from "./milestones";
import { createTask } from "./tasks";

export type ApplyResult = { lines: string[]; activityId: string | null; client: Pick<Client, "id" | "name" | "code"> };

/**
 * Applies a confirmed quick log plan. The headline activity goes in first, then every change it implies.
 */
export async function applyQuickLog(plan: QuickLogPlan, clientId: string, source: "quick_log" | "api" | "claude_code" = "quick_log"): Promise<ApplyResult> {
  const db = await getDb();
  const client = await db.query.clients.findFirst({ where: eq(clients.id, clientId) });
  if (!client) throw new Error("Client not found");
  const lines: string[] = [];
  let activityId: string | null = null;

  if (plan.activity) {
    const [row] = await db
      .insert(activities)
      .values({
        clientId,
        type: plan.activity.type,
        title: plan.activity.title,
        body: plan.activity.body,
        source,
      })
      .returning();
    activityId = row.id;
    lines.push(`Logged: ${row.title}`);
  }

  const patch: Record<string, unknown> = {};
  if (plan.clientUpdates.health) patch.health = plan.clientUpdates.health;
  if (plan.clientUpdates.phase) patch.phase = plan.clientUpdates.phase;
  if (plan.clientUpdates.nextStep) patch.nextStep = plan.clientUpdates.nextStep;
  if (Object.keys(patch).length) {
    await updateClient(clientId, patch, source);
    if (patch.health) lines.push(`Health set to ${String(patch.health).replace("_", " ")}`);
    if (patch.phase) lines.push(`Phase set to ${String(patch.phase)}`);
    if (patch.nextStep) lines.push(`Next step updated`);
  }

  for (const m of plan.milestoneUpdates) {
    const existing = await findClientMilestones(clientId, [m.type]);
    const byTitle = m.title ? existing.find((e) => e.title.toLowerCase() === m.title!.toLowerCase()) : undefined;
    const target = byTitle ?? existing[0];
    const label = m.title ?? MILESTONE_TYPES[m.type].label;
    if (target) {
      if (m.newDate && m.newDate !== target.date) {
        await updateMilestone(target.id, { date: m.newDate }, source);
        lines.push(`${target.title} moved to ${formatDate(m.newDate)}`);
      }
      if (m.markDone) {
        await updateMilestone(target.id, { status: "done" }, source);
        lines.push(`${target.title} marked done`);
      }
    } else {
      const date = m.newDate ?? todayISO();
      const created = await createMilestone({ clientId, title: label, type: m.type, date, notes: null }, source);
      lines.push(`${label} set for ${formatDate(date)}`);
      if (m.markDone) {
        await updateMilestone(created.id, { status: "done" }, source);
        lines.push(`${label} marked done`);
      }
    }
  }

  for (const t of plan.tasks) {
    await createTask(
      {
        clientId,
        title: t.title,
        details: null,
        status: t.waitingOn ? "waiting" : "todo",
        priority: t.priority,
        dueDate: t.dueDate,
        waitingOn: t.waitingOn,
      },
      source,
      { sourceActivityId: activityId },
    );
    lines.push(t.waitingOn ? `Waiting on ${t.waitingOn}: ${t.title}` : `Task: ${t.title}`);
  }

  return { lines, activityId, client: { id: client.id, name: client.name, code: client.code } };
}
