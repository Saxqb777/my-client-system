import type {
  ActivityType,
  DateChange,
  Health,
  MilestoneType,
  TaskPriority,
  TaskStatus,
} from "@/lib/db/schema";
import { PHASES } from "@/lib/core/constants";
import { addDaysISO, formatDate } from "@/lib/core/dates";
import type { ProjectExport } from "./schema";

/**
 * Turns a project export into plain row objects for Orbit's tables.
 * Pure function: no database access, so it can feed SQL generation, the API, or tests.
 */

export type MappedProject = {
  client: {
    name: string;
    code: string;
    fullName: string | null;
    system: string | null;
    aliases: string[];
    owner: string;
    phase: string;
    health: Health;
    nextStep: string | null;
    phaseStartDate: string | null;
    phaseTargetDate: string | null;
    phaseTargetOriginal: string | null;
    notes: string | null;
  };
  people: { name: string; role: string | null; side: "client" | "vendor" | "internal"; email: string | null; phone: string | null; isPrimary: boolean; notes: string | null }[];
  milestones: { title: string; type: MilestoneType; date: string; originalDate: string; dateHistory: DateChange[]; status: "upcoming" | "done" | "missed" | "cancelled"; completedAt: Date | null; notes: string | null }[];
  activities: { type: ActivityType; title: string; body: string | null; occurredAt: Date; tags: string[] }[];
  tasks: { title: string; details: string | null; status: TaskStatus; priority: TaskPriority; dueDate: string | null; waitingOn: string | null; waitingSince: string | null; completedAt: Date | null }[];
  meetings: { title: string; heldAt: Date; attendees: string[]; mom: string; actionItems: { text: string; owner?: string; due?: string; done?: boolean }[] }[];
  documents: { title: string; type: "brd" | "mom" | "test_cases" | "guide" | "email" | "other"; content: string; tags: string[] }[];
  notes: string[];
};

const ACTIVITY_TYPES = new Set<ActivityType>(["update", "meeting", "email", "whatsapp", "call", "decision", "issue", "delivery"]);
const MILESTONE_TYPES = new Set<MilestoneType>(["target", "sit", "uat", "go_live", "system", "other"]);
const DOC_TYPES = new Set(["brd", "mom", "test_cases", "guide", "email", "other"]);
const PRIORITIES = new Set<TaskPriority>(["low", "normal", "high", "urgent"]);

function dubaiNoon(date: string): Date {
  // Store day level facts at 08:00 UTC, which is midday in Abu Dhabi.
  return new Date(`${date}T08:00:00.000Z`);
}

function cleanCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

function mapPhase(phase: string | null | undefined): string {
  const p = (phase ?? "").toLowerCase().trim();
  return PHASES.some((x) => x.value === p) ? p : "discovery";
}

function mapTaskStatus(status: string | null | undefined, waitingOn: string | null | undefined): TaskStatus {
  const s = (status ?? "todo").toLowerCase();
  if (s === "done" || s === "completed") return "done";
  if (s === "in_progress" || s === "in progress") return "in_progress";
  if (s === "waiting" || (s === "todo" && waitingOn)) return "waiting";
  if (s === "cancelled") return "cancelled";
  return "todo";
}

