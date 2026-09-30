import type { BrdItemKind, DiscussionPoint, Evidence, TranscriptSegment } from "@/lib/db/schema";
import { similarity } from "@/lib/import/mapProject";
import { cleanStyle } from "@/lib/core/style";
import { splitSentences } from "./text";

/**
 * Requirements out of a meeting. The rule based reader below is the fallback and the test bed; Claude does the
 * same job with judgement (src/lib/ai/brd.ts). Both return the same shape and go through the same dedupe.
 */

export type ExtractedItem = { kind: BrdItemKind; text: string; group: string | null; evidence: Evidence | null };

export const ITEM_KINDS: Record<BrdItemKind, { label: string; plural: string }> = {
  requirement: { label: "Requirement", plural: "Requirements" },
  business_rule: { label: "Business rule", plural: "Business rules" },
  exception: { label: "Exception", plural: "Exceptions" },
  integration: { label: "Integration", plural: "Integrations" },
  pain_point: { label: "Pain point", plural: "Pain points" },
};

export const KIND_ORDER: BrdItemKind[] = ["requirement", "business_rule", "exception", "integration", "pain_point"];

/** Similarity above which two items say the same thing. */
export const ITEM_DUPLICATE = 0.7;
export const MAX_ITEMS_PER_MEETING = 40;

const PAIN = /\b(problem|issue|pain|manual(ly)?|takes too long|too slow|error prone|frustrat\w*|workaround|confus\w*|hard to|difficult|keeps asking|no way to|cannot see|do not know|will not match)\b/i;
const EXCEPTION = /\b(except|exception|unless|only when|only if|in case of|edge case|fallback|override|special case|continue(s)? even)\b/i;
const INTEGRATION = /\b(integrat\w*|api|interface|sync\w*|oracle|fusion|sap|erp|crm|maximo|epicor|webhook|payment gateway|maqta pay|telematics|smarttrace|feed from|post(ed|s)? to|pull(ed|s)? from|import(ed)? from|export(ed)? to)\b/i;
const RULE = /\b(must not|cannot|can't|not allowed|always|never|only one|maximum|minimum|at least|no more than|at most|threshold|rule|policy|per (day|week|month|tier|service|transaction|customer)|before (approval|release|payment)|after (approval|payment)|is blocked|are blocked)\b/i;
const REQUIREMENT = /\b(must|should|need(s)? to|required|has to|have to|is to be|are to be|will be able|want(s)? to|shall|be able to|configurable|option to|ability to|to be (added|recorded|tracked|visible|shown|carried|captured|available))\b/i;

export function classify(sentence: string): BrdItemKind | null {
  const words = sentence.split(/\s+/).length;
  if (words < 6 || words > 45) return null;
  if (/\?\s*$/.test(sentence)) return null;
  if (EXCEPTION.test(sentence)) return "exception";
  if (INTEGRATION.test(sentence) && (REQUIREMENT.test(sentence) || RULE.test(sentence) || /\b(through|via)\b/i.test(sentence))) return "integration";
  if (RULE.test(sentence)) return "business_rule";
  if (REQUIREMENT.test(sentence)) return "requirement";
  if (PAIN.test(sentence)) return "pain_point";
  return null;
}

/** The minutes topic a sentence belongs to, by shared words. */
export function groupFor(sentence: string, points: DiscussionPoint[]): string | null {
  let best: { topic: string; s: number } | null = null;
  for (const p of points) {
    if (!p.topic.trim()) continue;
    const s = Math.max(similarity(sentence, p.text), similarity(sentence, p.topic));
    if (s >= 0.34 && (!best || s > best.s)) best = { topic: p.topic.trim(), s };
  }
  return best?.topic ?? null;
}

/** Tidy a spoken sentence into a requirement line: no filler opening, capital first letter, Orbit's style. */
export function tidyLine(sentence: string): string {
  let t = sentence.replace(/^(?:(?:so|and|but|well|okay|ok|yes|right|please|also|then|from it|from finance)[,\s]+)+/i, "").trim();
  t = t.replace(/\s+/g, " ").replace(/[.]+$/, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return cleanStyle(t);
}

/** Rule based extraction from timed transcript lines. */
export function rulesExtract(segments: TranscriptSegment[], points: DiscussionPoint[] = []): ExtractedItem[] {
  const out: ExtractedItem[] = [];
  for (const seg of segments) {
    for (const sentence of splitSentences(seg.text)) {
      const kind = classify(sentence);
      if (!kind) continue;
      out.push({ kind, text: tidyLine(sentence), group: groupFor(sentence, points), evidence: { quote: sentence, at: seg.start } });
    }
  }
  return dedupeItems([], out).slice(0, MAX_ITEMS_PER_MEETING);
}

/** Rule based extraction from minutes text when a meeting has no transcript: the quote is the minutes line, no time. */
export function rulesExtractMinutes(points: DiscussionPoint[]): ExtractedItem[] {
  const out: ExtractedItem[] = [];
  for (const p of points) {
    for (const sentence of splitSentences(p.text)) {
      const kind = classify(sentence);
      if (!kind) continue;
      out.push({ kind, text: tidyLine(sentence), group: p.topic.trim() || null, evidence: { quote: sentence, at: null } });
    }
  }
  return dedupeItems([], out).slice(0, MAX_ITEMS_PER_MEETING);
}

/** Drops incoming items that repeat an existing one or each other. */
export function dedupeItems<T extends { text: string }>(existing: { text: string }[], incoming: T[]): T[] {
  const kept: T[] = [];
  for (const item of incoming) {
    if (existing.some((e) => similarity(e.text, item.text) >= ITEM_DUPLICATE)) continue;
    if (kept.some((k) => similarity(k.text, item.text) >= ITEM_DUPLICATE)) continue;
    kept.push(item);
  }
  return kept;
}
