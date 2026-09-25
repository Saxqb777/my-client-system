import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { healthEnum, milestoneTypeEnum, taskPriorityEnum, type Client, type Meeting, type Milestone, type Person, type Task } from "@/lib/db/schema";
import { phaseLabel } from "@/lib/core/constants";
import { formatDate, formatDateTime, todayISO } from "@/lib/core/dates";
import { STANDARD_MOM_FORMAT, projectLabel } from "@/lib/core/minutes";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

export { STANDARD_MOM_FORMAT };

/** The shape Claude returns after reading a transcript. Everything is reviewed by Saaqib before it is saved. */
export const minutesPlanSchema = z.object({
  title: z.string().describe("Meeting title for the heading, for example OMS x Maqta Pay Joint Working Session. No client code, no date, no Fero prefix."),
  location: z.string().nullable().describe("Where it was held: Microsoft Teams, Zoom, or the place. Null if the transcript does not say."),
  attendees: z.array(z.string()).describe("People present, as named in the transcript, one string each"),
  objective: z.string().describe("Meeting Objective: one paragraph of one or two sentences on what the session was for."),
  points: z
    .array(
      z.object({
        topic: z.string().describe("Two or three word topic label, for example Payment Scope, Settlement Model, Prerequisites, Invoice Generation"),
        text: z.string().describe("Two to four sentences of prose on what was explained, confirmed and agreed under this topic. Passive voice. Fero staff are never named."),
      }),
    )
    .describe("Discussion Points: six to twelve topics in the order they were discussed, covering everything material. Fewer only for a short meeting."),
  summary: z.string().describe("Two plain sentences on what the meeting was about and what came out of it, for the client timeline"),
  decisions: z.array(z.string()).describe("Decisions taken, one clean sentence each, for the client timeline. Empty if none."),
  actionItems: z.array(
    z.object({
      text: z.string().describe("The action as a clean instruction, no owner inside the text"),
      owner: z.string().nullable().describe("Full name of the person responsible, or the organisation such as Fero when no one person was named"),
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

export type MinutesContext = {
  meeting: Meeting;
  client: Client & { people: Person[]; milestones: Milestone[]; tasks: Task[] };
  transcript: string;
};

function systemPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  const rules = c.momFormat?.trim();
  return [
    "You write minutes of meeting for Saaqib, a product analyst at Fero in Abu Dhabi who runs enterprise client projects. The minutes go to the client as a Word document, so accuracy and tone matter more than length.",
    "Read the transcript and fill the fields below. Never invent facts, names or dates. If something is unclear, leave it out of the minutes and put it in openQuestions.",
    "",
    "Standard MOM layout, the same for every client. Orbit renders it, you only supply the content:",
    STANDARD_MOM_FORMAT,
    "",
    "How to write the discussion points: read the whole transcript first, group what was said into topics, one bullet per topic, in meeting order. Each bullet is a small paragraph of prose that a reader who was not there can follow: what was explained, what was confirmed, what was agreed, what was deferred. Write in the passive or with the system or team as the subject: 'the OMS will generate', 'it was confirmed', 'the Magnati model is preferred'. Do not write 'we' or 'I'. Do not name Fero staff. Client and third party people may be named where the point needs it.",
    "Action points: one row per commitment, the action as a clean instruction, the owner as the person's full name, or Fero when the Fero team owns it and no one person was named.",
    rules ? `Rules for this client, on top of the standard layout: ${rules}` : "",
    "",
    `Writing style for everything you output: ${WRITING_STYLE_RULES}`,
    "",
    "Also extract, from the transcript only: decisions and a two sentence summary for the client timeline, Saaqib's own follow ups as tasks (things Fero or Saaqib must do, send, prepare or chase; when someone else must act first, set waitingOn), any moved or agreed project dates as dateChanges matching the client's existing milestones, a health change only if the meeting clearly changed it, and the client's next step.",
    "notesUpdate: rewrite the client notes below so they stay a short, current briefing. Keep facts that still hold, add what this meeting established, remove what it made obsolete.",
    "Dates: resolve relative dates using the meeting date and yyyy-MM-dd format.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function userPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  const people = c.people.map((p) => `${p.name}${p.role ? `, ${p.role}` : ""} (${p.side})`).join("\n") || "none recorded";
  const dates = c.milestones.filter((m) => m.status === "upcoming").map((m) => `${m.type}: ${m.title}, ${formatDate(m.date)}`).join("\n") || "none";
  const openTasks = c.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 30).map((t) => `${t.title}${t.waitingOn ? ` (waiting on ${t.waitingOn})` : ""}`).join("\n") || "none";
  return [
    `Today is ${todayISO()} (Asia/Dubai).`,
    `Client: ${c.name} (${c.code})${c.fullName ? `, ${c.fullName}` : ""}. System: ${c.system ?? "not set"}. Project label: ${projectLabel(c)}. Phase: ${phaseLabel(c.phase)}. Health: ${c.health}.`,
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

/** Without a key: an empty frame in the standard layout with the transcript as the first point. Saaqib fills it in. */
export function rulesMinutes(ctx: MinutesContext): MinutesPlan {
  const c = ctx.client;
  const excerpt = ctx.transcript.trim().replace(/\s+/g, " ").slice(0, 1200);
  return {
    title: ctx.meeting.title,
    location: ctx.meeting.location ?? null,
    attendees: ctx.meeting.attendees,
    objective: "",
    points: [{ topic: "Transcript", text: excerpt }],
    summary: "Minutes drafted from the transcript without Claude. Review before sending.",
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
  const tidy = (s: string) => cleanStyle(s).trim();
  return {
    ...plan,
    title: tidy(plan.title),
    location: plan.location?.trim() || null,
    objective: tidy(plan.objective),
    points: plan.points.map((p) => ({ topic: tidy(p.topic).replace(/:$/, ""), text: tidy(p.text) })).filter((p) => p.text),
    summary: tidy(plan.summary),
    decisions: plan.decisions.map(tidy).filter(Boolean),
    actionItems: plan.actionItems.map((a) => ({ text: tidy(a.text), owner: a.owner?.trim() || null, due: a.due && iso.test(a.due) ? a.due : null })).filter((a) => a.text),
    tasks: plan.tasks.map((t) => ({ ...t, title: tidy(t.title), dueDate: t.dueDate && iso.test(t.dueDate) ? t.dueDate : null, waitingOn: t.waitingOn?.trim() || null })),
    dateChanges: plan.dateChanges.map((d) => ({ ...d, newDate: d.newDate && iso.test(d.newDate) ? d.newDate : null })),
    nextStep: plan.nextStep ? tidy(plan.nextStep) : null,
    healthReason: plan.healthReason ? tidy(plan.healthReason) : null,
    notesUpdate: tidy(plan.notesUpdate),
    openQuestions: plan.openQuestions.map(tidy).filter(Boolean),
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
