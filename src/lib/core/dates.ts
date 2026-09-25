import {
  addDays,
  differenceInCalendarDays,
  formatDistanceToNowStrict,
  parseISO,
  startOfDay,
} from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import { TIMEZONE } from "./constants";

export type ISODate = string; // yyyy-MM-dd

/** Current wall clock in Dubai as a Date (do not use for storage). */
export function nowDubai(reference: Date = new Date()): Date {
  return toZonedTime(reference, TIMEZONE);
}

export function todayISO(reference: Date = new Date()): ISODate {
  return formatInTimeZone(reference, TIMEZONE, "yyyy-MM-dd");
}

export function toISODate(d: Date): ISODate {
  return formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
}

export function isValidISODate(value: string | null | undefined): value is ISODate {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseISO(value);
  return !Number.isNaN(d.getTime());
}

/** Whole days from today (Dubai) to the given date. Negative when in the past. */
export function daysUntil(date: ISODate, reference: Date = new Date()): number {
  const today = startOfDay(nowDubai(reference));
  return differenceInCalendarDays(parseISO(date), today);
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  return formatInTimeZone(addDays(parseISO(date), days), "UTC", "yyyy-MM-dd");
}

/** "15 Oct 2026" */
export function formatDate(date: ISODate | Date | null | undefined, withYear = true): string {
  if (!date) return "";
  const d = typeof date === "string" ? parseISO(date) : date;
  if (typeof date === "string") {
    return formatInTimeZone(d, "UTC", withYear ? "d MMM yyyy" : "d MMM");
  }
  return formatInTimeZone(d, TIMEZONE, withYear ? "d MMM yyyy" : "d MMM");
}

/** "Thu 24 Sep, 14:05" in Dubai time */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, "EEE d MMM, HH:mm");
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, "HH:mm");
}

export function formatDayHeading(date: Date | string, reference: Date = new Date()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const iso = toISODate(d);
  const diff = daysUntil(iso, reference);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return formatInTimeZone(d, TIMEZONE, "EEEE d MMM");
}

export function relativeTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

/** Human countdown label: "in 3 days", "today", "2 days overdue". */
export function countdownLabel(date: ISODate, reference: Date = new Date()): string {
  const n = daysUntil(date, reference);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "1 day overdue";
  if (n < 0) return `${Math.abs(n)} days overdue`;
  return `in ${n} days`;
}

/**
 * Delay between an original date and the current date, written the way the Friday table wants it.
 * Returns "" when there is no slip.
 */
export function delayText(original: ISODate, current: ISODate): string {
  const days = differenceInCalendarDays(parseISO(current), parseISO(original));
  if (days <= 0) return "";
  if (days < 7) return days === 1 ? "1 day" : `${days} days`;
  if (days < 56) {
    const weeks = Math.round(days / 7);
    return weeks === 1 ? "1 week" : `${weeks} weeks`;
  }
  const months = Math.round(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

/**
 * Reporting week: Friday 00:00 to Thursday 23:59 Dubai time.
 * The pack is generated Thursday evening for the Friday meeting.
 */
export function reportingWeek(reference: Date = new Date()): { start: ISODate; end: ISODate } {
  const local = startOfDay(nowDubai(reference));
  // date-fns getDay: 0 Sunday ... 5 Friday, 6 Saturday
  const day = local.getDay();
  const sinceFriday = (day - 5 + 7) % 7;
  const start = addDays(local, -sinceFriday);
  const end = addDays(start, 6);
  return { start: formatInTimeZone(start, "UTC", "yyyy-MM-dd"), end: formatInTimeZone(end, "UTC", "yyyy-MM-dd") };
}

/**
 * The week a Friday meeting reports on. On a Friday this is the week that ended yesterday,
 * so the pack you open on Friday morning still shows the right week.
 */
export function meetingWeek(reference: Date = new Date()): { start: ISODate; end: ISODate } {
  const local = startOfDay(nowDubai(reference));
  if (local.getDay() === 5) {
    return reportingWeek(addDays(reference, -1));
  }
  return reportingWeek(reference);
}

export function greeting(reference: Date = new Date()): string {
  const hour = Number(formatInTimeZone(reference, TIMEZONE, "H"));
  if (hour < 5) return "Late night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Current time in milliseconds. A named helper so server components can read the clock once per render. */
export function nowMs(): number {
  return Date.now();
}
