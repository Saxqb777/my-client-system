import type { Health, ReportCell, ReportRow } from "@/lib/db/schema";
import { HEALTH } from "@/lib/core/constants";
import { delayText, formatDate } from "@/lib/core/dates";
import { cleanStyle } from "@/lib/core/style";

/**
 * The Friday pack. Seven fixed columns, one row per active client, short action oriented cells.
 * buildRows is the rule based writer and the fallback when Claude is not available; Claude only rewrites the
 * three prose cells (done, risk, next) from the same material. mergeRows keeps Saaqib's hand edits.
 */

export const FRIDAY_COLUMNS: { key: keyof Omit<ReportRow, "clientId" | "edited">; label: string }[] = [
  { key: "client", label: "Client" },
  { key: "owner", label: "Owner" },
  { key: "done", label: "Done this week" },
  { key: "risk", label: "Risk / Delay" },
  { key: "next", label: "Next week action" },
  { key: "startDate", label: "Start date" },
  { key: "targetDate", label: "Target date" },
];

export const EDITABLE_CELLS: ReportCell[] = ["owner", "done", "risk", "next", "startDate", "targetDate"];

export type ClientWeek = {
  client: { id: string; name: string; code: string; owner: string; health: Health; nextStep: string | null; phase: string; phaseStartDate: string | null; phaseTargetDate: string | null; phaseTargetOriginal: string | null; notes: string | null };
  /** Meetings held in the week with their summary line, Other Work excluded by the caller. */
  meetings: { title: string; heldAt: string; summary: string | null; decisions: string[] }[];
  /** Timeline lines in the week: what was delivered, decided, raised. */
  activities: { type: string; title: string; occurredAt: string }[];
  doneTasks: { title: string; completedAt: string }[];
  /** Open tasks due inside the coming week, soonest first. */
  dueNextWeek: { title: string; dueDate: string | null; waitingOn: string | null }[];
  /** Dates in the next 14 days, overdue ones, and any moved inside this week. */
  milestones: { title: string; type: string; date: string; originalDate: string; status: string; movedThisWeek: { from: string; to: string; reason?: string } | null }[];
  /** New risks logged this week from meetings. */
  risks: string[];
};

export type WeekContext = { weekStart: string; weekEnd: string; today: string; clients: ClientWeek[] };

const MAX_CELL = 260;

/** Joins fragments into one short cell, no fluff, no trailing filler. */
export function cell(fragments: (string | null | undefined)[], max = MAX_CELL): string {
  const parts = fragments.map((f) => (f ?? "").trim().replace(/\.+$/, "")).filter(Boolean);
  const seen = new Set<string>();
  const unique = parts.filter((p) => {
    const k = p.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  let text = unique.join(". ");
  if (text.length > max) text = text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return cleanStyle(text);
}

function healthReason(notes: string | null): string | null {
  const m = notes?.match(/^Why (?:at risk|blocked|on track):\s*(.+)$/im);
  return m ? m[1].trim() : null;
}

/** Rule based cells for one client. Used as the fallback and as the material Claude rewrites. */
export function doneText(c: ClientWeek): string {
  const frags: string[] = [];
  for (const m of c.meetings) frags.push(m.summary?.trim() || `${m.title} held`);
  for (const a of c.activities) {
    if (a.type === "delivery" || a.type === "decision") frags.push(a.title.replace(/^Done:\s*/i, ""));
  }
  for (const t of c.doneTasks) frags.push(t.title);
  for (const m of c.milestones) if (m.status === "done") frags.push(`${m.title} completed`);
  return cell(frags.length ? frags : ["No client facing progress logged this week"]);
}

/** Risk and delay fragments: health with its reason, dates moved this week, risks raised, dates overdue. */
export function riskFragments(c: ClientWeek, today: string): string[] {
  const frags: string[] = [];
  if (c.client.health !== "on_track") {
    const reason = healthReason(c.client.notes);
    frags.push(`${HEALTH[c.client.health].label}${reason ? `: ${reason}` : ""}`);
  }
  for (const m of c.milestones) {
    if (m.movedThisWeek) {
      const slip = delayText(m.originalDate, m.movedThisWeek.to);
      frags.push(`${m.title} moved to ${formatDate(m.movedThisWeek.to)}${slip ? `, ${slip} behind plan` : ""}${m.movedThisWeek.reason ? `: ${m.movedThisWeek.reason}` : ""}`);
    }
  }
  for (const r of c.risks) frags.push(r);
  for (const m of c.milestones) {
    if ((m.status === "upcoming" || m.status === "missed") && m.date < today && !m.movedThisWeek) frags.push(`${m.title} overdue since ${formatDate(m.date)}`);
  }
  return frags;
}

export function riskText(c: ClientWeek, today: string): string {
  const frags = riskFragments(c, today);
  return cell(frags.length ? frags : ["None"]);
}

export function nextText(c: ClientWeek): string {
  const frags: string[] = [];
  if (c.client.nextStep) frags.push(c.client.nextStep);
  for (const t of c.dueNextWeek.slice(0, 2)) frags.push(t.waitingOn ? `Chase ${t.waitingOn}: ${t.title}` : t.title);
  for (const m of c.milestones.filter((x) => x.status === "upcoming").slice(0, 2)) frags.push(`${m.title} on ${formatDate(m.date)}`);
  return cell(frags.length ? frags : ["Confirm next step with the client"]);
}

export function buildRows(ctx: WeekContext): ReportRow[] {
  return ctx.clients.map((c) => ({
    clientId: c.client.id,
    client: c.client.name,
    owner: c.client.owner || "Saaqib",
    done: doneText(c),
    risk: riskText(c, ctx.today),
    next: nextText(c),
    startDate: c.client.phaseStartDate ? formatDate(c.client.phaseStartDate) : "",
    targetDate: c.client.phaseTargetDate ? formatDate(c.client.phaseTargetDate) : "",
  }));
}

/**
 * A regeneration keeps every cell Saaqib typed into, unless reset is on. Clients that left the active list drop out,
 * new ones come in fresh.
 */
export function mergeRows(previous: ReportRow[], fresh: ReportRow[], reset = false): ReportRow[] {
  if (reset) return fresh.map((r) => ({ ...r, edited: [] }));
  const byClient = new Map(previous.map((r) => [r.clientId, r]));
  return fresh.map((r) => {
    const old = byClient.get(r.clientId);
    if (!old?.edited?.length) return { ...r, edited: [] };
    const merged: ReportRow = { ...r, edited: [...old.edited] };
    for (const key of old.edited) merged[key] = old[key];
    return merged;
  });
}

/** Tab separated, header first: pastes straight into Teams, Outlook or Excel. */
export function renderTable(rows: ReportRow[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  const lines = [FRIDAY_COLUMNS.map((c) => c.label).join("\t")];
  for (const r of rows) lines.push(FRIDAY_COLUMNS.map((c) => clean(String(r[c.key] ?? ""))).join("\t"));
  return lines.join("\n");
}

/** "26 Sep to 2 Oct 2026" */
export function weekLabel(weekStart: string, weekEnd: string): string {
  const sameYear = weekStart.slice(0, 4) === weekEnd.slice(0, 4);
  return `${formatDate(weekStart, !sameYear)} to ${formatDate(weekEnd)}`;
}
