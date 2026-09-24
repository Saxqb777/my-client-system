import type { Client } from "@/lib/db/schema";

export type ClientMatch = {
  client: Client;
  score: number;
  confidence: "high" | "medium" | "low";
};

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(text: string, word: string): boolean {
  if (!word || word.length < 2) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(word.toLowerCase())}([^a-z0-9]|$)`, "i").test(text);
}

/**
 * Finds the client a free text update is about. Codes win, then aliases, then name words.
 */
export function matchClient(text: string, clients: Client[]): ClientMatch | null {
  const lower = text.toLowerCase();
  let best: ClientMatch | null = null;

  for (const client of clients) {
    if (client.archivedAt) continue;
    let score = 0;
    if (hasWord(lower, client.code)) score += 6;
    if (hasWord(lower, client.name)) score += 5;
    for (const alias of client.aliases ?? []) {
      if (hasWord(lower, alias)) score += 4;
    }
    if (client.fullName && hasWord(lower, client.fullName)) score += 4;
    const nameWords = client.name.split(/\s+/).filter((w) => w.length > 2);
    for (const w of nameWords) {
      if (hasWord(lower, w)) score += 1.5;
    }
    if (score > (best?.score ?? 0)) {
      best = { client, score, confidence: score >= 5 ? "high" : score >= 3 ? "medium" : "low" };
    }
  }
  return best;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
  jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
  oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function iso(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

export type FoundDate = { iso: string; raw: string; index: number };

/**
 * Pulls dates out of free text. Understands 15 Oct, 15 October 2026, Oct 15, 15/10, 15/10/2026,
 * 2026-10-15, today, tomorrow, next Monday, end of month. Years default to the nearest upcoming.
 */
export function extractDates(text: string, todayISO: string): FoundDate[] {
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const today = new Date(Date.UTC(ty, tm - 1, td));
  const found: FoundDate[] = [];
  const push = (isoDate: string, raw: string, index: number) => {
    if (!found.some((f) => f.index === index)) found.push({ iso: isoDate, raw, index });
  };
  const nearestYear = (m: number, d: number) => {
    const candidate = new Date(Date.UTC(ty, m, d));
    const diff = (candidate.getTime() - today.getTime()) / 86400000;
    if (diff < -120) return ty + 1;
    return ty;
  };

  let m: RegExpExecArray | null;

  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g;
  while ((m = isoRe.exec(text))) push(m[0], m[0], m.index);

  const dmyRe = /\b(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\b/g;
  while ((m = dmyRe.exec(text))) {
    const d = Number(m[1]);
    const mo = Number(m[2]) - 1;
    if (mo < 0 || mo > 11 || d < 1 || d > 31) continue;
    let y = m[3] ? Number(m[3]) : nearestYear(mo, d);
    if (y < 100) y += 2000;
    push(iso(y, mo, d), m[0], m.index);
  }

  const dayMonthRe = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b(?:\s+(\d{4}))?/gi;
  while ((m = dayMonthRe.exec(text))) {
    const d = Number(m[1]);
    const mo = MONTHS[m[2].toLowerCase()];
    const y = m[3] ? Number(m[3]) : nearestYear(mo, d);
    if (d >= 1 && d <= 31) push(iso(y, mo, d), m[0], m.index);
  }

  const monthDayRe = /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(\d{4}))?/gi;
  while ((m = monthDayRe.exec(text))) {
    const mo = MONTHS[m[1].toLowerCase()];
    const d = Number(m[2]);
    const y = m[3] ? Number(m[3]) : nearestYear(mo, d);
    if (d >= 1 && d <= 31) push(iso(y, mo, d), m[0], m.index);
  }

  const relRe = /\b(today|tomorrow|day after tomorrow|end of (?:this )?month|end of (?:this )?week|next week|(?:next|this|coming)\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat))\b/gi;
  while ((m = relRe.exec(text))) {
    const raw = m[0].toLowerCase();
    const d = new Date(today.getTime());
    if (raw === "today") {
      // no change
    } else if (raw === "tomorrow") {
      d.setUTCDate(d.getUTCDate() + 1);
    } else if (raw === "day after tomorrow") {
      d.setUTCDate(d.getUTCDate() + 2);
    } else if (raw.startsWith("end of") && raw.endsWith("month")) {
      d.setUTCMonth(d.getUTCMonth() + 1, 0);
    } else if (raw.startsWith("end of") && raw.endsWith("week")) {
      // UAE work week ends Friday
      const delta = (5 - d.getUTCDay() + 7) % 7;
      d.setUTCDate(d.getUTCDate() + delta);
    } else if (raw === "next week") {
      const delta = ((1 - d.getUTCDay() + 7) % 7) || 7;
      d.setUTCDate(d.getUTCDate() + delta);
    } else if (m[2]) {
      const target = WEEKDAYS[m[2].toLowerCase()];
      let delta = (target - d.getUTCDay() + 7) % 7;
      if (delta === 0 || raw.startsWith("next")) delta = delta === 0 ? 7 : delta;
      if (raw.startsWith("next") && delta < 7) {
        // "next Monday" spoken on a Thursday usually means the coming Monday
      }
      d.setUTCDate(d.getUTCDate() + delta);
    }
    push(iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()), m[0], m.index);
  }

  return found.sort((a, b) => a.index - b.index);
}

export function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
