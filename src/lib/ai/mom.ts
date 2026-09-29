import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { healthEnum, milestoneTypeEnum, taskPriorityEnum, type Client, type Meeting, type Milestone, type Person, type Task } from "@/lib/db/schema";
import { phaseLabel } from "@/lib/core/constants";
import { formatDate, formatDateTime, todayISO } from "@/lib/core/dates";
import { STANDARD_MOM_FORMAT, projectLabel } from "@/lib/core/minutes";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

export { STANDARD_MOM_FORMAT };

/** Where in the transcript a change comes from. The quote must be the exact words, the marker the [m:ss] printed on that line. */
export const evidenceSchema = z.object({
  quote: z.string().describe("The exact words from the transcript that justify this, copied verbatim, at least four words, no paraphrase"),
  at: z.string().nullable().describe("The time marker printed at the start of that transcript line, for example 12:34 or 1:02:03. Null if the transcript has no markers."),
});

/** The shape Claude returns after reading a transcript. Clear evidence lets Orbit apply a change by itself; the rest waits for Saaqib. */
export const minutesPlanSchema = z.object({
  title: z.string().describe("Meeting title for the heading, for example OMS x Maqta Pay Joint Working Session. No client code, no date, no Fero prefix."),
  location: z.string().nullable().describe("Where it was held: Microsoft Teams, Zoom, or the place. Null if the transcript does not say."),
  attendees: z.array(z.string()).describe("People present, as named in the transcript, one string each"),
  objective: z.string().describe("Meeting Objective: one paragraph of one or two sentences on what the session was for."),
  points: z
    .array(
      z.object({
        topic: z.string().describe("Topic head, always present: a noun phrase of two to four words, for example Units of Measure, Vehicle and Container Types, Vendor Allocation, Service Costing, Session Planning"),
        text: z.string().describe("One to three sentences of prose on what exists, what was confirmed or agreed, what is to be added and what stays open under this topic. Passive voice. Fero staff are never named."),
      }),
    )
    .describe("Discussion Points: one per topic in the order discussed, as many as the meeting had. A short call may have three, a long workshop twenty or more. Never merge topics to hit a count and never pad."),
  details: z
    .object({
      attendeesFero: z.array(z.string()).describe("Fero side people present, full names"),
      attendeesClient: z.array(z.string()).describe("Client and third party people present, full names, organisation in brackets when known"),
      agenda: z.array(z.string()).describe("Topics discussed, in order, three to eight words each"),
      openPoints: z.array(z.string()).describe("Pending items and questions left open, one sentence each"),
      nextMeeting: z.string().nullable().describe("Date, time and subject of the next meeting if one was mentioned, else null"),
    })
    .describe("The additional details sheet that goes with the MOM: attendees by side, agenda, open points, next meeting"),
  summary: z.string().describe("Two plain sentences on what the meeting was about and what came out of it, for the client timeline"),
  decisions: z.array(z.string()).describe("Decisions taken, one clean sentence each, for the client timeline. Empty if none."),
  actionItems: z.array(
    z.object({
      text: z.string().describe("The action as a clean instruction starting with a verb, no owner inside the text. Every item the discussion marks as to be added, to be confirmed or to be shared becomes one row."),
      owner: z.string().nullable().describe("Full name of the person responsible, Fero when the Fero team owns it, or two names joined with and when shared, for example Mohammad Al Sibaei and Diego Cueto"),
      due: z.string().nullable().describe("yyyy-MM-dd if a date was agreed, else null"),
      evidence: evidenceSchema.nullable().describe("The words where this action was agreed"),
    }),
  ),
  tasks: z.array(
    z.object({
      title: z.string().describe("A follow up Saaqib himself must do or chase, written as an instruction"),
      dueDate: z.string().nullable(),
      waitingOn: z.string().nullable().describe("Set when Saaqib is waiting on someone else to act"),
      priority: z.enum(taskPriorityEnum.enumValues),
      evidence: evidenceSchema.nullable().describe("The words where Saaqib took this on"),
    }),
  ),
  dateChanges: z.array(
    z.object({
      type: z.enum(milestoneTypeEnum.enumValues),
      title: z.string().nullable(),
      newDate: z.string().nullable().describe("yyyy-MM-dd"),
      markDone: z.boolean(),
      evidence: evidenceSchema.nullable().describe("The words where this date was agreed or the milestone was reported done"),
    }),
  ),
  phaseDates: z
    .object({
      startDate: z.string().nullable().describe("yyyy-MM-dd when the meeting agreed when the current phase starts or started, else null"),
      targetDate: z.string().nullable().describe("yyyy-MM-dd when the meeting agreed a new target or completion date for the current phase, else null"),
      evidence: evidenceSchema.nullable(),
    })
    .nullable()
    .describe("Only when the meeting agreed the phase start or target date. Null otherwise."),
  health: z.enum(healthEnum.enumValues).nullable().describe("Only when the meeting clearly changes the project health"),
  healthReason: z.string().nullable(),
  healthEvidence: evidenceSchema.nullable().describe("The words that show the health changed"),
  risks: z.array(
    z.object({
      text: z.string().describe("The risk, delay or blocker in one sentence, or the risk that was resolved"),
      status: z.enum(["new", "resolved"]),
      evidence: evidenceSchema.nullable(),
    }),
  ),
  doneItems: z.array(
    z.object({
      text: z.string().describe("Something reported finished in the meeting that may close an open task, one line"),
      evidence: evidenceSchema.nullable(),
    }),
  ),
  nextStep: z.string().nullable().describe("The single most important next step for this client after the meeting, or null"),
  nextStepEvidence: evidenceSchema.nullable().describe("The words that set this next step"),
  notesUpdate: z.string().describe("The client notes rewritten: keep every existing fact that is still true, fold in what this meeting taught, drop nothing important. Plain paragraphs, under 350 words."),
  openQuestions: z.array(z.string()),
});

