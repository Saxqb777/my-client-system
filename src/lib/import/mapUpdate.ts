import type { ActionItem, ActivityType, DateChange, Health, MilestoneType, MinutesBody, TaskPriority, TaskStatus } from "@/lib/db/schema";
import { HEALTH, PHASES, phaseLabel } from "@/lib/core/constants";
import { delayText, formatDate } from "@/lib/core/dates";
import { renderMinutesText, projectLabel } from "@/lib/core/minutes";
import { contentTokens, similarity } from "./mapProject";
import type { UpdateExport } from "./updateSchema";

/**
 * Turns a session update into row changes for one client that already exists in Orbit.
 * Pure function over the update and a snapshot of the client's current state, so it can be tested
 * and can feed SQL for the Neon connector today and the REST API in Phase 3.
 *
 * Rules:
 * 1. Client fields change only when the update gives a different value. Each change writes the same
 *    activity line the app would write (Health: A to B, Phase: A to B, Next step: ..., Target date: A to B).
 *    A stated original target date is kept as the baseline, so slips measure against it.
 * 2. A moved phase target date also moves the upcoming target milestone that sat on the old date, with the
 *    reason taken from the update's own "moved" activity, and the app's "X moved: A to B" line.
 * 3. An activity that repeats one already on the timeline for that day is skipped.
 * 4. A meeting is saved as minuted in the standard layout: objective from the summary, one point per decision,
 *    the action table from the action items. The update's own meeting activity for that day links to it.
 *    The update's mom document for that day becomes the meeting's document, so the Word file works.
 * 5. A task that a similar open task already covers is skipped. A task that matches one of the meeting's
 *    action items links to the meeting. Nobody waits on themselves.
 * 6. A closed task closes the open task it names, with the outcome kept in the task details.
 * 7. Risks and open questions append a dated section to the client's risks document.
 * 8. Module progress becomes a document of its own, replacing an earlier one for the same module.
 * 9. The health reason replaces the "Why ..." paragraph in the client notes. Nothing else in the notes moves.
 */

export type UpdateContext = {
  today: string;
  client: {
    id: string;
    name: string;
    code: string;
    system: string | null;
    owner: string;
    phase: string;
    health: Health;
    nextStep: string | null;
    phaseStartDate: string | null;
    phaseTargetDate: string | null;
    phaseTargetOriginal: string | null;
    notes: string | null;
  };
  milestones: { id: string; title: string; type: MilestoneType; date: string; originalDate: string; status: string }[];
  openTasks: { id: string; title: string }[];
  recentActivities: { date: string; title: string }[];
  riskDocumentId: string | null;
  moduleDocumentIds: { id: string; title: string }[];
};

export type MappedUpdate = {
  clientPatch: Partial<{ phase: string; health: Health; nextStep: string | null; phaseStartDate: string | null; phaseTargetDate: string | null; phaseTargetOriginal: string | null; notes: string | null }>;
  milestoneMoves: { id: string; title: string; from: string; to: string; entry: DateChange }[];
  activities: { type: ActivityType; title: string; body: string | null; occurredAt: Date; tags: string[]; linksMeeting: boolean }[];
  meetings: {
    title: string;
    heldAt: Date;
    attendees: string[];
    mom: string;
    minutes: MinutesBody;
    actionItems: ActionItem[];
    document: { title: string; tags: string[] };
  }[];
  tasks: { title: string; details: string | null; status: TaskStatus; priority: TaskPriority; dueDate: string | null; waitingOn: string | null; waitingSince: string | null; fromMeeting: boolean }[];
  closeTasks: { id: string; title: string; outcome: string | null; closedOn: string }[];
  documents: { title: string; type: "brd" | "mom" | "test_cases" | "guide" | "email" | "other"; content: string; tags: string[]; replacesId: string | null }[];
  riskAppend: { documentId: string | null; title: string; text: string } | null;
  notes: string[];
};

const ACTIVITY_TYPES = new Set<ActivityType>(["update", "meeting", "email", "whatsapp", "call", "decision", "issue", "delivery"]);
const PRIORITIES = new Set<TaskPriority>(["low", "normal", "high", "urgent"]);
const DOC_TYPES = new Set(["brd", "mom", "test_cases", "guide", "email", "other"]);

function dubaiNoon(date: string, minuteOffset = 0): Date {
  return new Date(Date.parse(`${date}T08:00:00.000Z`) + minuteOffset * 60_000);
}

