import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { minutesDocFromMeeting, momDateLine, momFileName, momHeading } from "@/lib/core/minutes";
import type { MeetingDetails } from "@/lib/core/notes";
import { getMeetingFull } from "@/lib/data/meetingLibrary";
import { buildDetailsDocx, buildMomDocx } from "@/lib/docs/momDocx";

export const runtime = "nodejs";

const WORD = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** The minutes of one meeting as a Word file. `?sheet=details` returns the additional details sheet instead. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await apiPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  const meeting = await getMeetingFull(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });
  if (!meeting.mom && !meeting.minutes) return Response.json({ error: "No minutes yet. Add the transcript first." }, { status: 409 });

  const doc = minutesDocFromMeeting(meeting, meeting.client);
  const sheet = new URL(req.url).searchParams.get("sheet");
  if (sheet === "details") {
    const details = meeting.outputs.find((o) => o.kind === "details")?.data as MeetingDetails | undefined;
    if (!details) return Response.json({ error: "No details sheet for this meeting yet" }, { status: 409 });
    const file = await buildDetailsDocx({
      heading: momHeading(doc.clientCode, doc.title),
      dateLine: momDateLine(doc.heldAt, doc.location),
      project: doc.project,
      title: doc.title,
      attendeesFero: details.attendeesFero ?? [],
      attendeesClient: details.attendeesClient ?? [],
      agenda: details.agenda ?? [],
      decisions: details.decisions ?? [],
      openPoints: details.openPoints ?? [],
      nextMeeting: details.nextMeeting ?? null,
    });
    return new Response(new Uint8Array(file), { headers: { "Content-Type": WORD, "Content-Disposition": `attachment; filename="${momFileName(doc).replace("_MOM.docx", "_Details.docx")}"`, "Cache-Control": "private, no-store" } });
  }
  const file = await buildMomDocx(doc);
  return new Response(new Uint8Array(file), { headers: { "Content-Type": WORD, "Content-Disposition": `attachment; filename="${momFileName(doc)}"`, "Cache-Control": "private, no-store" } });
}
