import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { BrdItem, BrdItemKind, BrdSections, DiscussionPoint, GapFinding, TranscriptSegment } from "@/lib/db/schema";
import { brdItemKindEnum } from "@/lib/db/schema";
import { cleanStyle, WRITING_STYLE_RULES } from "@/lib/core/style";
import { formatDate } from "@/lib/core/dates";
import { clockToSeconds, quoteInTranscript } from "@/lib/meetings/evidence";
import { transcriptForPrompt } from "@/lib/meetings/transcript";
import { ensureAllItems, rulesDraft, type DraftInput } from "@/lib/brd/draft";
import { MAX_ITEMS_PER_MEETING, dedupeItems, realTopic, rulesExtract, rulesExtractMinutes, type ExtractedItem } from "@/lib/brd/extract";
import { rulesGap } from "@/lib/brd/gap";
import { AI_MODEL, FALLBACK_BETAS, aiEnabled, anthropic } from "./client";

/**
 * The BRD helper's three Claude jobs: read a meeting for requirements, write the draft BRD from the items, and judge
 * an existing BRD against the items. Each falls back to the rule based version when Claude is off or fails.
 */

export const BRD_EXTRACT_VERSION = "brd-extract-v1";
export const BRD_DRAFT_VERSION = "brd-draft-v1";
export const BRD_GAP_VERSION = "brd-gap-v1";

type Engine = "claude" | "rules";

// ---------------------------------------------------------------------------------------------------------------
// 1. Extraction

const extractSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(brdItemKindEnum.enumValues).describe("requirement: something the system must do or show. business_rule: a policy, limit, calculation or condition. exception: a case handled differently. integration: data exchanged with another system. pain_point: what is hard or broken today."),
      text: z.string().describe("One clear sentence in requirement language, present tense, subject first, for example: The wallet shows the held deposit separately from the available balance."),
      group: z.string().nullable().describe("A two to four word topic head this item belongs to, for example Customer Tiers, Wallet, Rate Matrix. Reuse the same head for items on the same topic."),
      evidence: z
        .object({
          quote: z.string().describe("The exact words from the transcript or minutes that say this, copied verbatim, at least four words"),
          at: z.string().nullable().describe("The time marker printed at the start of that transcript line, for example 12:34. Null when quoting the minutes."),
        })
        .nullable(),
    }),
  ),
});

export type ExtractContext = {
  client: { name: string; code: string; system: string | null };
  meeting: { title: string; heldAt: Date };
  segments: TranscriptSegment[];
  points: DiscussionPoint[];
  minutesText: string | null;
};