export type MinutesPlan = z.infer<typeof minutesPlanSchema>;

export type MinutesContext = {
  meeting: Meeting;
  /** Null for Other Work: an internal Fero meeting or anything not client specific. */
  client: (Client & { people: Person[]; milestones: Milestone[]; tasks: Task[] }) | null;
  transcript: string;
};

function systemPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  const rules = c?.momFormat?.trim();
  return [
    "You write minutes of meeting for Saaqib, a product analyst at Fero in Abu Dhabi who runs enterprise client projects. The minutes go to the client as a Word document, so accuracy and tone matter more than length.",
    "Read the transcript and fill the fields below. Never invent facts, names or dates. If something is unclear, leave it out of the minutes and put it in openQuestions.",
    "",
    "Standard MOM layout, the same for every client. Orbit renders it, you only supply the content:",
    STANDARD_MOM_FORMAT,
    "",
    "How to write the discussion points: read the whole transcript first, group what was said into topics, one bullet per topic, in meeting order. Each bullet is a small paragraph of prose that a reader who was not there can follow: what was explained, what was confirmed, what was agreed, what was deferred. Write in the passive or with the system or team as the subject: 'the OMS will generate', 'it was confirmed', 'the Magnati model is preferred'. Do not write 'we' or 'I'. Do not name Fero staff. Client and third party people may be named where the point needs it.",
    "Action points: one row per commitment, the action as a clean instruction starting with a verb. Everything the discussion marks as to be added, to be confirmed or to be shared becomes a row. Owner is the person's full name, Fero when the Fero team owns it, or two names joined with and when shared.",
    "",
    "Example of the form, from an approved MOM. Copy the shape, never the content:",
    "Meeting Objective: Continuation of the configuration walkthrough, covering units of measure, vehicle and container types, equipment, users and roles, the service provider model, and the costing of charge codes.",
    "Point, topic Units of Measure: Each unit carries a code, symbol, name and dimension, such as weight, volume, time, count, energy, area or length. Standard units are preloaded and further units can be added.",
    "Point, topic Vendor Allocation: More than one vendor may serve the same service. The model discussed routes a request to the cheapest vendor by default, passing to the next on rejection, with the tenant able to select a preferred vendor at a premium. Vendor performance is to be tracked against KPIs and SLAs.",
    "Point, topic Session Planning: Longer sessions of two to three hours were proposed. Next week operations are committed to an exhibition and Finance to quarter closing, with Finance available from 7 to 9 October. Finance topics are to lead next week.",
    "Action: Add refrigerated and frozen to the vehicle and container types. Owner: Fero.",
    "Action: Confirm whether security or HSE approves equipment documents. Owner: Mohammad Al Sibaei.",
    "Action: Confirm the vendor allocation and tenant selection model. Owner: Mohammad Al Sibaei and Diego Cueto.",
    "details: a second sheet Saaqib keeps beside the MOM. Attendees split by side (Fero people versus client and third parties), the agenda as it ran, open points, the next meeting if mentioned. Decisions go in the decisions list.",
    rules ? `Rules for this client, on top of the standard layout: ${rules}` : "",
    "",
    `Writing style for everything you output: ${WRITING_STYLE_RULES}`,
    "",
    "Also extract, from the transcript only: decisions and a two sentence summary for the client timeline, Saaqib's own follow ups as tasks (things Fero or Saaqib must do, send, prepare or chase; when someone else must act first, set waitingOn), any moved or agreed project dates as dateChanges matching the client's existing milestones, the phase start or target date only if the meeting agreed one, a health change only if the meeting clearly changed it, risks or delays raised or resolved, things reported finished as doneItems, and the client's next step.",
    "Evidence: Orbit applies a change to the client by itself only when you point at the words. For every task, action, date change, phase date, health change, risk, done item and next step, set evidence to the exact words from the transcript (copied verbatim, at least four words, never paraphrased) and the time marker printed at the start of that line. If you cannot point at words that say it, set evidence to null and the change waits for Saaqib. Never invent a quote.",
    "notesUpdate: rewrite the client notes below so they stay a short, current briefing. Keep facts that still hold, add what this meeting established, remove what it made obsolete.",
    "Dates: resolve relative dates using the meeting date and yyyy-MM-dd format.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}

function userPrompt(ctx: MinutesContext): string {
  const c = ctx.client;
  const people = c?.people.map((p) => `${p.name}${p.role ? `, ${p.role}` : ""} (${p.side})`).join("\n") || "none recorded";
  const dates = c?.milestones.filter((m) => m.status === "upcoming").map((m) => `${m.type}: ${m.title}, ${formatDate(m.date)}`).join("\n") || "none";
  const openTasks = c?.tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").slice(0, 30).map((t) => `${t.title}${t.waitingOn ? ` (waiting on ${t.waitingOn})` : ""}`).join("\n") || "none";
  return [
    `Today is ${todayISO()} (Asia/Dubai).`,
    c
      ? `Client: ${c.name} (${c.code})${c.fullName ? `, ${c.fullName}` : ""}. System: ${c.system ?? "not set"}. Project label: ${projectLabel(c)}. Phase: ${phaseLabel(c.phase)}. Health: ${c.health}.`
      : "This is Other Work: an internal Fero meeting or one not tied to a client. Heading reads Fero | title. No client fields, dates or health to update; leave dateChanges empty and health null.",
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
    c?.notes?.trim() || "none yet",
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
    details: { attendeesFero: [], attendeesClient: ctx.meeting.attendees, agenda: [], openPoints: [], nextMeeting: null },
    summary: "Minutes drafted from the transcript without Claude. Review before sending.",
    decisions: [],
    actionItems: [],
    tasks: [],
    dateChanges: [],
    phaseDates: null,
    health: null,
    healthReason: null,
    healthEvidence: null,
    risks: [],
    doneItems: [],
    nextStep: null,
    nextStepEvidence: null,
    notesUpdate: c?.notes ?? "",
    openQuestions: [],
  };
}

/** Evidence quotes stay exactly as Claude copied them, so they can be found in the transcript again. */
function keepEvidence<T extends { quote: string; at: string | null } | null | undefined>(e: T): T {
  if (!e) return e;
  return { ...e, quote: e.quote.trim(), at: e.at?.trim() || null } as T;
}

/**
 * Every discussion point starts with a topic head. When Claude leaves it out, the head is taken from the
 * opening words of the point: up to the first comma, colon or full stop, at most five words.
 */
export function topicHead(text: string): string {
  const weak = new Set(["is", "are", "was", "were", "be", "to", "of", "and", "or", "the", "a", "an", "for", "with", "by", "in", "on", "at", "as"]);
  const opening = text.trim().split(/[,:.;]/)[0] ?? "";
  const words = opening.replace(/^(the|a|an)\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 5);
  while (words.length > 1 && weak.has(words[words.length - 1].toLowerCase())) words.pop();
  return words.join(" ");
}

export function normalizeMinutes(plan: MinutesPlan): MinutesPlan {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const tidy = (s: string) => cleanStyle(s).trim();
  return {
    ...plan,
    title: tidy(plan.title),
    location: plan.location?.trim() || null,
    objective: tidy(plan.objective),
    points: plan.points
      .map((p) => {
        const text = tidy(p.text);
        const topic = tidy(p.topic).replace(/:$/, "") || topicHead(text);
        return { topic, text };
      })
      .filter((p) => p.text),
    details: {
      attendeesFero: plan.details.attendeesFero.map((a) => a.trim()).filter(Boolean),
      attendeesClient: plan.details.attendeesClient.map((a) => a.trim()).filter(Boolean),
      agenda: plan.details.agenda.map(tidy).filter(Boolean),
      openPoints: plan.details.openPoints.map(tidy).filter(Boolean),
      nextMeeting: plan.details.nextMeeting ? tidy(plan.details.nextMeeting) : null,
    },
    summary: tidy(plan.summary),
    decisions: plan.decisions.map(tidy).filter(Boolean),
    actionItems: plan.actionItems.map((a) => ({ text: tidy(a.text), owner: a.owner?.trim() || null, due: a.due && iso.test(a.due) ? a.due : null, evidence: keepEvidence(a.evidence ?? null) })).filter((a) => a.text),
    tasks: plan.tasks.map((t) => ({ ...t, title: tidy(t.title), dueDate: t.dueDate && iso.test(t.dueDate) ? t.dueDate : null, waitingOn: t.waitingOn?.trim() || null, evidence: keepEvidence(t.evidence ?? null) })),
    dateChanges: plan.dateChanges.map((d) => ({ ...d, newDate: d.newDate && iso.test(d.newDate) ? d.newDate : null, evidence: keepEvidence(d.evidence ?? null) })),
    phaseDates:
      plan.phaseDates && (plan.phaseDates.startDate || plan.phaseDates.targetDate)
        ? {
            startDate: plan.phaseDates.startDate && iso.test(plan.phaseDates.startDate) ? plan.phaseDates.startDate : null,
            targetDate: plan.phaseDates.targetDate && iso.test(plan.phaseDates.targetDate) ? plan.phaseDates.targetDate : null,
            evidence: keepEvidence(plan.phaseDates.evidence ?? null),
          }
        : null,
    healthEvidence: keepEvidence(plan.healthEvidence ?? null),
    nextStepEvidence: keepEvidence(plan.nextStepEvidence ?? null),
    risks: (plan.risks ?? []).map((r) => ({ text: tidy(r.text), status: r.status, evidence: keepEvidence(r.evidence ?? null) })).filter((r) => r.text),
    doneItems: (plan.doneItems ?? []).map((d) => ({ text: tidy(d.text), evidence: keepEvidence(d.evidence ?? null) })).filter((d) => d.text),
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
