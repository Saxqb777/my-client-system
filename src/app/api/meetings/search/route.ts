import { apiPrincipal, unauthorized } from "@/lib/auth/guard";
import { searchMeetings } from "@/lib/data/meetingLibrary";

export const runtime = "nodejs";

/** GET /api/meetings/search?q=...&client=<id>. Keyword search over transcripts and minutes. */
export async function GET(req: Request) {
  if (!(await apiPrincipal())) return unauthorized();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const client = url.searchParams.get("client");
  const hits = await searchMeetings(q, client || null);
  return Response.json({ hits });
}
