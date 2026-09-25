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
import { extractDates } from "@/lib/core/text";
import type { ProjectExport } from "./schema";

/**
 * Turns a project export into plain row objects for Orbit's tables.
 * Pure function: no database access, so it can feed SQL generation, the API, or tests.
 *
 * Rules that keep the imported data honest:
 * 1. An undated activity that matches a "done this week" line is dated inside this week. Otherwise it is dated today. Both carry the tag "date approx".
 * 2. A finished milestone with no date takes a date written in its own note, else rule 1, and is logged as a delivery activity.
 * 3. An open milestone with no date becomes a task only when no similar task already exists.
 * 4. A past dated "upcoming" milestone that repeats an activity on the same day is dropped. Real overdue items stay.
 * 5. A task waiting on the owner is a plain to do.
 * 6. Activities on the same day keep their export order.
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

export const APPROX_TAG = "date approx";

const ACTIVITY_TYPES = new Set<ActivityType>(["update", "meeting", "email", "whatsapp", "call", "decision", "issue", "delivery"]);
const MILESTONE_TYPES = new Set<MilestoneType>(["target", "sit", "uat", "go_live", "system", "other"]);
const DOC_TYPES = new Set(["brd", "mom", "test_cases", "guide", "email", "other"]);
const PRIORITIES = new Set<TaskPriority>(["low", "normal", "high", "urgent"]);

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "from", "that", "this", "then", "than", "into", "onto", "over", "under", "about", "after", "before",
  "are", "was", "were", "has", "have", "had", "not", "but", "per", "via", "its", "our", "their", "his", "her", "them", "they", "you",
  "will", "would", "should", "could", "can", "any", "all", "also", "who", "whom", "which", "what", "when", "where", "how", "out",
]);

/** Lower case content words with a light stem, so "checked" and "check" or "orders" and "order" line up. */
export function contentTokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    let w = raw;
    if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith("ied")) w = `${w.slice(0, -3)}y`;
    else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

/** Share of the smaller token set that also appears in the other. 0 when fewer than two words are shared. */
export function similarity(a: string, b: string): number {
  const ta = contentTokens(a);
  const tb = contentTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  if (shared < 2) return 0;
  return shared / Math.min(ta.size, tb.size);
}

