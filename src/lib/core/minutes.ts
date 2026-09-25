import type { ActionItem, Client, DiscussionPoint, Meeting, MinutesBody } from "@/lib/db/schema";
import { formatDateLong } from "./dates";

/**
 * The one MOM layout every client gets, taken from the ADFH x Fero Maqta Pay minutes Saaqib approved.
 * Heading, date line, Meeting Objective, Discussion Points with a bold topic each, Action Points table.
 * The Word file in src/lib/docs/momDocx.ts and the text below render the same structure.
 */
export const STANDARD_MOM_FORMAT = [
  "Heading: <CLIENT CODE> × Fero | <meeting title>",
  "Date line: <24 September 2026>  |  <location, for example Microsoft Teams>",
  "Meeting Objective: one paragraph, one or two sentences, what the session was for.",
  "Discussion Points: six to twelve bullets in the order discussed. Each starts with a two or three word topic label in bold and a colon, for example Payment Scope, Settlement Model, Prerequisites, Invoice Generation, then two to four sentences of prose on what was explained, confirmed and agreed. Passive voice. Fero staff are never named in the prose; client and third party people may be named where it matters.",
  "Action Points: a table with three columns, #, Action, Owner. Owner is the person's full name, or the organisation such as Fero when no one person was named. No due column, a date agreed in the meeting goes inside the action text.",
  "Nothing else: no attendee list, no decisions section, no next steps, no sign off.",
].join("\n");

/** Everything the text and the Word file need. */
export type MinutesDoc = {
  clientCode: string;
  clientName: string;
  /** Page header, for example "OMS Project". */
  project: string;
  title: string;
  heldAt: Date;
  location: string | null;
  objective: string;
  points: DiscussionPoint[];
  actions: { text: string; owner: string | null }[];
};

export function momHeading(clientCode: string, title: string): string {
  return `${clientCode} × Fero | ${title}`;
}

export function momDateLine(heldAt: Date, location: string | null): string {
  const date = formatDateLong(heldAt);
  return location?.trim() ? `${date}  |  ${location.trim()}` : date;
}

/** "OMS Project" from "Operations Management System (OMS)", "DASH Project" from "DASH (Fero dispatch...)", else the client name. */
export function projectLabel(client: Pick<Client, "name" | "system">): string {
  const system = client.system?.trim() ?? "";
  const first = system.split(/[\s,(]+/)[0] ?? "";
  if (/^[A-Z][A-Z0-9]{1,5}$/.test(first)) return `${first} Project`;
  const paren = system.match(/\(([A-Z][A-Z0-9]{1,5})\)/);
  if (paren) return `${paren[1]} Project`;
  return client.name;
}

/** ADFH_Fero_OMSxMaqtaPay_MOM.docx */
export function momFileName(doc: Pick<MinutesDoc, "clientCode" | "title">): string {
  const words = doc.title
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1)));
  let slug = "";
  for (const w of words) {
    if ((slug + w).length > 40) break;
    slug += w;
  }
  return `${doc.clientCode}_Fero_${slug || "Meeting"}_MOM.docx`;
}

/** The plain text twin of the Word file: shown in Orbit, copied into emails, searched later. */
export function renderMinutesText(doc: MinutesDoc): string {
  const lines: string[] = [momHeading(doc.clientCode, doc.title), momDateLine(doc.heldAt, doc.location), ""];
  lines.push("Meeting Objective", doc.objective.trim(), "");
  lines.push("Discussion Points");
  for (const p of doc.points) lines.push(p.topic.trim() ? `• ${p.topic.trim()}: ${p.text.trim()}` : `• ${p.text.trim()}`);
  lines.push("", "Action Points");
  doc.actions.forEach((a, i) => lines.push(`${i + 1}. ${a.text.trim()}${a.owner?.trim() ? ` (${a.owner.trim()})` : ""}`));
  return lines.join("\n").trim();
}

const HEADING = /^(decisions?|discussion( points?)?|actions?( points?| items?)?|next steps?|attendees?|purpose|meeting objective|summary)\s*:?\s*$/i;
const BULLET = /^\s*(?:[•\-*]|\d+[.)])\s+/;
const TOPIC = /^([A-Z][A-Za-z0-9 /&]{1,40}):\s+(.+)$/;

/**
 * Minutes imported before the standard format have a first paragraph, a Decisions list and an Actions list.
 * This lifts objective and points out of that text so the Word file still works for them.
 */
export function legacyMinutes(mom: string): MinutesBody {
  const blocks = mom
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  let objective = "";
  const points: DiscussionPoint[] = [];
  let section = "";
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (HEADING.test(line)) {
        section = line.toLowerCase();
        continue;
      }
      if (section.startsWith("action") || section.startsWith("attendee")) continue;
      if (!objective && !section && !BULLET.test(line)) {
        objective = line;
        continue;
      }
      if (BULLET.test(line) || section) {
        const text = line.replace(BULLET, "");
        const m = text.match(TOPIC);
        points.push(m ? { topic: m[1], text: m[2] } : { topic: "", text });
      }
    }
  }
  return { objective, points };
}

/** Builds the document from a saved meeting, using the structured minutes when present. */
export function minutesDocFromMeeting(meeting: Meeting, client: Pick<Client, "code" | "name" | "system">): MinutesDoc {
  const body: MinutesBody = meeting.minutes ?? legacyMinutes(meeting.mom ?? "");
  const actions = (meeting.actionItems as ActionItem[]).map((a) => ({ text: a.text, owner: a.owner ?? null }));
  return {
    clientCode: client.code,
    clientName: client.name,
    project: projectLabel(client),
    title: meeting.title,
    heldAt: meeting.heldAt,
    location: meeting.location,
    objective: body.objective,
    points: body.points,
    actions,
  };
}