/** "Held 9:03 to 10:07 am" gives 09:03 Dubai on that date. Falls back to midday. */
export function meetingTime(date: string, text: string | null | undefined): Date {
  const m = text?.match(/\b(\d{1,2}):(\d{2})(?:\s*(am|pm))?/i);
  if (!m) return dubaiNoon(date);
  let h = Number(m[1]);
  const min = Number(m[2]);
  const ampm = m[3]?.toLowerCase() ?? (text?.match(/\b(am|pm)\b/i)?.[1].toLowerCase() ?? null);
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return dubaiNoon(date);
  return new Date(Date.parse(`${date}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00+04:00`));
}

function mapTaskStatus(status: string | null | undefined, waitingOn: string | null | undefined): TaskStatus {
  const s = (status ?? "todo").toLowerCase();
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "in progress") return "in_progress";
  if (s === "waiting" || (s === "todo" && waitingOn)) return "waiting";
  if (s === "cancelled") return "cancelled";
  return "todo";
}

/** Swaps the "Why at risk: ..." paragraph in the notes, or adds one. */
export function replaceHealthReason(notes: string | null, health: Health, reason: string): string {
  const word = health === "blocked" ? "blocked" : health === "at_risk" ? "at risk" : "on track";
  const line = `Why ${word}: ${reason.trim()}`;
  const blocks = (notes ?? "").split(/\n\s*\n/).filter((b) => b.trim());
  const i = blocks.findIndex((b) => /^Why (at risk|blocked|on track):/i.test(b.trim()));
  if (i >= 0) blocks[i] = line;
  else blocks.push(line);
  return blocks.join("\n\n");
}

