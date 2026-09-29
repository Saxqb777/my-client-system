import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getDb } from "@/lib/db";
import { activities, meetings, milestones, tasks, type ReportRow, type WeeklyReport } from "@/lib/db/schema";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "@/lib/ai/client";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { addDaysISO, formatDate, todayISO } from "@/lib/core/dates";
import { listClients } from "@/lib/data/clients";
import { getReport, saveReport } from "@/lib/data/reports";
import { buildRows, cell, doneText, mergeRows, nextText, riskFragments, weekLabel, type ClientWeek, type WeekContext } from "./build";

/**
 * Gathers the week for every active client, writes the three prose cells with Claude (rules when no key),
 * merges Saaqib's hand edits and saves into weekly_reports. Other Work meetings are never used.
 */

function dubai(date: string, end = false): Date {
  return new Date(`${date}T${end ? "23:59:59" : "00:00:00"}+04:00`);
}

export async function gatherWeek(weekStart: string, weekEnd: string): Promise<WeekContext> {
  const db = await getDb();
  const clients = await listClients();
  const ids = clients.map((c) => c.id);
  const from = dubai(weekStart);
  const to = dubai(weekEnd, true);
  const today = todayISO();
  const nextWeekEnd = addDaysISO(weekEnd, 7);
  const horizon = addDaysISO(weekEnd, 14);
  if (!ids.length) return { weekStart, weekEnd, today, clients: [] };

  const [weekMeetings, weekActivities, doneTasks, dueTasks, allMilestones] = await Promise.all([
    db.query.meetings.findMany({ where: and(inArray(meetings.clientId, ids), eq(meetings.otherWork, false), gte(meetings.heldAt, from), lte(meetings.heldAt, to), inArray(meetings.status, ["held", "minuted"])), orderBy: [asc(meetings.heldAt)] }),
    db.query.activities.findMany({ where: and(inArray(activities.clientId, ids), gte(activities.occurredAt, from), lte(activities.occurredAt, to)), orderBy: [asc(activities.occurredAt)] }),
    db.query.tasks.findMany({ where: and(inArray(tasks.clientId, ids), eq(tasks.status, "done"), gte(tasks.completedAt, from), lte(tasks.completedAt, to)) }),
    db.query.tasks.findMany({ where: and(inArray(tasks.clientId, ids), inArray(tasks.status, ["todo", "in_progress", "waiting"]), gte(tasks.dueDate, addDaysISO(weekEnd, 1)), lte(tasks.dueDate, nextWeekEnd)), orderBy: [asc(tasks.dueDate)] }),
    db.query.milestones.findMany({ where: inArray(milestones.clientId, ids), orderBy: [asc(milestones.date)] }),
  ]);

  const inWeek = (iso: string) => iso >= from.toISOString() && iso <= to.toISOString();
  const rows: ClientWeek[] = clients.map((c) => {
    const decisions = weekActivities.filter((a) => a.clientId === c.id && a.type === "decision");
    return {
      client: { id: c.id, name: c.name, code: c.code, owner: c.owner, health: c.health, nextStep: c.nextStep, phase: c.phase, phaseStartDate: c.phaseStartDate, phaseTargetDate: c.phaseTargetDate, phaseTargetOriginal: c.phaseTargetOriginal, notes: c.notes },
      meetings: weekMeetings
        .filter((m) => m.clientId === c.id)
        .map((m) => ({ title: m.title, heldAt: m.heldAt.toISOString(), summary: m.minutes?.proposal?.summary?.trim() || m.minutes?.objective?.trim() || null, decisions: decisions.filter((d) => d.meetingId === m.id).map((d) => d.title) })),
      activities: weekActivities.filter((a) => a.clientId === c.id && (a.type === "delivery" || a.type === "decision" || a.type === "issue")).map((a) => ({ type: a.type, title: a.title, occurredAt: a.occurredAt.toISOString() })),
      doneTasks: doneTasks.filter((t) => t.clientId === c.id).map((t) => ({ title: t.title, completedAt: t.completedAt!.toISOString() })),
      dueNextWeek: dueTasks.filter((t) => t.clientId === c.id).map((t) => ({ title: t.title, dueDate: t.dueDate, waitingOn: t.waitingOn })),
      milestones: allMilestones
        .filter((m) => m.clientId === c.id && m.status !== "cancelled")
        .map((m) => {
          const moved = [...m.dateHistory].reverse().find((h) => inWeek(h.at));
          return { title: m.title, type: m.type, date: m.date, originalDate: m.originalDate, status: m.status, movedThisWeek: moved ? { from: moved.from, to: moved.to, reason: moved.reason } : null };
        })
        .filter((m) => m.movedThisWeek || (m.status === "done" ? false : m.date <= horizon) || m.status === "missed")
        .concat(
          allMilestones.filter((m) => m.clientId === c.id && m.status === "done" && m.completedAt && m.completedAt >= from && m.completedAt <= to).map((m) => ({ title: m.title, type: m.type, date: m.date, originalDate: m.originalDate, status: m.status, movedThisWeek: null })),
        ),
      risks: weekActivities.filter((a) => a.clientId === c.id && a.type === "issue").map((a) => a.title.replace(/^Risk:\s*/i, "")),
    };
  });
  return { weekStart, weekEnd, today, clients: rows };
}

