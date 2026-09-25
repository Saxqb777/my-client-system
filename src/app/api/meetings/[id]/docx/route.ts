import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { minutesDocFromMeeting, momFileName } from "@/lib/core/minutes";
import { getMeeting } from "@/lib/data/meetings";
import { buildMomDocx } from "@/lib/docs/momDocx";

export const runtime = "nodejs";

/** The minutes of one meeting as a Word file in the standard MOM layout. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await apiPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  const meeting = await getMeeting(id);
  if (!meeting) return Response.json({ error: "Meeting not found" }, { status: 404 });
  if (!meeting.mom && !meeting.minutes) return Response.json({ error: "No minutes yet. Add the transcript first." }, { status: 409 });

  const doc = minutesDocFromMeeting(meeting, meeting.client);
  const file = await buildMomDocx(doc);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${momFileName(doc)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
