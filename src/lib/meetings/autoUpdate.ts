import type { ActivitySource, ChangeLogRow, Client, Evidence, Milestone, PendingProposal, Task, TaskPriority } from "@/lib/db/schema";
import { HEALTH, MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate, formatDateLong } from "@/lib/core/dates";
import { contentTokens, similarity } from "@/lib/import/mapProject";
import { evidenceGap, evidenceIsClear } from "./evidence";

/**
 * Phase 2, auto updates. After a meeting is processed, Claude's proposal is turned into concrete changes.
 * A change is applied by itself only when the meeting is matched to a client with confidence 0.8 or more,
 * it is not Other Work, and the evidence rule holds (see evidence.ts). Everything else waits on the Review tab.
 * Tasks for Saaqib and waiting on items are created automatically in every case, they only add.
 * Names, contacts and deletions are never touched here. Every automatic change writes a change_log row.
 */

export const AUTO_CONFIDENCE = 0.8;
/** Similarity above which a proposed task is the same as an open one and updates it instead. */
export const TASK_DUPLICATE = 0.6;
/** Similarity above which a "done" report closes an open task. */
export const DONE_MATCH = 0.5;

export type ClientSnapshot = Pick<Client, "id" | "name" | "code" | "owner" | "health" | "nextStep" | "phaseStartDate" | "phaseTargetDate" | "notes">;
export type OpenTask = Pick<Task, "id" | "title" | "clientId" | "dueDate" | "status" | "waitingOn">;
export type MilestoneSnapshot = Pick<Milestone, "id" | "title" | "type" | "date" | "originalDate" | "status">;
export type ActionInput = { text: string; owner: string | null; due: string | null; evidence?: Evidence | null };

export type PlanInput = {
  meeting: { id: string; title: string; otherWork: boolean; matchConfidence: number | null; clientId: string | null };
  proposal: PendingProposal;
  actionItems: ActionInput[];
  client: ClientSnapshot | null;
  milestones: MilestoneSnapshot[];
  openTasks: OpenTask[];
  transcript: string;
  /** Saaqib's name as it appears in the owner column, first name is enough. */
  ownerName: string;
};

export type SourceList = "tasks" | "actions" | "dateChanges" | "phaseDates" | "health" | "nextStep" | "risks" | "doneItems";
export type Source = { list: SourceList; index: number };
export type ClientField = "health" | "next_step" | "phase_start_date" | "phase_target_date";

export type Change = { label: string; evidence: Evidence | null; source: Source } & (
  | { kind: "client_field"; field: ClientField; from: string | null; to: string; reason: string | null }
  | { kind: "milestone_date"; milestoneId: string; title: string; from: string; to: string }
  | { kind: "milestone_done"; milestoneId: string; title: string; from: string }
  | { kind: "risk"; text: string; status: "new" | "resolved" }
  | { kind: "task_done"; taskId: string; title: string }
  | { kind: "task_create"; title: string; dueDate: string | null; waitingOn: string | null; priority: TaskPriority; owner: string | null }
  | { kind: "task_update"; taskId: string; title: string; dueDate: string | null; matched: string }
);

/** A change plus the verdict: clear evidence or not, and whether Orbit may apply it by itself. */
export type PlannedChange = Change & { clear: boolean; gap: string; auto: boolean };

const CLIENT_KEY: Record<ClientField, "health" | "nextStep" | "phaseStartDate" | "phaseTargetDate"> = {
  health: "health",
  next_step: "nextStep",
  phase_start_date: "phaseStartDate",
  phase_target_date: "phaseTargetDate",
};

function ownedByMe(owner: string | null, ownerName: string): boolean {
  if (!owner) return false;
  const words = contentTokens(owner);
  const first = ownerName.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first && (words.has(first) || owner.toLowerCase().includes(first))) return true;
  return /^(me|myself|you)$/i.test(owner.trim());
}

function ownedByTeam(owner: string | null): boolean {
  if (!owner) return true;
  return /^fero(\s+(team|ai))?$/i.test(owner.trim());
}

