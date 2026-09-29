import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Client, Meeting, TranscriptSegment } from "@/lib/db/schema";
import { formatDate } from "@/lib/core/dates";
import { EMPTY_NOTES, type UnderstandingNotes } from "@/lib/core/notes";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { transcriptForPrompt } from "@/lib/meetings/transcript";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

export const NOTES_PROMPT_VERSION = "notes-v1";

const stamped = z.object({ text: z.string(), at: z.number().nullable().describe("Seconds into the meeting where this was said, from the [m:ss] stamps, or null") });

export const notesSchema = z.object({
  about: z.array(z.string()).describe("Three to five plain lines: what this meeting was really about and where it landed"),
  wantsStated: z.array(z.string()).describe("What the client asked for in so many words"),
  wantsImplied: z.array(z.string()).describe("What the client wants but did not say outright, with the clue"),
  changedSinceLast: z.array(z.string()).describe("What moved compared with the previous meetings given below. Empty when there is no earlier meeting."),
  concerns: z.array(z.object({ text: z.string(), raisedBy: z.string().nullable(), at: z.number().nullable() })).describe("Risks, delays, concerns and frustrations, who raised them, and when"),
  unclear: z.array(stamped).describe("Things unclear, contradicted or left hanging"),
  askNextTime: z.array(z.string()).describe("Questions Saaqib should ask at the next meeting"),
  askedOfMe: z.array(stamped).describe("Anything asked of Saaqib directly: he is 'Me' or 'Saaqib' in the transcript"),
  jargon: z.array(z.object({ term: z.string(), meaning: z.string() })).describe("Jargon and technical terms explained simply, only ones that matter here"),
});

export type NotesContext = {
  meeting: Meeting;
  client: Pick<Client, "name" | "code" | "system" | "notes"> | null;
  segments: TranscriptSegment[];
  previous: { title: string; heldAt: Date; text: string }[];
};

function systemPrompt(): string {
  return [
    "You write private understanding notes for Saaqib, a product analyst at Fero in Abu Dhabi, after a client meeting. He reads these, nobody else. They must be clearer and more useful than the transcript: what it was really about, what the client wants, what changed, what is at risk, what is unclear, what he was asked to do, and what to ask next time.",
    "Be concrete and short. Name people when they raised something. Every concern, unclear item and ask of Saaqib carries the second it was said, taken from the [m:ss] stamp at the start of the transcript line. Never invent. If the transcript does not support a point, leave it out.",
    `Writing style: ${WRITING_STYLE_RULES}`,
  ].join("\n");
}

function userPrompt(ctx: NotesContext): string {
  const c = ctx.client;
  const previous = ctx.previous.length
    ? ctx.previous.map((p) => `${formatDate(p.heldAt)}, ${p.title}:\n${p.text.slice(0, 3000)}`).join("\n\n")
    : "none on record";
  return [
    c ? `Client: ${c.name} (${c.code}). System: ${c.system ?? "not set"}.` : "Other Work: an internal Fero meeting or one not tied to a client.",
    `Meeting: ${ctx.meeting.title}, ${formatDate(ctx.meeting.heldAt)}.`,
    "",
    "Current client notes:",
    c?.notes?.trim() || "none",
    "",
    "Previous meetings with this client, latest first:",
    previous,
    "",
    "Transcript with timestamps:",
    transcriptForPrompt(ctx.segments),
  ].join("\n");
}

export async function claudeNotes(ctx: NotesContext): Promise<UnderstandingNotes | null> {
  const client = anthropic();
  const res = await client.beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(notesSchema) },
    system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  if (res.stop_reason === "refusal") return null;
  return res.parsed_output ?? null;
}

export function normalizeNotes(n: UnderstandingNotes): UnderstandingNotes {
  const tidy = (s: string) => cleanStyle(s).trim();
  const list = (xs: string[]) => xs.map(tidy).filter(Boolean);
  const sec = (v: number | null) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  return {
    about: list(n.about).slice(0, 6),
    wantsStated: list(n.wantsStated),
    wantsImplied: list(n.wantsImplied),
    changedSinceLast: list(n.changedSinceLast),
    concerns: n.concerns.map((c) => ({ text: tidy(c.text), raisedBy: c.raisedBy?.trim() || null, at: sec(c.at) })).filter((c) => c.text),
    unclear: n.unclear.map((u) => ({ text: tidy(u.text), at: sec(u.at) })).filter((u) => u.text),
    askNextTime: list(n.askNextTime),
    askedOfMe: n.askedOfMe.map((u) => ({ text: tidy(u.text), at: sec(u.at) })).filter((u) => u.text),
    jargon: n.jargon.map((j) => ({ term: j.term.trim(), meaning: tidy(j.meaning) })).filter((j) => j.term && j.meaning),
  };
}

/** Without a key: an honest empty frame, so the page still renders and Saaqib sees why it is empty. */
export function rulesNotes(ctx: NotesContext): UnderstandingNotes {
  return { ...EMPTY_NOTES, about: ["Claude is not configured, so no notes were drafted. The transcript is on the Transcript tab."], askNextTime: [], jargon: [], unclear: [], askedOfMe: [], concerns: [], changedSinceLast: [], wantsStated: [], wantsImplied: [] , ...(ctx.previous.length ? {} : {}) };
}

export async function buildNotes(ctx: NotesContext): Promise<{ notes: UnderstandingNotes; engine: "claude" | "rules" }> {
  if (aiEnabled()) {
    try {
      const n = await claudeNotes(ctx);
      if (n) return { notes: normalizeNotes(n), engine: "claude" };
    } catch (err) {
      console.error("[orbit] notes build failed", err instanceof Error ? err.message : err);
    }
  }
  return { notes: rulesNotes(ctx), engine: "rules" };
}
