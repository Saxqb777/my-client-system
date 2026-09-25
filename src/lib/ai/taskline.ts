import type { Client, TaskPriority } from "@/lib/db/schema";
import { extractDates, matchClient } from "@/lib/core/text";
import { todayISO } from "@/lib/core/dates";

export type TaskLine = {
  title: string;
  clientId: string | null;
  clientCode: string | null;
  dueDate: string | null;
  waitingOn: string | null;
  priority: TaskPriority;
};

const WAITING = /\b(?:waiting (?:on|for)|chase|chase up|follow up with|ask|remind|ping)\s+([A-Z][\w'.]*(?:\s+(?:al|bin|de|van|el)?\s?[A-Z][\w'.]*){0,2})/;

/**
 * Turns one typed line into a task without a network call.
 * "ADSO chase Mohamad for the AFSYS session Friday, high" becomes a task on ADSO, waiting on Mohamad, due Friday, high priority.
 */
export function parseTaskLine(raw: string, clients: Client[], today = todayISO()): TaskLine {
  let text = raw.trim().replace(/\s+/g, " ");

  let priority: TaskPriority = "normal";
  if (/\burgent\b|!!/.test(text)) priority = "urgent";
  else if (/\bhigh\b|!$/.test(text)) priority = "high";
  else if (/\blow\b/.test(text)) priority = "low";
  text = text.replace(/,?\s*\b(urgent|high|low)\b\s*$/i, "").replace(/\s*!+$/, "");

  const match = matchClient(text, clients);
  let clientId: string | null = null;
  let clientCode: string | null = null;
  if (match && match.confidence !== "low") {
    clientId = match.client.id;
    clientCode = match.client.code;
    // Drop the code or name when it leads the line, so the title reads clean.
    const lead = new RegExp(`^(?:${escape(match.client.code)}|${escape(match.client.name)})\\b[:,]?\\s*`, "i");
    text = text.replace(lead, "");
  }

  const dates = extractDates(text, today);
  let dueDate: string | null = null;
  if (dates.length) {
    const d = dates[dates.length - 1];
    dueDate = d.iso;
    text = (text.slice(0, d.index) + text.slice(d.index + d.raw.length)).replace(/\s+(by|on|for|due)\s*$/i, "").replace(/\s{2,}/g, " ").trim();
    text = text.replace(/\s+(by|on|due)\s*(,|$)/i, "$2").replace(/,\s*$/, "").trim();
  }

  let waitingOn: string | null = null;
  const w = WAITING.exec(text);
  if (w && /^waiting/i.test(w[0])) waitingOn = w[1].trim();

  const title = text.replace(/^[,:\s]+|[,:\s]+$/g, "");
  return { title: title ? title[0].toUpperCase() + title.slice(1) : raw.trim(), clientId, clientCode, dueDate, waitingOn, priority };
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
