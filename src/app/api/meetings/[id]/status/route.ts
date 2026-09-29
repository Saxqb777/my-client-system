import { eq } from "drizzle-orm";
import { helperPrincipal, unauthorized } from "@/lib/auth/guard";
import { getDb } from "@/lib/db";
import { meetings } from "@/lib/db/schema";

export const runtime = "nodejs";

/** GET /api/meetings/[id]/status. What the helper polls until the meeting is processed or needs review. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await helperPrincipal())) return unauthorized();
  const { id } = await ctx.params;
  const db = await getDb();
  const row = await db.query.meetings.findFirst({
    where: eq(meetings.id, id),
    columns: { id: true, title: true, clientId: true, otherWork: true, processing: true, errorMessage: true, processedAt: true, matchConfidence: true },
  });
  if (!row) return Response.json({ error: "Meeting not found" }, { status: 404 });
  return Response.json(row, { headers: { "Cache-Control": "no-store" } });
}