export function mapUpdate(input: UpdateExport, ctx: UpdateContext): MappedUpdate {
  const notes: string[] = [];
  const today = input.update_date ?? ctx.today;
  const c = ctx.client;
  const ownerFirst = c.owner.split(/\s+/)[0].toLowerCase();
  const changeLines: string[] = [];

  // Rule 1: client fields
  const clientPatch: MappedUpdate["clientPatch"] = {};
  const u = input.client;
  if (u) {
    const phase = u.phase ? u.phase.toLowerCase().trim() : null;
    if (phase && PHASES.some((p) => p.value === phase) && phase !== c.phase) {
      clientPatch.phase = phase;
      changeLines.push(`Phase: ${phaseLabel(c.phase)} to ${phaseLabel(phase)}`);
    } else if (phase && !PHASES.some((p) => p.value === phase)) {
      notes.push(`Phase "${u.phase}" is not one Orbit knows, left as ${phaseLabel(c.phase)}.`);
    }
    if (u.health && u.health !== c.health) {
      clientPatch.health = u.health;
      changeLines.push(`Health: ${HEALTH[c.health].label} to ${HEALTH[u.health].label}`);
    }
    const next = u.next_step?.trim();
    if (next && next !== (c.nextStep ?? "")) {
      clientPatch.nextStep = next;
      changeLines.push(`Next step: ${next}`);
    }
    if (u.phase_target_date && u.phase_target_date !== c.phaseTargetDate) {
      clientPatch.phaseTargetDate = u.phase_target_date;
      changeLines.push(`Target date: ${c.phaseTargetDate ? formatDate(c.phaseTargetDate) : "none"} to ${formatDate(u.phase_target_date)}`);
      if (!c.phaseTargetOriginal) clientPatch.phaseTargetOriginal = c.phaseTargetDate ?? u.phase_target_date;
    }
    if (u.phase_start_date && u.phase_start_date !== c.phaseStartDate) {
      clientPatch.phaseStartDate = u.phase_start_date;
      changeLines.push(`Start date: ${c.phaseStartDate ? formatDate(c.phaseStartDate) : "none"} to ${formatDate(u.phase_start_date)}`);
    }
    if (u.phase_target_original_date) {
      // The export states the baseline outright, so it wins over any inference.
      if (u.phase_target_original_date !== c.phaseTargetOriginal) clientPatch.phaseTargetOriginal = u.phase_target_original_date;
      else delete clientPatch.phaseTargetOriginal;
    } else if (clientPatch.phase !== undefined && !clientPatch.phaseTargetOriginal) {
      // New phase with no stated baseline: the target in force becomes the baseline, as updateClient does.
      clientPatch.phaseTargetOriginal = clientPatch.phaseTargetDate ?? c.phaseTargetDate ?? null;
    }
    // Rule 9
    const reason = u.health_reason?.trim();
    if (reason) {
      const health = u.health ?? c.health;
      const rewritten = replaceHealthReason(c.notes, health, reason);
      if (rewritten !== (c.notes ?? "")) clientPatch.notes = rewritten;
    }
  }

  // Rule 2: milestone on the old target date
  const milestoneMoves: MappedUpdate["milestoneMoves"] = [];
  if (clientPatch.phaseTargetDate && c.phaseTargetDate) {
    const target = ctx.milestones.find((m) => m.status === "upcoming" && m.type === "target" && m.date === c.phaseTargetDate);
    if (target) {
      const movedAct = input.activities.find((a) => /\bmoved\b/i.test(a.title));
      const reason = movedAct ? movedAct.title.trim() : `Per update of ${formatDate(today)}`;
      milestoneMoves.push({
        id: target.id,
        title: target.title,
        from: target.date,
        to: clientPatch.phaseTargetDate,
        entry: { from: target.date, to: clientPatch.phaseTargetDate, at: dubaiNoon(today).toISOString(), reason },
      });
      const slip = delayText(target.originalDate, clientPatch.phaseTargetDate);
      changeLines.push(`${target.title} moved: ${formatDate(target.date)} to ${formatDate(clientPatch.phaseTargetDate)}${slip ? ` (delayed ${slip} overall)` : ""}. ${reason}`);
    } else {
      notes.push(`No upcoming target milestone sat on ${formatDate(c.phaseTargetDate)}, so only the client target date moved.`);
    }
  }

  // Rule 4: meetings first, so activities and tasks can link to them
  const meetings: MappedUpdate["meetings"] = [];
  const usedDocs = new Set<number>();
  for (const m of input.meetings) {
    const date = m.date ?? today;
    const dayActivity = input.activities.find((a) => (a.date ?? today) === date && (a.type ?? "").toLowerCase() === "meeting");
    const heldAt = meetingTime(date, dayActivity?.detail);
    const title = m.title.trim();
    const objective = m.summary?.trim() ?? "";
    const points = m.decisions.map((d) => ({ topic: "", text: d.trim() })).filter((p) => p.text);
    const actions = m.action_items.map((a) => ({ text: a.text.trim(), owner: a.owner?.trim() || null }));
    const mom = renderMinutesText({
      clientCode: c.code,
      clientName: c.name,
      project: projectLabel(c),
      title,
      heldAt,
      location: null,
      objective,
      points,
      actions,
    });
    const docIndex = input.documents.findIndex((d, i) => !usedDocs.has(i) && (d.type ?? "") === "mom" && (d.date ?? date) === date);
    if (docIndex >= 0) usedDocs.add(docIndex);
    const doc = docIndex >= 0 ? input.documents[docIndex] : null;
    meetings.push({
      title,
      heldAt,
      attendees: m.attendees,
      mom,
      minutes: { objective, points },
      actionItems: m.action_items.map((a) => ({ text: a.text.trim(), owner: a.owner ?? undefined, due: a.due ?? undefined, done: a.done ?? undefined })),
      document: { title: doc?.title.trim() ?? `${title} minutes`, tags: ["mom", ...(doc?.status ? [doc.status] : [])] },
    });
  }

  // Rule 3: activities, then the change lines after them
  const activities: MappedUpdate["activities"] = [];
  let offset = 0;
  for (const a of input.activities) {
    const date = a.date ?? today;
    const title = a.title.trim();
    const twin = ctx.recentActivities.find((r) => r.date === date && similarity(r.title, title) >= 0.6);
    if (twin) {
      notes.push(`Activity "${title}" repeats "${twin.title}" on ${formatDate(date)} and was skipped.`);
      continue;
    }
    const rawType = (a.type ?? "update").toLowerCase();
    const type: ActivityType = ACTIVITY_TYPES.has(rawType as ActivityType) ? (rawType as ActivityType) : rawType === "system" ? "delivery" : "update";
    const linksMeeting = type === "meeting" && meetings.some((m) => m.heldAt.toISOString().slice(0, 10) === dubaiNoon(date).toISOString().slice(0, 10));
    activities.push({ type, title, body: a.detail?.trim() || null, occurredAt: dubaiNoon(date, offset++), tags: [], linksMeeting });
  }
  for (const line of changeLines) activities.push({ type: "update", title: line, body: null, occurredAt: dubaiNoon(today, offset++), tags: [], linksMeeting: false });

  // Rule 5: tasks
  const tasks: MappedUpdate["tasks"] = [];
  const actionTexts = meetings.flatMap((m) => m.actionItems.map((a) => a.text));
  for (const t of input.tasks) {
    const title = t.title.trim();
    const covered = ctx.openTasks.find((o) => similarity(o.title, title) >= 0.6);
    if (covered) {
      notes.push(`Task "${title}" is already covered by "${covered.title}" and was skipped.`);
      continue;
    }
    let status = mapTaskStatus(t.status, t.waiting_on);
    let waitingOn = t.waiting_on?.trim() || null;
    if (waitingOn && contentTokens(waitingOn).has(ownerFirst)) {
      waitingOn = null;
      if (status === "waiting") status = "todo";
      notes.push(`Task "${title}" was waiting on ${c.owner} and is now a plain to do.`);
    }
    const priority = PRIORITIES.has(t.priority as TaskPriority) ? (t.priority as TaskPriority) : "normal";
    tasks.push({
      title,
      details: null,
      status,
      priority,
      dueDate: t.due_date ?? null,
      waitingOn,
      waitingSince: status === "waiting" ? (t.waiting_since ?? today) : null,
      fromMeeting: actionTexts.some((a) => similarity(a, title) >= 0.5),
    });
  }

  // Rule 6: closed tasks
  const closeTasks: MappedUpdate["closeTasks"] = [];
  for (const t of input.tasks_closed) {
    const match = ctx.openTasks.map((o) => ({ o, s: similarity(o.title, t.title) })).filter((x) => x.s >= 0.5).sort((a, b) => b.s - a.s)[0];
    if (!match) {
      notes.push(`Closed task "${t.title}" has no open task to close, nothing changed.`);
      continue;
    }
    closeTasks.push({ id: match.o.id, title: match.o.title, outcome: t.outcome?.trim() || null, closedOn: t.closed_on ?? today });
  }

  // Documents not taken by a meeting
  const documents: MappedUpdate["documents"] = [];
  input.documents.forEach((d, i) => {
    if (usedDocs.has(i)) return;
    const type = (DOC_TYPES.has(d.type ?? "") ? d.type : "other") as MappedUpdate["documents"][number]["type"];
    const content = [d.status ? `Status: ${d.status}` : null, d.date ? `Date: ${formatDate(d.date)}` : null, d.where ? `Where: ${d.where}` : null].filter(Boolean).join("\n");
    documents.push({ title: d.title.trim(), type, content, tags: d.status ? [d.status] : [], replacesId: null });
  });

  // Rule 7: risks and open questions
  let riskAppend: MappedUpdate["riskAppend"] = null;
  if (input.risks.length || input.open_questions.length) {
    const lines: string[] = [`Update ${formatDate(today)}`, ""];
    if (input.risks.length) {
      lines.push("Risks", "");
      for (const r of input.risks) {
        lines.push(`• ${r.risk}`);
        if (r.impact) lines.push(`  Impact: ${r.impact}`);
        if (r.mitigation) lines.push(`  Mitigation: ${r.mitigation}`);
        if (r.owner) lines.push(`  Owner: ${r.owner}`);
      }
      lines.push("");
    }
    if (input.open_questions.length) {
      lines.push("Open questions", "");
      for (const q of input.open_questions) lines.push(`• ${q}`);
    }
    riskAppend = { documentId: ctx.riskDocumentId, title: `${c.name}: risks and open questions`, text: lines.join("\n").trim() };
  }

  // Rule 8: module progress
  if (input.module_progress) {
    const p = input.module_progress;
    const title = `${c.name}: ${p.module} module progress`;
    const lines: string[] = [
      `As of ${formatDate(today)}. Sessions: ${p.sessions.join(", ") || "none listed"}. Held: ${p.sessions_held.join(", ") || "none"}.${p.percent_complete != null ? ` ${p.percent_complete}% complete.` : ""} Ready for BRD: ${p.ready_for_brd ? "yes" : "no"}.`,
      "",
    ];
    if (p.covered.length) lines.push("Covered", "", ...p.covered.map((x) => `• ${x}`), "");
    if (p.partly_covered.length) lines.push("Partly covered", "", ...p.partly_covered.map((x) => `• ${x}`), "");
    if (p.not_covered.length) lines.push("Not covered", "", ...p.not_covered.map((x) => `• ${x}`), "");
    if (p.notes) lines.push("Notes", "", p.notes.trim());
    const previous = ctx.moduleDocumentIds.find((d) => d.title === title);
    documents.push({ title, type: "other", content: lines.join("\n").trim(), tags: ["brd", "progress"], replacesId: previous?.id ?? null });
  }

  return { clientPatch, milestoneMoves, activities, meetings, tasks, closeTasks, documents, riskAppend, notes };
}
