import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  activityTypeEnum,
  healthEnum,
  milestoneTypeEnum,
  taskPriorityEnum,
  type Client,
  type Milestone,
} from "@/lib/db/schema";
import { MILESTONE_TYPES, PHASES, phaseLabel } from "@/lib/core/constants";
import { formatDate, isValidISODate, todayISO } from "@/lib/core/dates";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { extractDates, matchClient, titleCase, truncate } from "@/lib/core/text";
import { phaseValues } from "@/lib/validation";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

// Plan shape shared by the AI parser, the rules parser, the preview UI and the apply step.

export const quickLogPlanSchema = z.object({
  clientCode: z
    .string()
    .nullable()
    .describe("Code of the client this update is about, chosen from the provided list, or null if unclear"),
  confidence: z.enum(["high", "medium", "low"]),
  activity: z
    .object({
      type: z.enum(activityTypeEnum.enumValues),
      title: z.string().describe("The update rewritten as one short past tense action line, under 120 characters"),
      body: z.string().nullable().describe("Extra detail worth keeping, or null"),
    })
    .nullable(),
  clientUpdates: z.object({
    health: z.enum(healthEnum.enumValues).nullable(),
    phase: z.enum(phaseValues).nullable(),
    nextStep: z.string().nullable().describe("New next step for the client if the text states one"),
  }),
  milestoneUpdates: z.array(
    z.object({
      type: z.enum(milestoneTypeEnum.enumValues),
      title: z.string().nullable().describe("Milestone name if given, for example BRD sign off"),
      newDate: z.string().nullable().describe("New date as yyyy-MM-dd, or null"),
      markDone: z.boolean().describe("True when the text says this milestone is complete or signed off"),
    }),
  ),
  tasks: z.array(
    z.object({
      title: z.string(),
      dueDate: z.string().nullable().describe("yyyy-MM-dd or null"),
      waitingOn: z.string().nullable().describe("Person or client we are waiting on, or null"),
      priority: z.enum(taskPriorityEnum.enumValues),
    }),
  ),
  notes: z.string().nullable().describe("Anything ambiguous Saaqib should double check, or null"),
});

export type QuickLogPlan = z.infer<typeof quickLogPlanSchema>;
export type ParseEngine = "claude" | "rules";

export type ParseResult = {
  plan: QuickLogPlan;
  engine: ParseEngine;
  client: Pick<Client, "id" | "name" | "code"> | null;
};

export type ClientContext = Client & { upcoming?: Pick<Milestone, "type" | "title" | "date">[] };

const SYSTEM_PROMPT = [
  "You turn short work updates into structured actions for Orbit, the personal command center of Saaqib, a product analyst in Abu Dhabi who runs several enterprise client projects at once (BRDs, SIT, UAT, go lives, client follow ups).",
  "Read the update, decide which client it is about, and produce exactly the actions the text supports. Never invent facts.",
  "Activity: always produce one activity. Its title is the update rewritten as one clean past tense action line.",
  "Client updates: set health only when the text clearly says blocked, at risk, delayed, or back on track. Set phase only when the text says the project entered a phase (for example UAT started, went live). Set nextStep only when the text states what happens next.",
  "Milestones: when the text gives or moves a date for go live, UAT, SIT, a target, a system date or a named milestone, add a milestoneUpdates entry with the new date. When it says a milestone is signed off, completed or done, set markDone true.",
  "Tasks: create a task for follow ups, reminders, things to send or prepare, and anything Saaqib is waiting on from someone (waitingOn holds the person or client). Do not create tasks for things already done.",
  "Dates: resolve relative dates such as tomorrow, next Monday or 15 Oct using the provided today date and yyyy-MM-dd format. Years default to the nearest upcoming occurrence.",
  `Writing style for every title and text you output: ${WRITING_STYLE_RULES}`,
].join("\n");

function clientListForPrompt(clients: ClientContext[]): string {
  return clients
    .filter((c) => !c.archivedAt)
    .map((c) => {
      const aliases = [c.fullName, ...(c.aliases ?? [])].filter(Boolean).join(", ");
      const upcoming = (c.upcoming ?? [])
        .slice(0, 4)
        .map((m) => `${MILESTONE_TYPES[m.type].label} ${m.title} ${formatDate(m.date)}`)
        .join("; ");
      return `- ${c.code}: ${c.name}${aliases ? ` (also called ${aliases})` : ""}. Phase ${phaseLabel(c.phase)}, health ${c.health}.${upcoming ? ` Upcoming: ${upcoming}.` : ""}`;
    })
    .join("\n");
}

