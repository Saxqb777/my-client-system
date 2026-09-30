import type { BrdItem, GapFinding } from "@/lib/db/schema";
import { similarity } from "@/lib/import/mapProject";
import { numbersIn, splitSentences, vagueReasons } from "./text";

/**
 * Gap check: an existing BRD against what the client said in meetings. Rule based version: an item is missing when
 * no BRD sentence shares half its words; a sentence contradicts an item when it matches it but the numbers differ;
 * a sentence is vague when it uses open wording. Claude does the judgement version (src/lib/ai/brd.ts).
 */

export const COVERED = 0.5;

export function bestMatch(text: string, sentences: string[]): { sentence: string; score: number } | null {
  let best: { sentence: string; score: number } | null = null;
  for (const s of sentences) {
    const score = similarity(text, s);
    if (score > (best?.score ?? 0)) best = { sentence: s, score };
  }
  return best;
}

export function rulesGap(brdText: string, items: BrdItem[]): GapFinding[] {
  const sentences = splitSentences(brdText);
  const out: GapFinding[] = [];
  for (const item of items) {
    if (item.status === "dropped" || item.kind === "pain_point") continue;
    const best = bestMatch(item.text, sentences);
    const source = { itemId: item.id, quote: item.evidenceQuote, meetingId: item.meetingId, at: item.evidenceAt };
    if (!best || best.score < COVERED) {
      out.push({ kind: "missing", text: item.text, brdLine: null, ...source });
      continue;
    }
    const a = numbersIn(item.text);
    const b = numbersIn(best.sentence);
    if (a.length && b.length && !a.some((n) => b.includes(n))) {
      out.push({ kind: "contradiction", text: `The BRD says "${best.sentence}" but the meetings say "${item.text}"`, brdLine: best.sentence, ...source });
    }
  }
  for (const s of sentences) {
    const reasons = vagueReasons(s);
    if (reasons.length) out.push({ kind: "vague", text: `Needs a measure or a name: ${reasons.join(", ")}`, brdLine: s, itemId: null, quote: null, meetingId: null, at: null });
  }
  return out;
}

/** Items the checked BRD covers: live, not pain points, and not reported missing. */
export function coveredItemIds(findings: GapFinding[], items: BrdItem[]): string[] {
  const missing = new Set(findings.filter((f) => f.kind === "missing" && f.itemId).map((f) => f.itemId!));
  return items.filter((i) => i.status === "open" && i.kind !== "pain_point" && !missing.has(i.id)).map((i) => i.id);
}

export const GAP_KINDS: Record<GapFinding["kind"], { label: string; hint: string }> = {
  missing: { label: "Discussed, not in the BRD", hint: "The client said it in a meeting and the document does not cover it." },
  contradiction: { label: "Contradicts the meetings", hint: "The document says one thing, the client said another." },
  vague: { label: "Needs clarity", hint: "Wording a developer or tester cannot act on as written." },
};