/** Turns the proposal into concrete changes against the client's current state. Pure, so it is tested directly. */
export function planChanges(input: PlanInput): PlannedChange[] {
  const { proposal, client, meeting, transcript } = input;
  const out: PlannedChange[] = [];
  const clientConfirmed = Boolean(client) && !meeting.otherWork && (meeting.matchConfidence ?? 0) >= AUTO_CONFIDENCE;
  const clientGap = !client ? "no client on this meeting" : meeting.otherWork ? "Other Work never changes a client" : `client match below ${Math.round(AUTO_CONFIDENCE * 100)}%`;

  const verdict = (ev: Evidence | null | undefined, needsClient: boolean) => {
    const clear = evidenceIsClear(ev, transcript);
    const gap = needsClient && !clientConfirmed ? clientGap : clear ? "" : evidenceGap(ev, transcript);
    return { clear, gap, auto: clear && (!needsClient || clientConfirmed) };
  };

  // Tasks: Saaqib's own follow ups, then the action table. Others' actions become waiting on items.
  type Candidate = { title: string; dueDate: string | null; waitingOn: string | null; priority: TaskPriority; owner: string | null; evidence: Evidence | null; source: Source };
  const candidates: Candidate[] = [];
  proposal.tasks.forEach((t, index) => {
    const title = t.title.trim();
    if (!title) return;
    candidates.push({ title, dueDate: t.dueDate, waitingOn: t.waitingOn?.trim() || null, priority: t.priority, owner: input.ownerName, evidence: t.evidence ?? null, source: { list: "tasks", index } });
  });
  input.actionItems.forEach((a, index) => {
    const title = a.text.trim();
    if (!title) return;
    if (candidates.some((c) => similarity(c.title, title) >= TASK_DUPLICATE)) return;
    const me = ownedByMe(a.owner, input.ownerName);
    const waitingOn = me ? null : ownedByTeam(a.owner) ? "Fero team" : a.owner!.trim();
    candidates.push({ title, dueDate: a.due, waitingOn, priority: "normal", owner: a.owner, evidence: a.evidence ?? null, source: { list: "actions", index } });
  });
  const scopeTasks = input.openTasks.filter((t) => (t.clientId ?? null) === (client?.id ?? null) && t.status !== "done" && t.status !== "cancelled");
  const taken = new Set<string>();
  for (const c of candidates) {
    const match = scopeTasks
      .filter((t) => !taken.has(t.id))
      .map((t) => ({ t, s: similarity(t.title, c.title) }))
      .filter((x) => x.s >= TASK_DUPLICATE)
      .sort((a, b) => b.s - a.s)[0];
    if (match) {
      taken.add(match.t.id);
      const dueDate = c.dueDate && c.dueDate !== match.t.dueDate ? c.dueDate : null;
      out.push({
        kind: "task_update",
        taskId: match.t.id,
        title: match.t.title,
        dueDate,
        matched: c.title,
        label: dueDate ? `Task already open, date set: ${match.t.title}, due ${formatDate(dueDate)}` : `Task already open, linked to this meeting: ${match.t.title}`,
        evidence: c.evidence,
        source: c.source,
        clear: evidenceIsClear(c.evidence, transcript),
        gap: "",
        auto: true,
      });
      continue;
    }
    out.push({
      kind: "task_create",
      title: c.title,
      dueDate: c.dueDate,
      waitingOn: c.waitingOn,
      priority: c.priority,
      owner: c.owner,
      label: c.waitingOn ? `Waiting on ${c.waitingOn}: ${c.title}` : `Task for you: ${c.title}`,
      evidence: c.evidence,
      source: c.source,
      clear: evidenceIsClear(c.evidence, transcript),
      gap: "",
      auto: true,
    });
  }

  // Everything below changes the client and needs a confirmed client. Other Work stops here.
  if (!client || meeting.otherWork) return out;

  if (proposal.health && proposal.health !== client.health) {
    const v = verdict(proposal.healthEvidence, true);
    out.push({ kind: "client_field", field: "health", from: client.health, to: proposal.health, reason: proposal.healthReason ?? null, label: `Health: ${HEALTH[client.health].label} to ${HEALTH[proposal.health].label}`, evidence: proposal.healthEvidence ?? null, source: { list: "health", index: 0 }, ...v });
  }
  const next = proposal.nextStep?.trim();
  if (next && next !== (client.nextStep ?? "").trim()) {
    const v = verdict(proposal.nextStepEvidence, true);
    out.push({ kind: "client_field", field: "next_step", from: client.nextStep ?? null, to: next, reason: null, label: `Next step: ${next}`, evidence: proposal.nextStepEvidence ?? null, source: { list: "nextStep", index: 0 }, ...v });
  }
  if (proposal.phaseDates) {
    const pd = proposal.phaseDates;
    const v = verdict(pd.evidence, true);
    if (pd.startDate && pd.startDate !== client.phaseStartDate) {
      out.push({ kind: "client_field", field: "phase_start_date", from: client.phaseStartDate, to: pd.startDate, reason: null, label: `Start date: ${client.phaseStartDate ? formatDate(client.phaseStartDate) : "none"} to ${formatDate(pd.startDate)}`, evidence: pd.evidence, source: { list: "phaseDates", index: 0 }, ...v });
    }
    if (pd.targetDate && pd.targetDate !== client.phaseTargetDate) {
      out.push({ kind: "client_field", field: "phase_target_date", from: client.phaseTargetDate, to: pd.targetDate, reason: null, label: `Target date: ${client.phaseTargetDate ? formatDate(client.phaseTargetDate) : "none"} to ${formatDate(pd.targetDate)}`, evidence: pd.evidence, source: { list: "phaseDates", index: 1 }, ...v });
    }
  }
  proposal.dateChanges.forEach((d, index) => {
    const open = input.milestones.filter((m) => (m.status === "upcoming" || m.status === "missed") && m.type === d.type);
    const byTitle = d.title ? open.find((m) => m.title.toLowerCase() === d.title!.toLowerCase()) : undefined;
    const target = byTitle ?? open.sort((a, b) => a.date.localeCompare(b.date))[0];
    if (!target) return;
    const v = verdict(d.evidence, true);
    if (d.newDate && d.newDate !== target.date) {
      out.push({ kind: "milestone_date", milestoneId: target.id, title: target.title, from: target.date, to: d.newDate, label: `${target.title} moved: ${formatDate(target.date)} to ${formatDate(d.newDate)}`, evidence: d.evidence ?? null, source: { list: "dateChanges", index }, ...v });
    }
    if (d.markDone) {
      out.push({ kind: "milestone_done", milestoneId: target.id, title: target.title, from: target.status, label: `${MILESTONE_TYPES[target.type].label}: ${target.title} done`, evidence: d.evidence ?? null, source: { list: "dateChanges", index }, ...v });
    }
  });
  (proposal.risks ?? []).forEach((r, index) => {
    const text = r.text.trim();
    if (!text) return;
    const v = verdict(r.evidence, true);
    out.push({ kind: "risk", text, status: r.status, label: r.status === "resolved" ? `Risk resolved: ${text}` : `Risk: ${text}`, evidence: r.evidence, source: { list: "risks", index }, ...v });
  });
  (proposal.doneItems ?? []).forEach((d, index) => {
    const match = scopeTasks
      .filter((t) => !taken.has(t.id))
      .map((t) => ({ t, s: similarity(t.title, d.text) }))
      .filter((x) => x.s >= DONE_MATCH)
      .sort((a, b) => b.s - a.s)[0];
    if (!match) return;
    taken.add(match.t.id);
    const v = verdict(d.evidence, true);
    out.push({ kind: "task_done", taskId: match.t.id, title: match.t.title, label: `Done: ${match.t.title}`, evidence: d.evidence, source: { list: "doneItems", index }, ...v });
  });
  return out;
}

