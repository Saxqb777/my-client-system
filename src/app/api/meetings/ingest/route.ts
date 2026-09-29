import { after } from "next/server";
import { helperPrincipal, unauthorized } from "@/lib/auth/guard";
import { getClientByCode } from "@/lib/data/clients";
import { countRecentIngests, createIngestedMeeting, INGEST_LIMITS, ingestBodySchema } from "@/lib/meetings/ingest";
import { processMeeting } from "@/lib/meetings/process";
import { zodMessage } from "@/actions/result";

export const runtime = "nodejs";
/** The response goes out at once; the minutes and notes run after it, inside this limit. */
export const maxDuration = 300;

/**
 * POST /api/meetings/ingest. Bearer ORBIT_INGEST_TOKEN. Body: see ingestBodySchema.
 * Idempotent on start minute plus opening words. Returns 202 with the meeting id, or 200 when it already exists.
 */
export async function POST(req: Request) {
  if (!(await helperPrincipal())) return unauthorized();

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > INGEST_LIMITS.maxBytes) return Response.json({ error: `Body over ${Math.round(INGEST_LIMITS.maxBytes / 1048576)} MB` }, { status: 413 });
  const raw = await req.text();
  if (raw.length > INGEST_LIMITS.maxBytes) return Response.json({ error: `Body over ${Math.round(INGEST_LIMITS.maxBytes / 1048576)} MB` }, { status: 413 });

  if ((await countRecentIngests(1)) >= INGEST_LIMITS.perHour) return Response.json({ error: "Too many meetings in the last hour, try again later" }, { status: 429 });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Body is not JSON" }, { status: 400 });
  }
  const parsed = ingestBodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: zodMessage(parsed.error.issues) }, { status: 400 });

  let clientId: string | null = null;
  if (parsed.data.clientCode) {
    const c = await getClientByCode(parsed.data.clientCode);
    clientId = c && !c.archivedAt ? c.id : null;
  }

  const { meeting, duplicate } = await createIngestedMeeting(parsed.data, clientId);
  if (!duplicate) after(() => processMeeting(meeting.id));
  return Response.json({ meetingId: meeting.id, status: duplicate ? "duplicate" : "received", processing: meeting.processing }, { status: duplicate ? 200 : 202 });
}