export function mapProject(input: ProjectExport, today: string, codeOverride?: string): MappedProject {
  const notes: string[] = [];
  const c = input.client;
  const code = cleanCode(codeOverride ?? c.code);
  const noteParts = [c.notes?.trim(), c.health_reason ? `Why ${c.health === "blocked" ? "blocked" : c.health === "at_risk" ? "at risk" : "on track"}: ${c.health_reason.trim()}` : null].filter(Boolean) as string[];

  const client: MappedProject["client"] = {
    name: c.name.trim(),
    code,
    fullName: c.organisation?.trim() || null,
    system: c.system?.trim() || null,
    aliases: Array.from(new Set([...(c.aliases ?? []), c.name].map((a) => a.trim()).filter((a) => a && a.toUpperCase() !== code))),
    owner: c.owner?.trim() || "Saaqib",
    phase: mapPhase(c.phase),
    health: c.health ?? "on_track",
    nextStep: c.next_step?.trim() || null,
    phaseStartDate: c.phase_start_date ?? null,
    phaseTargetDate: c.phase_target_date ?? null,
    phaseTargetOriginal: c.phase_target_original_date ?? c.phase_target_date ?? null,
    notes: noteParts.length ? noteParts.join("\n\n") : null,
  };

  const people: MappedProject["people"] = [];
  for (const p of input.people) {
    const name = p.name?.trim() || (p.role ? `${p.role.trim()} (name pending)` : null);
    if (!name) continue;
    people.push({
      name,
      role: p.role?.trim() || null,
      side: p.side ?? "client",
      email: p.email?.trim() || null,
      phone: p.phone?.trim() || null,
      isPrimary: Boolean(p.is_primary),
      notes: p.notes?.trim() || null,
    });
  }

  const milestones: MappedProject["milestones"] = [];
  const activities: MappedProject["activities"] = [];
  const tasks: MappedProject["tasks"] = [];

  for (const m of input.milestones) {
    const type = MILESTONE_TYPES.has(m.type as MilestoneType) ? (m.type as MilestoneType) : "other";
    const status = (["upcoming", "done", "missed", "cancelled"].includes(m.status ?? "") ? m.status : "upcoming") as MappedProject["milestones"][number]["status"];
    const date = m.date ?? m.original_date ?? null;
    if (!date) {
      // No date at all: a finished item becomes a timeline entry, an open one becomes a task.
      if (status === "done") {
        activities.push({ type: "delivery", title: m.title.trim(), body: m.reason_for_change?.trim() || "Exact date not captured", occurredAt: dubaiNoon(today), tags: ["date approx"] });
        notes.push(`Milestone "${m.title}" had no date and was logged as a delivery activity dated today.`);
      } else {
        tasks.push({ title: `${m.title.trim()}: set a date`, details: m.reason_for_change?.trim() || null, status: "todo", priority: "high", dueDate: null, waitingOn: null, waitingSince: null, completedAt: null });
        notes.push(`Milestone "${m.title}" had no date and was added as a task to set one.`);
      }
      continue;
    }
    const original = m.original_date ?? date;
    const history: DateChange[] = original !== date ? [{ from: original, to: date, at: dubaiNoon(today).toISOString(), reason: m.reason_for_change?.trim() || undefined }] : [];
    milestones.push({
      title: m.title.trim(),
      type,
      date,
      originalDate: original,
      dateHistory: history,
      status,
      completedAt: status === "done" ? dubaiNoon(date) : null,
      notes: history.length === 0 && m.reason_for_change ? m.reason_for_change.trim() : null,
    });
  }

  let lastDate: string | null = null;
  for (const a of input.activities) {
    const rawType = (a.type ?? "update").toLowerCase();
    const type: ActivityType = ACTIVITY_TYPES.has(rawType as ActivityType) ? (rawType as ActivityType) : rawType === "system" ? "delivery" : "update";
    let date = a.date ?? null;
    const tags: string[] = [];
    if (!date) {
      date = lastDate ? addDaysISO(lastDate, 1) : addDaysISO(today, -30);
      tags.push("date approx");
    }
    lastDate = date;
    activities.push({ type, title: a.title.trim(), body: a.detail?.trim() || null, occurredAt: dubaiNoon(date), tags });
  }

  for (const t of input.tasks) {
    const status = mapTaskStatus(t.status, t.waiting_on);
    const priority = PRIORITIES.has(t.priority as TaskPriority) ? (t.priority as TaskPriority) : "normal";
    tasks.push({
      title: t.title.trim(),
      details: null,
      status,
      priority,
      dueDate: t.due_date ?? null,
      waitingOn: t.waiting_on?.trim() || null,
      waitingSince: status === "waiting" ? (t.waiting_since ?? null) : null,
      completedAt: status === "done" ? dubaiNoon(today) : null,
    });
  }

  const meetings: MappedProject["meetings"] = [];
  for (const m of input.meetings) {
    const date = m.date ?? today;
    const lines: string[] = [];
    if (m.summary) lines.push(m.summary.trim(), "");
    if (m.decisions.length) {
      lines.push("Decisions");
      for (const d of m.decisions) lines.push(`• ${d}`);
      lines.push("");
    }
    if (m.action_items.length) {
      lines.push("Actions");
      m.action_items.forEach((ai, i) => lines.push(`${i + 1}. ${ai.text}${ai.owner ? ` (${ai.owner})` : ""}${ai.due ? `, due ${formatDate(ai.due)}` : ""}${ai.done ? ", done" : ""}`));
    }
    meetings.push({
      title: m.title.trim(),
      heldAt: dubaiNoon(date),
      attendees: m.attendees,
      mom: lines.join("\n").trim(),
      actionItems: m.action_items.map((ai) => ({ text: ai.text, owner: ai.owner ?? undefined, due: ai.due ?? undefined, done: ai.done ?? undefined })),
    });
  }

  const documents: MappedProject["documents"] = [];
  for (const d of input.documents) {
    const type = (DOC_TYPES.has(d.type ?? "") ? d.type : "other") as MappedProject["documents"][number]["type"];
    const content = [d.status ? `Status: ${d.status}` : null, d.date ? `Date: ${formatDate(d.date)}` : null, d.where ? `Where: ${d.where}` : null].filter(Boolean).join("\n");
    documents.push({ title: d.title.trim(), type, content, tags: d.status ? [d.status] : [] });
  }

  if (input.risks.length || input.open_questions.length) {
    const lines: string[] = [];
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
    documents.push({ title: `${client.name}: risks and open questions`, type: "other", content: lines.join("\n"), tags: ["risks", "imported"] });
  }

  if (input.this_week) {
    const w = input.this_week;
    const lines: string[] = [];
    lines.push("Done this week", "", ...w.done.map((x) => `• ${x}`), "");
    lines.push("Planned next week", "", ...w.planned_next_week.map((x) => `• ${x}`), "");
    lines.push("Blockers and delays", "", ...w.blockers_or_delays.map((x) => `• ${x}`));
    documents.push({ title: `${client.name}: week summary as of ${formatDate(today)}`, type: "other", content: lines.join("\n"), tags: ["weekly", "imported"] });
  }

  return { client, people, milestones, activities, tasks, meetings, documents, notes };
}
