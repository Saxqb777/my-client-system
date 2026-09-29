import type { Evidence } from "@/lib/db/schema";
import { parseClock } from "./transcript";

/**
 * The evidence rule. Orbit changes a client by itself only when Claude points at the words in the transcript
 * that justify it: a quote of at least four words that really appears in the transcript, and the second it was
 * said at. Anything weaker waits for Saaqib on the Review tab.
 */

export const MIN_QUOTE_WORDS = 4;

/** "12:34", "1:02:03" or a bare number of seconds. Null when unreadable. */
export function clockToSeconds(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const trimmed = value.trim().replace(/^\[|\]$/g, "");
  if (!trimmed) return null;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return parseClock(trimmed);
}

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when the quote appears in the transcript. Punctuation, case and spacing are ignored. A long quote that
 * Claude trimmed or tidied still counts when a run of six of its words appears in order.
 */
export function quoteInTranscript(quote: string, transcript: string): boolean {
  const q = normalizeWords(quote);
  if (q.length < MIN_QUOTE_WORDS) return false;
  const hay = ` ${normalizeWords(transcript).join(" ")} `;
  if (hay.includes(` ${q.join(" ")} `)) return true;
  const window = Math.min(6, q.length);
  if (window < MIN_QUOTE_WORDS) return false;
  for (let i = 0; i + window <= q.length; i++) {
    if (hay.includes(` ${q.slice(i, i + window).join(" ")} `)) return true;
  }
  return false;
}

/** Turns what Claude returned into the stored shape: seconds instead of a clock string. */
export function toEvidence(raw: { quote?: string | null; at?: string | number | null } | null | undefined): Evidence | null {
  if (!raw) return null;
  const quote = (raw.quote ?? "").trim();
  if (!quote) return null;
  return { quote, at: clockToSeconds(raw.at ?? null) };
}

/** The rule itself: a real quote, found in the transcript, with a timestamp. */
export function evidenceIsClear(ev: Evidence | null | undefined, transcript: string): ev is Evidence {
  if (!ev) return false;
  if (ev.at === null || ev.at === undefined || !Number.isFinite(ev.at)) return false;
  return quoteInTranscript(ev.quote, transcript);
}

/** Why a proposed change was held for review, in Saaqib's words. */
export function evidenceGap(ev: Evidence | null | undefined, transcript: string): string {
  if (!ev || !ev.quote.trim()) return "no quote from the transcript";
  if (normalizeWords(ev.quote).length < MIN_QUOTE_WORDS) return "quote too short to check";
  if (ev.at === null || ev.at === undefined) return "no timestamp";
  if (!quoteInTranscript(ev.quote, transcript)) return "quote not found in the transcript";
  return "";
}
