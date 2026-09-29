import { after } from "next/server";
import { eq } from "drizzle-orm";
import { helperPrincipal, unauthorized } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { meetings } from "@/lib/db/schema";
import { processMeeting } from "@/lib/meetings/process";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/meetings/[id]/process. Runs the pipeline again: Retry in the app, or the helper when a meeting stalls. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await helperPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  const db = await getDb();
  const row = await db.query.meetings.findFirst({ where: eq(meetings.id, id), columns: { id: true, processing: true } });
  if (!row) return Response.json({ error: "Meeting not found" }, { status: 404 });
  if (row.processing === "processing") return Response.json({ meetingId: id, status: "processing" }, { status: 202 });
  after(() => processMeeting(id));
  return Response.json({ meetingId: id, status: "queued" }, { status: 202 });
}
