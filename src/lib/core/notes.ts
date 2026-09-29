import { clock } from "@/lib/meetings/transcript";

/**
 * Understanding notes: what Saaqib needs to know after a meeting, clearer than the transcript.
 * Every important point carries the second in the transcript it came from.
 */
export type Stamped = { text: string; at: number | null };
export type Concern = { text: string; raisedBy: string | null; at: number | null };

export type UnderstandingNotes = {
  about: string[];
  wantsStated: string[];
  wantsImplied: string[];
  changedSinceLast: string[];
  concerns: Concern[];
  unclear: Stamped[];
  askNextTime: string[];
  askedOfMe: Stamped[];
  jargon: { term: string; meaning: string }[];
};

export type MeetingDetails = {
  attendeesFero: string[];
  attendeesClient: string[];
  agenda: string[];
  decisions: string[];
  openPoints: string[];
  nextMeeting: string | null;
};

const at = (t: number | null) => (t === null ? "" : ` [${clock(t)}]`);

export function renderNotesText(n: UnderstandingNotes): string {
  const out: string[] = [];
  const section = (title: string, lines: string[]) => {
    if (!lines.length) return;
    out.push(title, ...lines.map((l) => `• ${l}`), "");
  };
  section("What this meeting was really about", n.about);
  section("What the client wants, stated", n.wantsStated);
  section("What the client wants, implied", n.wantsImplied);
  section("What changed since the last meeting", n.changedSinceLast);
  section(
    "Risks, delays and concerns",
    n.concerns.map((c) => `${c.text}${c.raisedBy ? ` (${c.raisedBy})` : ""}${at(c.at)}`),
  );
  section("Unclear, contradicted or left hanging", n.unclear.map((u) => `${u.text}${at(u.at)}`));
  section("Asked of me", n.askedOfMe.map((u) => `${u.text}${at(u.at)}`));
  section("Questions to ask next time", n.askNextTime);
  section("Terms explained", n.jargon.map((j) => `${j.term}: ${j.meaning}`));
  return out.join("\n").trim();
}

export function renderDetailsText(d: MeetingDetails, heading: string, dateLine: string): string {
  const out: string[] = [heading, dateLine, ""];
  out.push("Attendees", `Fero: ${d.attendeesFero.join(", ") || "none listed"}`, `Client: ${d.attendeesClient.join(", ") || "none listed"}`, "");
  if (d.agenda.length) out.push("Agenda", ...d.agenda.map((a, i) => `${i + 1}. ${a}`), "");
  if (d.decisions.length) out.push("Decisions", ...d.decisions.map((x, i) => `${i + 1}. ${x}`), "");
  if (d.openPoints.length) out.push("Open points", ...d.openPoints.map((x) => `• ${x}`), "");
  out.push("Next meeting", d.nextMeeting ?? "Not set");
  return out.join("\n").trim();
}

export const EMPTY_NOTES: UnderstandingNotes = { about: [], wantsStated: [], wantsImplied: [], changedSinceLast: [], concerns: [], unclear: [], askNextTime: [], askedOfMe: [], jargon: [] };