async function claudeExtract(ctx: ExtractContext): Promise<ExtractedItem[] | null> {
  const transcript = ctx.segments.length ? transcriptForPrompt(ctx.segments) : "";
  const res = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 8000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(extractSchema) },
    system: [
      {
        type: "text",
        text: [
          "You are a senior business analyst reading one client meeting to feed a Business Requirements Document.",
          "List every requirement, business rule, exception, integration need and pain point the meeting states or agrees. One item per distinct need. Leave out small talk, scheduling, questions that were not answered, and anything Fero only offered to check.",
          "Write each item as one sentence a developer and a tester can act on. Keep numbers, names of systems, roles and conditions exactly as said. Never invent a need that was not said.",
          "Evidence: quote the exact words from the transcript that state the item, at least four words, and the time marker of that line. When only minutes are given, quote the minutes and set at to null.",
          `Writing style: ${WRITING_STYLE_RULES}`,
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `Client: ${ctx.client.name} (${ctx.client.code}). System: ${ctx.client.system ?? "not set"}.`,
          `Meeting: ${ctx.meeting.title}, ${formatDate(ctx.meeting.heldAt)}.`,
          ctx.points.length ? `Minutes, discussion points:\n${ctx.points.map((p) => `${p.topic ? `${p.topic}: ` : ""}${p.text}`).join("\n")}` : "",
          transcript ? `Transcript:\n${transcript}` : ctx.minutesText ? `Minutes text:\n${ctx.minutesText}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  const hay = transcript || ctx.minutesText || ctx.points.map((p) => p.text).join("\n");
  const items: ExtractedItem[] = res.parsed_output.items
    .map((i) => {
      const quote = i.evidence?.quote?.trim() ?? "";
      const found = quote ? quoteInTranscript(quote, hay) : false;
      return {
        kind: i.kind as BrdItemKind,
        text: cleanStyle(i.text.trim()).replace(/[.]+$/, ""),
        group: realTopic(i.group) ? cleanStyle(i.group!.trim()) : null,
        // A quote Claude could not copy verbatim is kept as context but without a time, so no link points at the wrong place.
        evidence: quote ? { quote, at: found && ctx.segments.length ? clockToSeconds(i.evidence?.at ?? null) : null } : null,
      };
    })
    .filter((i) => i.text.length > 0);
  return dedupeItems([], items).slice(0, MAX_ITEMS_PER_MEETING);
}

export async function extractRequirements(ctx: ExtractContext): Promise<{ items: ExtractedItem[]; engine: Engine }> {
  if (aiEnabled()) {
    try {
      const items = await claudeExtract(ctx);
      if (items) return { items, engine: "claude" };
    } catch (err) {
      console.error("[orbit] brd extraction failed, using rules", err instanceof Error ? err.message : err);
    }
  }
  return { items: ctx.segments.length ? rulesExtract(ctx.segments, ctx.points) : rulesExtractMinutes(ctx.points), engine: "rules" };
}

// ---------------------------------------------------------------------------------------------------------------
// 2. Draft

const lineSchema = z.object({ text: z.string(), refs: z.array(z.string()).describe("Labels of the items this line comes from, for example [I3, I7]. At least one.") });

const draftSchema = z.object({
  purpose: z.string().describe("Two or three sentences: what the system is for and whom it serves"),
  scopeIn: z.array(z.string()).describe("Processes and modules in scope, one short line each"),
  scopeOut: z.array(z.string()).describe("Only what the meetings said is out of scope or deferred. Empty if nothing was said."),
  currentProcess: z.string().describe("A short paragraph on how it works today, from the pain points. Say 'Not described in the meetings yet.' if there is nothing."),
  proposedProcess: z.string().describe("A short paragraph on how it will work with the new system"),
  functional: z.array(lineSchema),
  nonFunctional: z.array(lineSchema),
  businessRules: z.array(lineSchema).describe("Business rules and exceptions"),
  integrations: z.array(lineSchema),
  assumptions: z.array(z.string()),
  dependencies: z.array(z.string()),
  openQuestions: z.array(z.string()).describe("What the meetings left open or contradicted"),
});

async function claudeDraft(input: DraftInput, labels: Map<string, string>): Promise<BrdSections | null> {
  const byLabel = new Map(Array.from(labels.entries()).map(([id, label]) => [label, id]));
  const live = input.items.filter((i) => i.status !== "dropped");
  const res = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 16000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(draftSchema) },
    system: [
      {
        type: "text",
        text: [
          "You write the first draft of a Business Requirements Document for Fero, a logistics software company in Abu Dhabi, from requirement items gathered in client meetings.",
          "Use only the items given. Every functional requirement, business rule, exception and integration item must appear in exactly one line, and every line lists the labels of the items it comes from in refs. Merge items that say the same thing into one line with both labels.",
          "Requirement lines are one or two sentences, testable, present tense, subject first: 'The system...', 'Finance can...'. Keep numbers, roles and system names exactly as in the items. Performance, security, access, audit, availability and language needs go to non functional.",
          "Scope out, assumptions and dependencies only from what the items support; leave them empty rather than guess. Open questions list what is unclear or contradictory between items.",
          `Writing style for every line: ${WRITING_STYLE_RULES}`,
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          `Client: ${input.client.name} (${input.client.code})${input.client.fullName ? `, ${input.client.fullName}` : ""}. System: ${input.client.system ?? "not set"}. Phase: ${input.client.phase}.`,
          `Meetings read: ${input.meetings.map((m) => `${m.title} (${formatDate(m.heldAt)})`).join("; ") || "none"}.`,
          input.client.notes?.trim() ? `Client notes:\n${input.client.notes.trim()}` : "",
          `Items:\n${live.map((i) => `[${labels.get(i.id)}] ${i.kind}${i.groupName ? `, ${i.groupName}` : ""}: ${i.text}`).join("\n")}`,
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  const d = res.parsed_output;
  const lines = (list: { text: string; refs: string[] }[]) =>
    list
      .map((l) => ({ id: "", text: cleanStyle(l.text.trim()), itemIds: Array.from(new Set(l.refs.map((r) => byLabel.get(r.replace(/[[\]\s]/g, ""))).filter((x): x is string => Boolean(x)))) }))
      .filter((l) => l.text);
  const tidy = (list: string[]) => list.map((x) => cleanStyle(x.trim())).filter(Boolean);
  return {
    purpose: cleanStyle(d.purpose.trim()),
    scopeIn: tidy(d.scopeIn),
    scopeOut: tidy(d.scopeOut),
    stakeholders: input.people.map((p) => ({ name: p.name, role: p.role ?? "", side: p.side })),
    currentProcess: cleanStyle(d.currentProcess.trim()),
    proposedProcess: cleanStyle(d.proposedProcess.trim()),
    functional: lines(d.functional),
    nonFunctional: lines(d.nonFunctional),
    businessRules: lines(d.businessRules),
    integrations: lines(d.integrations),
    assumptions: tidy(d.assumptions),
    dependencies: tidy(d.dependencies),
    openQuestions: tidy(d.openQuestions),
  };
}

/** Short labels for the prompt, I1, I2 and so on, mapped back to item ids afterwards. */
export function itemLabels(items: Pick<BrdItem, "id">[]): Map<string, string> {
  return new Map(items.map((i, n) => [i.id, `I${n + 1}`]));
}

export async function writeBrdDraft(input: DraftInput): Promise<{ sections: BrdSections; engine: Engine }> {
  const live = input.items.filter((i) => i.status !== "dropped");
  if (aiEnabled() && live.length) {
    try {
      const sections = await claudeDraft(input, itemLabels(live));
      if (sections) return { sections: ensureAllItems(sections, input.items), engine: "claude" };
    } catch (err) {
      console.error("[orbit] brd draft failed, using rules", err instanceof Error ? err.message : err);
    }
  }
  return { sections: ensureAllItems(rulesDraft(input), input.items), engine: "rules" };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. Gap check

const gapSchema = z.object({
  findings: z.array(
    z.object({
      kind: z.enum(["missing", "contradiction", "vague"]),
      text: z.string().describe("One sentence Saaqib can act on: what is missing, what contradicts what, or what needs a measure or a name"),
      brdLine: z.string().nullable().describe("The exact sentence from the BRD this is about, copied verbatim. Null for missing items."),
      ref: z.string().nullable().describe("Label of the item this is about, for example I4. Null for a vague line with no item behind it."),
    }),
  ),
});

async function claudeGap(brdText: string, items: BrdItem[], labels: Map<string, string>): Promise<GapFinding[] | null> {
  const byLabel = new Map(Array.from(labels.entries()).map(([id, label]) => [label, id]));
  const byId = new Map(items.map((i) => [i.id, i]));
  const res = await anthropic().beta.messages.parse({
    model: AI_MODEL,
    max_tokens: 12000,
    betas: [...FALLBACK_BETAS],
    fallbacks: "default",
    output_config: { effort: "medium", format: zodOutputFormat(gapSchema) },
    system: [
      {
        type: "text",
        text: [
          "You check a client's Business Requirements Document against what the client actually said in meetings, given as numbered items.",
          "Report three things. missing: an item from the meetings the BRD does not cover, one finding per item. contradiction: a BRD sentence that says something different from an item, for example a different number, role, order or condition. vague: a BRD sentence a developer or tester cannot act on as written, because it has no measure, no owner, no named data or uses words like fast, easy, etc, as needed.",
          "Do not report items the BRD covers in other words. Do not invent items. Quote BRD sentences verbatim in brdLine.",
          `Writing style: ${WRITING_STYLE_RULES}`,
        ].join("\n"),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [`Items from the meetings:\n${items.map((i) => `[${labels.get(i.id)}] ${i.kind}: ${i.text}`).join("\n")}`, `The BRD:\n${brdText.slice(0, 120_000)}`].join("\n\n"),
      },
    ],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) return null;
  return res.parsed_output.findings
    .map((f) => {
      const itemId = f.ref ? byLabel.get(f.ref.replace(/[[\]\s]/g, "")) ?? null : null;
      const item = itemId ? byId.get(itemId) : undefined;
      return {
        kind: f.kind,
        text: cleanStyle(f.text.trim()),
        brdLine: f.brdLine?.trim() || null,
        itemId,
        quote: item?.evidenceQuote ?? null,
        meetingId: item?.meetingId ?? null,
        at: item?.evidenceAt ?? null,
      } satisfies GapFinding;
    })
    .filter((f) => f.text);
}

export async function checkBrdGaps(brdText: string, items: BrdItem[]): Promise<{ findings: GapFinding[]; engine: Engine }> {
  const live = items.filter((i) => i.status !== "dropped" && i.kind !== "pain_point");
  if (aiEnabled() && live.length) {
    try {
      const findings = await claudeGap(brdText, live, itemLabels(live));
      if (findings) return { findings, engine: "claude" };
    } catch (err) {
      console.error("[orbit] brd gap check failed, using rules", err instanceof Error ? err.message : err);
    }
  }
  return { findings: rulesGap(brdText, items), engine: "rules" };
}

export { AI_MODEL as BRD_MODEL };
