import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { healthEnum, milestoneTypeEnum, taskPriorityEnum, type Client, type Meeting, type Milestone, type Person, type Task } from "@/lib/db/schema";
import { phaseLabel } from "@/lib/core/constants";
import { formatDate, formatDateTime, todayISO } from "@/lib/core/dates";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

/** The shape Claude returns after reading a transcript. Everything is reviewed by Saaqib before it is saved. */
export const minutesPlanSchema = z.object({
  title: z.string().describe("Meeting title in the client's naming style, for example IDS x Fero UAT session 3"),
  attendees: z.array(z.string()).describe("People present, as named in the transcript, one string each"),
  summary: z.string().describe("Two plain sentences on what the meeting was about and what came out of it"),
  mom: z.string().describe("The full minutes of meeting as plain text, following the MOM format given for this client exactly. Ready to paste into an email or document."),
  decisions: z.array(z.string()).describe("Decisions taken, one clean sentence each. Empty if none."),
  actionItems: z.array(
    z.object({
      text: z.string(),
      owner: z.string().nullable().describe("Person or organisation responsible"),
      due: z.string().nullable().describe("yyyy-MM-dd if a date was agreed, else null"),
    }),
  ),
  tasks: z.array(
    z.object({
      title: z.string().describe("A follow up Saaqib himself must do or chase, written as an instruction"),
      dueDate: z.string().nullable(),
      waitingOn: z.string().nullable().describe("Set when Saaqib is waiting on someone else to act"),
      priority: z.enum(taskPriorityEnum.enumValues),
    }),
  ),
  dateChanges: z.array(
    z.object({
      type: z.enum(milestoneTypeEnum.enumValues),
      title: z.string().nullable(),
      newDate: z.string().nullable().describe("yyyy-MM-dd"),
      markDone: z.boolean(),
    }),
  ),
  health: z.enum(healthEnum.enumValues).nullable().describe("Only when the meeting clearly changes the project health"),
  healthReason: z.string().nullable(),
  nextStep: z.string().nullable().describe("The single most important next step for this client after the meeting, or null"),
  notesUpdate: z.string().describe("The client notes rewritten: keep every existing fact that is still true, fold in what this meeting taught, drop nothing important. Plain paragraphs, under 350 words."),
  openQuestions: z.array(z.string()),
});

export type MinutesPlan = z.infer<typeof minutesPlanSchema>;

export const DEFAULT_MOM_FORMAT = [
  "Heading: <Client> x Fero, <meeting title>, <date>",
  "Attendees: full names with organisation, one line",
  "Purpose: one sentence",
  "Discussion: numbered points grouped by topic. Passive voice. Do not name Fero staff in the prose, write 'it was confirmed' or 'the team explained'. Client people may be named.",
  "Decisions: numbered list",
  "Actions: a table with three columns: #, Action, Owner. No due column unless a date was agreed in the meeting, then add it inside the action text.",
  "Next steps: two or three lines",
  "Next meeting: date and time if agreed",
].join("\n");

export type MinutesContext = {
  meeting: Meeting;
  client: Client & { people: Person[]; milestones: Milestone[]; tasks: Task[] };
  transcript: string;
};

function systemPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  return [
    "You write minutes of meeting for Saaqib, a product analyst at Fero in Abu Dhabi who runs enterprise client projects. He will send these minutes to the client, so accuracy and tone matter more than length.",
    "Read the transcript and produce the minutes in the exact format below. Never invent facts, names or dates. If something is unclear, leave it out of the minutes and put it in openQuestions.",
    "",
    "MOM format for this client:",
    c.momFormat?.trim() || DEFAULT_MOM_FORMAT,
    "",
    `Writing style for everything you output: ${WRITING_STYLE_RULES}`,
    "",
    "Also extract, from the transcript only: decisions, action items with owners, Saaqib's own follow ups as tasks (things Fero or Saaqib must do, send, prepare or chase; when someone else must act first, set waitingOn), any moved or agreed project dates as dateChanges matching the client's existing milestones, a health change only if the meeting clearly changed it, and the client's next step.",
    "notesUpdate: rewrite the client notes below so they stay a short, current briefing. Keep facts that still hold, add what this meeting established, remove what it made obsolete.",
    "Dates: resolve relative dates using the meeting date and yyyy-MM-dd format.",
  ].join("\n");
}

function userPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  const people = c.people.map((p) => `${p.name}${p.role ? `, ${p.role}` : ""} (${p.side})`).join("\n") || "none recorded";
  const dates = c.milestones.filter((m) => m.status === "upcoming").map((m) => `${m.type}: ${m.title}, ${formatDate(m.date)}`).join("\n") || "none";
  const openTasks = c.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 30).map((t) => `${t.title}${t.waitingOn ? ` (waiting on ${t.waitingOn})` : ""}`).join("\n") || "none";
  return [
    `Today is ${todayISO()} (Asia/Dubai).`,
    `Client: ${c.name} (${c.code})${c.fullName ? `, ${c.fullName}` : ""}. System: ${c.system ?? "not set"}. Phase: ${phaseLabel(c.phase)}. Health: ${c.health}.`,
    `Meeting: ${ctx.meeting.title}, ${formatDateTime(ctx.meeting.heldAt)}${ctx.meeting.location ? `, ${ctx.meeting.location}` : ""}.`,
    ctx.meeting.attendees.length ? `Invited: ${ctx.meeting.attendees.join(", ")}` : "",
    "",
    "People on this account:",
    people,
    "",
    "Upcoming dates:",
    dates,
    "",
    "Open tasks:",
    openTasks,
    "",
    "Current client notes:",
    c.notes?.trim() || "none yet",
    "",
    "Transcript:",
    ctx.transcript.trim(),
  ].join("\n");
}

export async function claudeMinutes(ctx: MinutesContext): Promise<MinutesPlan | null> {
  const client = anthropic();
  const res = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 12000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(minutesPlanSchema) },
    system: [{ type: "text", text: systemPrompt(ctx), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  if (res.stop_reason === "refusal") return null;
  return res.parsed_output ?? null;
}

/** Without a key: a skeleton in the format, with the transcript as the discussion. Saaqib edits it. */
export function rulesMinutes(ctx: MinutesContext): MinutesPlan {
  const c = ctx.client;
  const when = formatDate(ctx.meeting.heldAt.toISOString().slice(0, 10));
  const attendees = ctx.meeting.attendees;
  const mom = [
    `${c.name} x Fero, ${ctx.meeting.title}, ${when}`,
    "",
    `Attendees: ${attendees.join(", ") || "to be filled"}`,
    "",
    "Purpose: to be filled",
    "",
    "Discussion:",
    ctx.transcript.trim().slice(0, 4000),
    "",
    "Decisions:",
    "1.",
    "",
    "Actions:",
    "#  Action  Owner",
    "1.",
  ].join("\n");
  return {
    title: ctx.meeting.title,
    attendees,
    summary: "Minutes drafted from the transcript without Claude. Review before sending.",
    mom,
    decisions: [],
    actionItems: [],
    tasks: [],
    dateChanges: [],
    health: null,
    healthReason: null,
    nextStep: null,
    notesUpdate: c.notes ?? "",
    openQuestions: [],
  };
}

export function normalizeMinutes(plan: MinutesPlan): MinutesPlan {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  return {
    ...plan,
    title: cleanStyle(plan.title).trim(),
    summary: cleanStyle(plan.summary).trim(),
    mom: cleanStyle(plan.mom).trim(),
    decisions: plan.decisions.map((d) => cleanStyle(d).trim()).filter(Boolean),
    actionItems: plan.actionItems.map((a) => ({ text: cleanStyle(a.text).trim(), owner: a.owner?.trim() || null, due: a.due && iso.test(a.due) ? a.due : null })),
    tasks: plan.tasks.map((t) => ({ ...t, title: cleanStyle(t.title).trim(), dueDate: t.dueDate && iso.test(t.dueDate) ? t.dueDate : null, waitingOn: t.waitingOn?.trim() || null })),
    dateChanges: plan.dateChanges.map((d) => ({ ...d, newDate: d.newDate && iso.test(d.newDate) ? d.newDate : null })),
    nextStep: plan.nextStep ? cleanStyle(plan.nextStep).trim() : null,
    healthReason: plan.healthReason ? cleanStyle(plan.healthReason).trim() : null,
    notesUpdate: cleanStyle(plan.notesUpdate).trim(),
    openQuestions: plan.openQuestions.map((q) => cleanStyle(q).trim()).filter(Boolean),
  };
}

export async function buildMinutes(ctx: MinutesContext): Promise<{ plan: MinutesPlan; engine: "claude" | "rules" }> {
  if (aiEnabled()) {
    try {
      const plan = await claudeMinutes(ctx);
      if (plan) return { plan: normalizeMinutes(plan), engine: "claude" };
    } catch (err) {
      console.error("[orbit] minutes build failed, using skeleton", err);
    }
  }
  return { plan: normalizeMinutes(rulesMinutes(ctx)), engine: "rules" };
}
