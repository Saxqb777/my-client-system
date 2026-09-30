import { format, parseISO } from "date-fns";
import { addDaysISO, type ISODate } from "./dates";

/**
 * Layout maths for the journey rail: one horizontal time axis per client (or one shared axis for the
 * tracker) with milestones placed by date. Pure functions so the placement can be tested.
 */

export type JourneyDomain = { start: ISODate; end: ISODate; days: number };

const DAY = 86_400_000;

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}

/** The axis: a little before the first date (or today), a little after the last, never shorter than minDays. */
export function journeyDomain(dates: ISODate[], today: ISODate, opts: { padBefore?: number; padAfter?: number; minDays?: number } = {}): JourneyDomain {
  const padBefore = opts.padBefore ?? 7;
  const padAfter = opts.padAfter ?? 14;
  const minDays = opts.minDays ?? 45;
  const all = [...dates, today].sort();
  let start = addDaysISO(all[0], -padBefore);
  let end = addDaysISO(all[all.length - 1], padAfter);
  if (daysBetween(start, end) < minDays) {
    const extra = minDays - daysBetween(start, end);
    end = addDaysISO(end, Math.ceil(extra / 2));
    start = addDaysISO(start, -Math.floor(extra / 2));
  }
  return { start, end, days: daysBetween(start, end) };
}

/** 0 at the start of the axis, 1 at the end. */
export function fractionFor(date: ISODate, domain: JourneyDomain): number {
  if (domain.days <= 0) return 0;
  return Math.min(1, Math.max(0, daysBetween(domain.start, date) / domain.days));
}

/** The date under a point on the axis, rounded to the day. */
export function dateAt(fraction: number, domain: JourneyDomain): ISODate {
  const f = Math.min(1, Math.max(0, fraction));
  return addDaysISO(domain.start, Math.round(f * domain.days));
}

export type Lane = 0 | 1;
export type Anchor = "center" | "start" | "end";
export type Placed<T> = { item: T; fraction: number; px: number; lane: Lane; anchor: Anchor; compact: boolean; hidden: boolean };

export type Interval = [number, number];

function fits(iv: Interval, taken: Interval[], gap: number, width: number): boolean {
  if (iv[0] < 0 || iv[1] > width) return false;
  return taken.every(([a, b]) => iv[1] + gap <= a || iv[0] >= b + gap);
}

/**
 * Places milestones along an axis of `width` pixels. Marks that would sit on top of each other are
 * nudged apart to the right. Each label then looks for room: centred on its mark, hanging to the right,
 * hanging to the left, in the lane above the rail or the lane below; failing that it shrinks to the date
 * alone, and failing that it hides and the mark speaks for itself (hover still shows everything).
 */
export function layoutJourney<T extends { date: ISODate; title: string }>(
  items: T[],
  domain: JourneyDomain,
  width: number,
  opts: { minGap?: number; labelWidth?: (title: string) => number; dateWidth?: number; labelGap?: number; hang?: number; reserved?: { lane: Lane; iv: Interval }[] } = {},
): Placed<T>[] {
  const minGap = opts.minGap ?? 16;
  const labelGap = opts.labelGap ?? 6;
  const hang = opts.hang ?? 10;
  const dateWidth = opts.dateWidth ?? 44;
  const labelWidth = opts.labelWidth ?? ((title: string) => Math.max(dateWidth, Math.min(120, title.length * 6.4 + 4)));
  const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
  const out: Placed<T>[] = [];
  // Space already used by something else on the rail, such as the Today label, is off limits for labels.
  const taken: [Interval[], Interval[]] = [[], []];
  for (const r of opts.reserved ?? []) taken[r.lane].push(r.iv);
  let lastPx = -Infinity;
  for (const item of sorted) {
    const fraction = fractionFor(item.date, domain);
    let px = fraction * width;
    if (px - lastPx < minGap) px = lastPx + minGap;
    lastPx = px;
    const full = labelWidth(item.title);
    const candidates: { anchor: Anchor; lane: Lane; compact: boolean; iv: Interval }[] = [];
    for (const compact of [false, true]) {
      const w = compact ? dateWidth : full;
      for (const anchor of ["center", "start", "end"] as Anchor[]) {
        const iv: Interval = anchor === "center" ? [px - w / 2, px + w / 2] : anchor === "start" ? [px + hang, px + hang + w] : [px - hang - w, px - hang];
        for (const lane of [0, 1] as Lane[]) candidates.push({ anchor, lane, compact, iv });
      }
    }
    const pick = candidates.find((c) => fits(c.iv, taken[c.lane], labelGap, width));
    if (pick) {
      taken[pick.lane].push(pick.iv);
      out.push({ item, fraction, px, lane: pick.lane, anchor: pick.anchor, compact: pick.compact, hidden: false });
    } else {
      out.push({ item, fraction, px, lane: 0, anchor: "center", compact: true, hidden: true });
    }
  }
  return out;
}

/** The first day of every month inside the axis, for the header ticks. */
export function monthTicks(domain: JourneyDomain): { date: ISODate; label: string; fraction: number }[] {
  const out: { date: ISODate; label: string; fraction: number }[] = [];
  const first = parseISO(domain.start);
  const cursor = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));
  const endMs = Date.parse(domain.end);
  while (cursor.getTime() <= endMs) {
    const iso = cursor.toISOString().slice(0, 10);
    out.push({ date: iso, label: format(parseISO(iso), cursor.getUTCMonth() === 0 ? "MMM yyyy" : "MMM"), fraction: fractionFor(iso, domain) });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}