/** Cleans and sanity checks a plan from either engine. */
export function normalizePlan(plan: QuickLogPlan, clients: Client[]): QuickLogPlan {
  const codes = new Set(clients.filter((c) => !c.archivedAt).map((c) => c.code));
  const fixDate = (d: string | null) => (d && isValidISODate(d) ? d : null);
  return {
    clientCode: plan.clientCode && codes.has(plan.clientCode.toUpperCase()) ? plan.clientCode.toUpperCase() : null,
    confidence: plan.confidence,
    activity: plan.activity
      ? {
          type: plan.activity.type,
          title: truncate(cleanStyle(plan.activity.title).trim(), 200),
          body: plan.activity.body ? cleanStyle(plan.activity.body).trim() || null : null,
        }
      : null,
    clientUpdates: {
      health: plan.clientUpdates?.health ?? null,
      phase: plan.clientUpdates?.phase && PHASES.some((p) => p.value === plan.clientUpdates.phase) ? plan.clientUpdates.phase : null,
      nextStep: plan.clientUpdates?.nextStep ? cleanStyle(plan.clientUpdates.nextStep).trim() || null : null,
    },
    milestoneUpdates: (plan.milestoneUpdates ?? [])
      .map((m) => ({
        type: m.type,
        title: m.title ? cleanStyle(m.title).trim() || null : null,
        newDate: fixDate(m.newDate),
        markDone: Boolean(m.markDone),
      }))
      .filter((m) => m.newDate || m.markDone),
    tasks: (plan.tasks ?? [])
      .map((t) => ({
        title: truncate(cleanStyle(t.title).trim(), 200),
        dueDate: fixDate(t.dueDate),
        waitingOn: t.waitingOn ? cleanStyle(t.waitingOn).trim() || null : null,
        priority: t.priority ?? "normal",
      }))
      .filter((t) => t.title.length > 0),
    notes: plan.notes ? cleanStyle(plan.notes).trim() || null : null,
  };
}

// Rule based parser, used when no API key is set or the model call fails.

const MILESTONE_WORDS: { re: RegExp; type: Milestone["type"]; title: string }[] = [
  { re: /\bgo[\s-]?live\b|\bgolive\b|\bwent live\b|\bcut[\s-]?over\b/i, type: "go_live", title: "Go live" },
  { re: /\buat\b/i, type: "uat", title: "UAT sign off" },
  { re: /\bsit\b/i, type: "sit", title: "SIT completion" },
  { re: /\bbrd\b/i, type: "other", title: "BRD sign off" },
  { re: /\bdeadline\b|\btarget( date)?\b|\bdue date\b/i, type: "target", title: "Target date" },
  { re: /\bsystem date\b|\bfreeze\b/i, type: "system", title: "System date" },
];

function guessActivityType(text: string): QuickLogPlan["activity"] extends infer A ? (A extends { type: infer T } ? T : never) : never {
  const t = text.toLowerCase();
  if (/\b(meeting|met with|workshop|session|demo|walkthrough|walk through|call with|discussed)\b/.test(t)) {
    return /\bcall\b/.test(t) && !/\bmeeting\b/.test(t) ? "call" : "meeting";
  }
  if (/\bwhatsapp\b|\bwa\b|\bmessaged\b|\btexted\b/.test(t)) return "whatsapp";
  if (/\bemail(ed)?\b|\bmail(ed)?\b|\bsent .* (deck|report|tracker|document)\b/.test(t)) return "email";
  if (/\b(blocked|blocker|issue|bug|defect|failed|failure|escalat)/.test(t)) return "issue";
  if (/\b(delivered|deployed|released|went live|shared|handed over|completed|signed off|sign off)\b/.test(t)) return "delivery";
  if (/\b(decided|agreed|approved|confirmed|decision)\b/.test(t)) return "decision";
  return "update";
}