const cellsSchema = z.object({
  rows: z.array(
    z.object({
      clientId: z.string(),
      done: z.string().describe("Done this week, under 220 characters, past tense, facts only"),
      risk: z.string().describe("Risk / Delay, under 220 characters, or the single word None"),
      next: z.string().describe("Next week action, under 220 characters, imperative, starts with a verb"),
    }),
  ),
});

async function claudeCells(ctx: WeekContext): Promise<Map<string, { done: string; risk: string; next: string }> | null> {
  const client = anthropic();
  const material = ctx.clients
    .map((c) => {
      const lines = [
        `Client ${c.client.name} (${c.client.code}), id ${c.client.id}. Phase ${c.client.phase}, health ${c.client.health}. Next step on file: ${c.client.nextStep ?? "none"}.`,
        `Meetings this week: ${c.meetings.map((m) => `${m.title} (${formatDate(m.heldAt.slice(0, 10))}): ${m.summary ?? "no summary"}${m.decisions.length ? `. Decisions: ${m.decisions.join("; ")}` : ""}`).join(" | ") || "none"}`,
        `Delivered or decided: ${c.activities.map((a) => a.title).join("; ") || "none"}`,
        `Tasks finished: ${c.doneTasks.map((t) => t.title).join("; ") || "none"}`,
        `Risk material: ${riskFragments(c, ctx.today).join("; ") || "none"}`,
        `Due next week: ${c.dueNextWeek.map((t) => `${t.title}${t.dueDate ? ` by ${formatDate(t.dueDate)}` : ""}${t.waitingOn ? ` (waiting on ${t.waitingOn})` : ""}`).join("; ") || "none"}`,
        `Dates ahead: ${c.milestones.filter((m) => m.status === "upcoming").map((m) => `${m.title} ${formatDate(m.date)}`).join("; ") || "none"}`,
        `Rule based draft. Done: ${doneText(c)} Risk: ${riskFragments(c, ctx.today).join(". ") || "None"} Next: ${nextText(c)}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n");
  const res = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(cellsSchema) },
    system: [
      "You write the weekly client status table Saaqib presents every Friday at Fero. One row per client, three prose cells: Done this week, Risk / Delay, Next week action.",
      "Each cell is one to three short clauses separated by full stops, under 220 characters, facts from the material only, no filler, no adjectives, no greeting. Done is past tense. Next week action starts with a verb. Risk / Delay names the date and the slip when a date moved, and reads None when there is nothing.",
      "Dates are written like 8 Oct 2026. Never invent progress or risks that are not in the material. Keep the client ids exactly as given.",
      `Writing style: ${WRITING_STYLE_RULES}`,
    ].join("\n"),
    messages: [{ role: "user", content: `Week ${weekLabel(ctx.weekStart, ctx.weekEnd)}. Today is ${ctx.today}.\n\n${material}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  const map = new Map<string, { done: string; risk: string; next: string }>();
  for (const r of res.parsed_output.rows) map.set(r.clientId, { done: cell([cleanStyle(r.done)]), risk: cell([cleanStyle(r.risk)]), next: cell([cleanStyle(r.next)]) });
  return map;
}

export async function writeRows(ctx: WeekContext): Promise<{ rows: ReportRow[]; engine: "claude" | "rules" }> {
  const rows = buildRows(ctx);
  if (!aiEnabled() || rows.length === 0) return { rows, engine: "rules" };
  try {
    const written = await claudeCells(ctx);
    if (!written) return { rows, engine: "rules" };
    return { rows: rows.map((r) => (written.has(r.clientId) ? { ...r, ...written.get(r.clientId)! } : r)), engine: "claude" };
  } catch (err) {
    console.error("[orbit] friday cells failed, using rules", err instanceof Error ? err.message : err);
    return { rows, engine: "rules" };
  }
}

/** Generate or regenerate one week. Hand edits survive unless reset is on. */
export async function generateFridayPack(weekStart: string, opts: { reset?: boolean } = {}): Promise<{ report: WeeklyReport; engine: "claude" | "rules" }> {
  const weekEnd = addDaysISO(weekStart, 6);
  const ctx = await gatherWeek(weekStart, weekEnd);
  const { rows, engine } = await writeRows(ctx);
  const previous = await getReport(weekStart);
  const merged = mergeRows(previous?.rows ?? [], rows, opts.reset ?? false);
  const report = await saveReport(weekStart, weekEnd, merged, engine === "claude" ? `claude:${AI_MODEL}` : "rules");
  return { report, engine };
}