function dubaiNoon(date: string, minuteOffset = 0): Date {
  // Store day level facts at 08:00 UTC, which is midday in Abu Dhabi. The offset keeps export order inside a day.
  return new Date(Date.parse(`${date}T08:00:00.000Z`) + minuteOffset * 60_000);
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

/** Latest date mentioned in a note that is not in the future. */
function dateFromText(text: string | null | undefined, today: string): string | null {
  if (!text) return null;
  const found = extractDates(text, today).filter((f) => f.iso <= today);
  return found.length ? found[found.length - 1].iso : null;
}

type ActivityDraft = { type: ActivityType; title: string; body: string | null; date: string | null; thisWeek: boolean; tags: string[] };

export function mapProject(input: ProjectExport, today: string, codeOverride?: string): MappedProject {
  const notes: string[] = [];
  const c = input.client;
  const code = cleanCode(codeOverride ?? c.code);
  const owner = c.owner?.trim() || "Saaqib";
  const ownerFirst = owner.split(/\s+/)[0].toLowerCase();
  const doneThisWeek = input.this_week?.done ?? [];
  const matchesThisWeek = (title: string) => doneThisWeek.some((line) => similarity(title, line) >= 0.4);

  const noteParts = [c.notes?.trim(), c.health_reason ? `Why ${c.health === "blocked" ? "blocked" : c.health === "at_risk" ? "at risk" : "on track"}: ${c.health_reason.trim()}` : null].filter(Boolean) as string[];

  const client: MappedProject["client"] = {
    name: c.name.trim(),
    code,
    fullName: c.organisation?.trim() || null,
    system: c.system?.trim() || null,
    aliases: Array.from(new Set([...(c.aliases ?? []), c.name].map((a) => a.trim()).filter((a) => a && a.toUpperCase() !== code))),
    owner,
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

  // Tasks first, so dateless milestones can check for an existing similar task.
  const tasks: MappedProject["tasks"] = [];
  for (const t of input.tasks) {
    let status = mapTaskStatus(t.status, t.waiting_on);
    let waitingOn = t.waiting_on?.trim() || null;
    if (waitingOn && contentTokens(waitingOn).has(ownerFirst)) {
      // Rule 5: nobody waits on themselves.
      waitingOn = null;
      if (status === "waiting") status = "todo";
      notes.push(`Task "${t.title}" was waiting on ${owner} and is now a plain to do.`);
    }
    const priority = PRIORITIES.has(t.priority as TaskPriority) ? (t.priority as TaskPriority) : "normal";
    tasks.push({
      title: t.title.trim(),
      details: null,
      status,
      priority,
      dueDate: t.due_date ?? null,
      waitingOn,
      waitingSince: status === "waiting" ? (t.waiting_since ?? null) : null,
      completedAt: status === "done" ? dubaiNoon(today) : null,
    });
  }

  const drafts: ActivityDraft[] = [];
  const milestones: MappedProject["milestones"] = [];
  const datedActivityTitles = input.activities.filter((a) => a.date).map((a) => ({ date: a.date as string, title: a.title }));

  for (const m of input.milestones) {
    const title = m.title.trim();
    const type = MILESTONE_TYPES.has(m.type as MilestoneType) ? (m.type as MilestoneType) : "other";
    const status = (["upcoming", "done", "missed", "cancelled"].includes(m.status ?? "") ? m.status : "upcoming") as MappedProject["milestones"][number]["status"];
    const date = m.date ?? m.original_date ?? null;
    const reason = m.reason_for_change?.trim() || null;

    if (!date) {
      if (status === "done") {
        // Rule 2: a finished item with no date becomes a timeline entry.
        const fromNote = dateFromText(reason, today);
        drafts.push({ type: "delivery", title, body: reason ?? "Exact date not captured", date: fromNote, thisWeek: !fromNote && matchesThisWeek(title), tags: [APPROX_TAG] });
        notes.push(`Milestone "${title}" had no date and was logged as a delivery activity${fromNote ? ` dated ${formatDate(fromNote)} from its note` : ""}.`);
      } else {
        // Rule 3: an open item with no date becomes a task unless one already covers it.
        const covered = tasks.find((t) => {
          const mt = contentTokens(title);
          const tt = contentTokens(t.title);
          let shared = 0;
          for (const w of mt) if (tt.has(w)) shared++;
          return mt.size > 0 && shared / mt.size >= 0.6;
        });
        if (covered) {
          notes.push(`Milestone "${title}" had no date and is already covered by the task "${covered.title}".`);
        } else {
          tasks.push({ title: `${title}: set a date`, details: reason, status: "todo", priority: "high", dueDate: null, waitingOn: null, waitingSince: null, completedAt: null });
          notes.push(`Milestone "${title}" had no date and was added as a task to set one.`);
        }
      }
      continue;
    }

    if (status === "upcoming" && date < today && type === "other") {
      // Rule 4: a past proposal that is already on the timeline is not an overdue date.
      const twin = datedActivityTitles.find((a) => a.date === date && similarity(title, a.title) >= 0.5);
      if (twin) {
        notes.push(`Milestone "${title}" on ${formatDate(date)} repeats the activity "${twin.title}" and was dropped.`);
        continue;
      }
    }

    const original = m.original_date ?? date;
    const history: DateChange[] = original !== date ? [{ from: original, to: date, at: dubaiNoon(today).toISOString(), reason: reason ?? undefined }] : [];
    milestones.push({
      title,
      type,
      date,
      originalDate: original,
      dateHistory: history,
      status,
      completedAt: status === "done" ? dubaiNoon(date) : null,
      notes: history.length === 0 && reason ? reason : null,
    });
  }

  for (const a of input.activities) {
    const rawType = (a.type ?? "update").toLowerCase();
    const type: ActivityType = ACTIVITY_TYPES.has(rawType as ActivityType) ? (rawType as ActivityType) : rawType === "system" ? "delivery" : "update";
    const title = a.title.trim();
    const date = a.date ?? null;
    drafts.push({ type, title, body: a.detail?.trim() || null, date, thisWeek: !date && matchesThisWeek(title), tags: date ? [] : [APPROX_TAG] });
  }

  // Rule 1: undated items that happened this week are spread over the last few days in export order. Anything else lands on today.
  const weekItems = drafts.filter((d) => !d.date && d.thisWeek);
  weekItems.forEach((d, i) => {
    d.date = addDaysISO(today, -Math.min(6, weekItems.length - i));
  });
  for (const d of drafts) {
    if (!d.date) d.date = today;
  }
  if (weekItems.length) notes.push(`${weekItems.length} undated item(s) matched "done this week" and were dated inside this week.`);
  const undatedRest = drafts.filter((d) => d.tags.includes(APPROX_TAG) && !d.thisWeek && d.date === today).length;
  if (undatedRest) notes.push(`${undatedRest} undated item(s) had no clue to a date and were dated today.`);

  // Rule 6: minute offsets keep export order inside a day.
  const activities: MappedProject["activities"] = drafts.map((d, i) => ({
    type: d.type,
    title: d.title,
    body: d.body,
    occurredAt: dubaiNoon(d.date as string, i),
    tags: d.tags,
  }));

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