export function rulesParse(text: string, clients: Client[], today = todayISO()): QuickLogPlan {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const match = matchClient(clean, clients);
  const dates = extractDates(clean, today);
  const consumed = new Set<number>();

  const milestoneUpdates: QuickLogPlan["milestoneUpdates"] = [];
  for (const mw of MILESTONE_WORDS) {
    const m = mw.re.exec(clean);
    if (!m) continue;
    const done = /\b(signed off|sign off|signed-off|completed|complete|done|passed|closed|finished)\b/i.test(clean);
    const nearest = dates
      .filter((d) => !consumed.has(d.index))
      .sort((a, b) => Math.abs(a.index - m.index) - Math.abs(b.index - m.index))[0];
    const movement = /\b(moved|move|shifted|pushed|postponed|rescheduled|now|planned|scheduled|set|is|on|to|by|for)\b/i.test(clean);
    if (nearest && movement) {
      consumed.add(nearest.index);
      milestoneUpdates.push({ type: mw.type, title: mw.title, newDate: nearest.iso, markDone: false });
    } else if (done && (mw.type === "uat" || mw.type === "sit" || mw.type === "go_live" || mw.title === "BRD sign off")) {
      milestoneUpdates.push({ type: mw.type, title: mw.title, newDate: null, markDone: true });
    }
  }

  let health: QuickLogPlan["clientUpdates"]["health"] = null;
  if (/\bblocked\b|\bblocker\b|\bon hold\b/.test(lower)) health = "blocked";
  else if (/\bat risk\b|\bdelayed\b|\bslipp(ed|ing)\b|\bbehind schedule\b|\brisk\b/.test(lower)) health = "at_risk";
  else if (/\bback on track\b|\bunblocked\b|\bon track\b|\bresolved\b/.test(lower)) health = "on_track";

  let phase: string | null = null;
  const phaseMatch = /\b(started|kicked off|kick off|entered|moved to|now in|began|in)\s+(uat|sit|development|dev|brd|requirements|design|hypercare|discovery)\b/i.exec(clean);
  if (phaseMatch) {
    const word = phaseMatch[2].toLowerCase();
    phase = word === "dev" ? "development" : word === "brd" ? "requirements" : word;
  }
  if (/\b(went live|is live|now live|go live (done|completed))\b/i.test(clean)) phase = "hypercare";

  let nextStep: string | null = null;
  const nextMatch = /\b(next step|next|then)\s*[:\-]\s*(.+)$/i.exec(clean);
  if (nextMatch) nextStep = titleCase(nextMatch[2].trim());

  const tasks: QuickLogPlan["tasks"] = [];
  const waiting = /\b(waiting (?:on|for)|pending (?:from|with)|awaiting)\s+([A-Z][\w.]*(?:\s+[A-Z][\w.]*){0,2}|client|vendor|[a-z]+ team)\b(?:\s+(?:for|on|to)\s+(.+?))?(?=[.,;]|$)/i.exec(clean);
  if (waiting) {
    const who = waiting[2].trim();
    const what = waiting[3]?.trim();
    tasks.push({
      title: what ? titleCase(what) : `Follow up with ${who}`,
      dueDate: null,
      waitingOn: who,
      priority: "normal",
    });
  }
  const followUp = /\b(follow up|follow-up|remind me|need to|needs to|to do|todo|action)\b\s*[:\-]?\s*(.+?)(?=[.;]|$)/i.exec(clean);
  if (followUp && !waiting) {
    const due = dates.find((d) => !consumed.has(d.index));
    if (due) consumed.add(due.index);
    tasks.push({
      title: titleCase(followUp[2].trim() || "Follow up"),
      dueDate: due?.iso ?? null,
      waitingOn: null,
      priority: /\burgent\b|\basap\b/i.test(clean) ? "high" : "normal",
    });
  }

  const title = truncate(titleCase(clean.replace(/\s+/g, " ")), 160);
  return {
    clientCode: match ? match.client.code : null,
    confidence: match ? match.confidence : "low",
    activity: { type: guessActivityType(clean), title, body: null },
    clientUpdates: { health, phase, nextStep },
    milestoneUpdates,
    tasks,
    notes: match ? null : "Could not tell which client this is about. Pick one before saving.",
  };
}

// Claude parser

export async function claudeParse(text: string, clients: ClientContext[], today: string): Promise<QuickLogPlan | null> {
  const client = anthropic();
  const userContent = [
    `Today is ${today} (Asia/Dubai).`,
    "Clients:",
    clientListForPrompt(clients),
    "",
    "Update:",
    text.trim(),
  ].join("\n");

  const res = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 4000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "low", format: zodOutputFormat(quickLogPlanSchema) },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
  });

  if (res.stop_reason === "refusal") return null;
  return res.parsed_output ?? null;
}

export async function parseQuickLog(text: string, clients: ClientContext[]): Promise<ParseResult> {
  const today = todayISO();
  let engine: ParseEngine = "rules";
  let plan: QuickLogPlan | null = null;

  if (aiEnabled()) {
    try {
      plan = await claudeParse(text, clients, today);
      if (plan) engine = "claude";
    } catch (err) {
      console.error("[orbit] quick log parse failed, using rules", err);
    }
  }
  if (!plan) plan = rulesParse(text, clients, today);

  const normalized = normalizePlan(plan, clients);
  if (!normalized.clientCode) {
    const guess = matchClient(text, clients);
    if (guess) {
      normalized.clientCode = guess.client.code;
      normalized.confidence = guess.confidence;
    }
  }
  const client = clients.find((c) => c.code === normalized.clientCode) ?? null;
  return {
    plan: normalized,
    engine,
    client: client ? { id: client.id, name: client.name, code: client.code } : null,
  };
}