/** What stays on the Review tab: the proposal minus every item that was applied. Items with nothing to do are dropped too. */
export function remainder(proposal: PendingProposal, planned: PlannedChange[], applied: (p: PlannedChange) => boolean): PendingProposal {
  const pending = (list: SourceList) => new Set(planned.filter((p) => p.source.list === list && !applied(p)).map((p) => p.source.index));
  const tasks = pending("tasks");
  const dates = pending("dateChanges");
  const risks = pending("risks");
  const done = pending("doneItems");
  const phase = pending("phaseDates");
  return {
    ...proposal,
    tasks: proposal.tasks.filter((_, i) => tasks.has(i)),
    dateChanges: proposal.dateChanges.filter((_, i) => dates.has(i)),
    health: pending("health").size ? proposal.health : null,
    healthReason: pending("health").size ? proposal.healthReason : null,
    nextStep: pending("nextStep").size ? proposal.nextStep : null,
    phaseDates: proposal.phaseDates && phase.size ? { ...proposal.phaseDates, startDate: phase.has(0) ? proposal.phaseDates.startDate : null, targetDate: phase.has(1) ? proposal.phaseDates.targetDate : null } : null,
    risks: (proposal.risks ?? []).filter((_, i) => risks.has(i)),
    doneItems: (proposal.doneItems ?? []).filter((_, i) => done.has(i)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Database side

export type ApplyContext = { meetingId: string; meetingTitle: string; heldAt: Date; clientId: string | null; clientName: string | null; reason: string; source?: ActivitySource };

/** Applies changes, one activity and one change_log row each. Returns the rows and short lines for a toast. */
export async function applyChanges(changes: Change[], ctx: ApplyContext): Promise<{ rows: ChangeLogRow[]; lines: string[] }> {
  const { getDb } = await import("@/lib/db");
  const { activities, documents } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const { applyClientChange } = await import("@/lib/data/clients");
  const { applyMilestoneChange } = await import("@/lib/data/milestones");
  const { createTaskFull, updateTaskFull } = await import("@/lib/data/tasks");
  const { logChange } = await import("@/lib/data/changeLog");
  const db = await getDb();
  const source: ActivitySource = ctx.source ?? "system";
  const rows: ChangeLogRow[] = [];
  const lines: string[] = [];
  const base = { meetingId: ctx.meetingId, clientId: ctx.clientId, reason: ctx.reason };
  const ev = (e: Evidence | null) => ({ evidenceQuote: e?.quote ?? null, evidenceAt: e?.at ?? null });

  for (const c of changes) {
    if (c.kind === "client_field") {
      if (!ctx.clientId) continue;
      const res = await applyClientChange(ctx.clientId, { [CLIENT_KEY[c.field]]: c.to }, source, ctx.meetingId);
      rows.push(await logChange({ ...base, entityType: "client", entityId: ctx.clientId, activityId: res.activityIds[0] ?? null, field: c.field, label: c.label, oldValue: c.from, newValue: c.to, reason: c.reason ?? ctx.reason, ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "milestone_date") {
      const res = await applyMilestoneChange(c.milestoneId, { date: c.to, reason: `Agreed in ${ctx.meetingTitle}` }, source, ctx.meetingId);
      rows.push(await logChange({ ...base, entityType: "milestone", entityId: c.milestoneId, activityId: res.activityIds[0] ?? null, field: "date", label: c.label, oldValue: c.from, newValue: c.to, ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "milestone_done") {
      const res = await applyMilestoneChange(c.milestoneId, { status: "done" }, source, ctx.meetingId);
      rows.push(await logChange({ ...base, entityType: "milestone", entityId: c.milestoneId, activityId: res.activityIds[0] ?? null, field: "status", label: c.label, oldValue: c.from, newValue: "done", ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "risk") {
      if (!ctx.clientId) continue;
      const title = `${ctx.clientName ?? "Client"}: risks and open questions`;
      let doc = await db.query.documents.findFirst({ where: and(eq(documents.clientId, ctx.clientId), eq(documents.title, title)) });
      if (!doc) {
        [doc] = await db.insert(documents).values({ clientId: ctx.clientId, type: "other", title, content: "", tags: ["risks"] }).returning();
      }
      const stamp = `${ctx.meetingTitle}, ${formatDateLong(ctx.heldAt)}`;
      const line = c.status === "resolved" ? `• Resolved: ${c.text}` : `• ${c.text}`;
      const content = `${doc.content.trim()}${doc.content.trim() ? "\n\n" : ""}${stamp}\n${line}`;
      await db.update(documents).set({ content }).where(eq(documents.id, doc.id));
      const [a] = await db.insert(activities).values({ clientId: ctx.clientId, type: "issue", title: c.label, occurredAt: ctx.heldAt, source, meetingId: ctx.meetingId }).returning({ id: activities.id });
      rows.push(await logChange({ ...base, entityType: "document", entityId: doc.id, activityId: a?.id ?? null, field: "risk", label: c.label, oldValue: doc.content, newValue: content, ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "task_done") {
      const res = await updateTaskFull(c.taskId, { status: "done" }, source, { sourceMeetingId: ctx.meetingId, evidence: c.evidence });
      rows.push(await logChange({ ...base, entityType: "task", entityId: c.taskId, activityId: res.activityId, field: "status", label: c.label, oldValue: res.before.status, newValue: "done", ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "task_create") {
      const res = await createTaskFull(
        { clientId: ctx.clientId, title: c.title, details: null, status: c.waitingOn ? "waiting" : "todo", priority: c.priority, dueDate: c.dueDate, waitingOn: c.waitingOn },
        source,
        { sourceMeetingId: ctx.meetingId, origin: "meeting", evidence: c.evidence },
      );
      rows.push(await logChange({ ...base, entityType: "task", entityId: res.task.id, activityId: res.activityId, field: "created", label: c.label, oldValue: null, newValue: c.title, ...ev(c.evidence) }));
      lines.push(c.label);
    } else if (c.kind === "task_update") {
      const res = await updateTaskFull(c.taskId, c.dueDate ? { dueDate: c.dueDate } : {}, source, { sourceMeetingId: ctx.meetingId, evidence: c.evidence, origin: "meeting" });
      rows.push(await logChange({ ...base, entityType: "task", entityId: c.taskId, activityId: null, field: c.dueDate ? "due_date" : "linked", label: c.label, oldValue: c.dueDate ? res.before.dueDate : null, newValue: c.dueDate ?? c.matched, ...ev(c.evidence) }));
      lines.push(c.label);
    }
  }
  return { rows, lines };
}

/** Loads everything planChanges needs for one meeting. */
export async function loadPlanInput(meetingId: string): Promise<(PlanInput & { heldAt: Date; clientName: string | null }) | null> {
  const { getDb } = await import("@/lib/db");
  const { meetings, milestones, tasks } = await import("@/lib/db/schema");
  const { eq, and, inArray, isNull } = await import("drizzle-orm");
  const db = await getDb();
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId), with: { client: true, transcript: true } });
  if (!meeting || !meeting.minutes?.proposal) return null;
  const client = meeting.client;
  const [ms, open] = await Promise.all([
    client ? db.query.milestones.findMany({ where: eq(milestones.clientId, client.id) }) : Promise.resolve([]),
    db.query.tasks.findMany({ where: and(inArray(tasks.status, ["todo", "in_progress", "waiting"]), client ? eq(tasks.clientId, client.id) : isNull(tasks.clientId)) }),
  ]);
  return {
    meeting: { id: meeting.id, title: meeting.title, otherWork: meeting.otherWork, matchConfidence: meeting.matchConfidence, clientId: meeting.clientId },
    proposal: meeting.minutes.proposal,
    actionItems: meeting.actionItems.map((a) => ({ text: a.text, owner: a.owner ?? null, due: a.due ?? null, evidence: a.evidence ?? null })),
    client: client ? { id: client.id, name: client.name, code: client.code, owner: client.owner, health: client.health, nextStep: client.nextStep, phaseStartDate: client.phaseStartDate, phaseTargetDate: client.phaseTargetDate, notes: client.notes } : null,
    milestones: ms.map((m) => ({ id: m.id, title: m.title, type: m.type, date: m.date, originalDate: m.originalDate, status: m.status })),
    openTasks: open.map((t) => ({ id: t.id, title: t.title, clientId: t.clientId, dueDate: t.dueDate, status: t.status, waitingOn: t.waitingOn })),
    transcript: meeting.transcript?.fullText ?? "",
    ownerName: client?.owner ?? "Saaqib",
    heldAt: meeting.heldAt,
    clientName: client?.name ?? null,
  };
}

async function storeProposal(meetingId: string, proposal: PendingProposal) {
  const { getDb } = await import("@/lib/db");
  const { meetings } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const m = await db.query.meetings.findFirst({ where: eq(meetings.id, meetingId), columns: { minutes: true } });
  if (!m?.minutes) return;
  await db.update(meetings).set({ minutes: { ...m.minutes, proposal } }).where(eq(meetings.id, meetingId));
}

/** The automatic pass, run right after processing. Applies what the evidence rule allows and parks the rest for review. */
export async function runAutoUpdates(meetingId: string): Promise<{ applied: number; held: number }> {
  const input = await loadPlanInput(meetingId);
  if (!input) return { applied: 0, held: 0 };
  const planned = planChanges(input);
  const auto = planned.filter((p) => p.auto);
  const { rows } = await applyChanges(auto, {
    meetingId,
    meetingTitle: input.meeting.title,
    heldAt: input.heldAt,
    clientId: input.meeting.otherWork ? null : input.client?.id ?? null,
    clientName: input.clientName,
    reason: "Applied by Orbit from the transcript",
  });
  const rest = remainder(input.proposal, planned, (p) => p.auto);
  await storeProposal(meetingId, { ...rest, autoApplied: { at: new Date().toISOString(), changes: rows.length } });
  return { applied: rows.length, held: planned.length - auto.length };
}

export type ReviewAccept = { tasks: boolean[]; dateChanges: boolean[]; health: boolean; nextStep: boolean; phaseDates: boolean; risks: boolean[]; doneItems: boolean[]; notes: boolean };

/** The Review tab: Saaqib ticked items, they apply through the same path and are logged as accepted. */
export async function applyReview(meetingId: string, accept: ReviewAccept): Promise<{ lines: string[] }> {
  const input = await loadPlanInput(meetingId);
  if (!input) throw new Error("Nothing proposed for this meeting");
  const planned = planChanges(input);
  const ticked = (p: PlannedChange) => {
    switch (p.source.list) {
      case "tasks":
        return accept.tasks[p.source.index] ?? false;
      case "actions":
        return false;
      case "dateChanges":
        return accept.dateChanges[p.source.index] ?? false;
      case "health":
        return accept.health;
      case "nextStep":
        return accept.nextStep;
      case "phaseDates":
        return accept.phaseDates;
      case "risks":
        return accept.risks[p.source.index] ?? false;
      case "doneItems":
        return accept.doneItems[p.source.index] ?? false;
    }
  };
  const chosen = planned.filter((p) => ticked(p) && (input.client || p.kind === "task_create" || p.kind === "task_update" || p.kind === "task_done"));
  const ctx: ApplyContext = { meetingId, meetingTitle: input.meeting.title, heldAt: input.heldAt, clientId: input.meeting.otherWork ? null : input.client?.id ?? null, clientName: input.clientName, reason: "Accepted by Saaqib on the Review tab", source: "app" };
  const { lines } = await applyChanges(chosen, ctx);

  if (accept.notes && input.proposal.notesUpdate && input.client && !input.meeting.otherWork) {
    const { applyClientChange } = await import("@/lib/data/clients");
    const { logChange } = await import("@/lib/data/changeLog");
    const res = await applyClientChange(input.client.id, { notes: input.proposal.notesUpdate }, "app", meetingId);
    await logChange({ meetingId, clientId: input.client.id, entityType: "client", entityId: input.client.id, activityId: res.activityIds[0] ?? null, field: "notes", label: "Client notes rewritten from the meeting", oldValue: res.before.notes, newValue: input.proposal.notesUpdate, reason: ctx.reason });
    lines.push("Client notes updated");
  }

  const rest = remainder(input.proposal, planned, (p) => ticked(p));
  await storeProposal(meetingId, { ...rest, notesUpdate: accept.notes ? "" : rest.notesUpdate, reviewedAt: new Date().toISOString() });
  return { lines };
}
