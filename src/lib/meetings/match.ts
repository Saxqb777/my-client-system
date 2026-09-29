import type { Client, Person, VocabularyTerm } from "@/lib/db/schema";

/**
 * Works out which client a meeting belongs to from three signals: the calendar title, the attendee
 * names against the client's people, and how often the client's own terms appear in the transcript.
 * Pure and deterministic, so it is tested. Claude only ever confirms, it never decides alone.
 */

export type MatchClient = Pick<Client, "id" | "code" | "name" | "aliases" | "system" | "fullName"> & { people: Pick<Person, "name" | "side">[] };
export type MatchInput = { calendarTitle?: string | null; attendees?: string[]; text: string };
export type MatchCandidate = { clientId: string; code: string; score: number; reasons: string[] };
export type MatchResult = { clientId: string | null; confidence: number; reason: string; candidates: MatchCandidate[] };

const GENERIC = new Set(["group", "llc", "free", "zone", "the", "and", "for", "of", "under", "system", "systems", "management", "by", "plus", "with", "project", "platform", "fero", "ai", "pjsc", "co", "company", "ltd", "dubai", "abu", "dhabi", "uae", "ports", "port"]);

/** Strong terms: code, name, aliases, full name words, system acronyms, product vocabulary. */
export function clientTerms(client: MatchClient, vocabulary: Pick<VocabularyTerm, "term" | "clientId" | "type">[] = []): string[] {
  const out = new Set<string>();
  out.add(client.code);
  for (const raw of [client.name, ...(client.aliases ?? []), client.fullName ?? ""]) {
    const t = raw.trim();
    if (!t) continue;
    out.add(t);
    for (const w of t.split(/[\s,()]+/)) {
      if (w.length >= 3 && !GENERIC.has(w.toLowerCase()) && !/^\d+$/.test(w)) out.add(w);
    }
  }
  const system = client.system ?? "";
  for (const m of system.matchAll(/\(([A-Z][A-Z0-9]{1,6})\)/g)) out.add(m[1]);
  const first = system.split(/[\s,(]+/)[0];
  if (first && /^[A-Z][A-Z0-9]{1,6}$/.test(first)) out.add(first);
  for (const v of vocabulary) if (v.clientId === client.id && (v.type === "client" || v.type === "product")) out.add(v.term);
  return Array.from(out).filter((t) => t.length >= 3);
}

function countMentions(text: string, term: string): number {
  const short = term.length <= 4 && term === term.toUpperCase();
  const re = new RegExp(`(^|[^A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^A-Za-z0-9])`, short ? "g" : "gi");
  return (text.match(re) ?? []).length;
}

function nameMatches(attendee: string, person: string): boolean {
  const a = attendee.toLowerCase().replace(/[^a-z ]/g, " ").trim();
  const p = person.toLowerCase().replace(/[^a-z ]/g, " ").trim();
  if (!a || !p) return false;
  if (a === p || a.includes(p) || p.includes(a)) return true;
  const ap = a.split(/\s+/);
  const pp = p.split(/\s+/);
  // first name and last name both present, in any order
  return ap.length >= 2 && pp.length >= 2 && ap.includes(pp[0]) && ap.includes(pp[pp.length - 1]);
}

export function matchClient(input: MatchInput, clients: MatchClient[], vocabulary: Pick<VocabularyTerm, "term" | "clientId" | "type">[] = []): MatchResult {
  const title = input.calendarTitle?.trim() ?? "";
  const attendees = input.attendees ?? [];
  const text = input.text;
  const candidates: MatchCandidate[] = [];

  for (const c of clients) {
    const terms = clientTerms(c, vocabulary);
    const reasons: string[] = [];
    let score = 0;

    const titleHits = terms.filter((t) => countMentions(title, t) > 0);
    if (titleHits.length) {
      score += 0.6;
      reasons.push(`Title mentions ${titleHits[0]}`);
    }

    const clientPeople = c.people.filter((p) => p.side !== "internal");
    const matched = attendees.filter((a) => clientPeople.some((p) => nameMatches(a, p.name)));
    if (matched.length) {
      score += Math.min(0.5, 0.2 * matched.length);
      reasons.push(`${matched.length} ${matched.length === 1 ? "attendee is" : "attendees are"} ${c.code} people: ${matched.slice(0, 3).join(", ")}`);
    }

    let mentions = 0;
    for (const t of terms) mentions += countMentions(text, t);
    for (const p of clientPeople) {
      const last = p.name.trim().split(/\s+/).pop() ?? "";
      if (last.length >= 4) mentions += Math.min(3, countMentions(text, last));
    }
    if (mentions) {
      score += Math.min(0.4, 0.08 * mentions);
      reasons.push(`${mentions} ${mentions === 1 ? "mention" : "mentions"} of ${c.code} terms in the transcript`);
    }

    if (score > 0) candidates.push({ clientId: c.id, code: c.code, score: Math.min(1, Number(score.toFixed(2))), reasons });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 0.3) {
    return { clientId: null, confidence: best?.score ?? 0, reason: best ? `Only a weak signal for ${best.code}: ${best.reasons.join(". ")}` : "No client name, person or term found", candidates };
  }
  let confidence = best.score;
  let reason = best.reasons.join(". ");
  if (second && best.score - second.score < 0.2) {
    confidence = Math.min(confidence, 0.6);
    reason = `Could be ${best.code} or ${second.code}. ${reason}`;
  }
  return { clientId: best.clientId, confidence: Number(confidence.toFixed(2)), reason, candidates };
}

/** The bar for linking without asking. Below it the meeting waits in Needs review. */
export const AUTO_LINK_CONFIDENCE = 0.8;
