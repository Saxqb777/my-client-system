import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { clients, meetingOutputs, meetings, type Client, type Meeting, type MeetingOutput, type MeetingProcessing, type MeetingTranscript } from "@/lib/db/schema";

export type LibraryMeeting = Meeting & { client: Client | null };
export type MeetingFull = Meeting & { client: Client | null; transcript: MeetingTranscript | null; outputs: MeetingOutput[] };

/** The library list: newest first, filter by client, Other Work, or processing state. */
export async function listLibrary(opts: { clientId?: string; otherWork?: boolean; processing?: MeetingProcessing[]; limit?: number } = {}): Promise<LibraryMeeting[]> {
  const db = await getDb();
  const filters: SQL[] = [];
  if (opts.clientId) filters.push(eq(meetings.clientId, opts.clientId));
  if (opts.otherWork) filters.push(eq(meetings.otherWork, true));
  if (opts.processing?.length) filters.push(inArray(meetings.processing, opts.processing));
  const rows = await db.query.meetings.findMany({
    where: filters.length ? and(...filters) : undefined,
    with: { client: true },
    orderBy: [desc(meetings.heldAt)],
    limit: opts.limit ?? 300,
  });
  return rows as LibraryMeeting[];
}

export async function getMeetingFull(id: string): Promise<MeetingFull | null> {
  const db = await getDb();
  const row = await db.query.meetings.findFirst({ where: eq(meetings.id, id), with: { client: true, transcript: true, outputs: true } });
  return (row as MeetingFull | undefined) ?? null;
}

export async function countProcessing(): Promise<Record<MeetingProcessing, number>> {
  const db = await getDb();
  const rows = await db.select({ processing: meetings.processing, n: sql<number>`count(*)::int` }).from(meetings).groupBy(meetings.processing);
  const out: Record<MeetingProcessing, number> = { received: 0, processing: 0, processed: 0, needs_review: 0, failed: 0 };
  for (const r of rows) if (r.processing) out[r.processing] = r.n;
  return out;
}

export type SearchHit = { meetingId: string; title: string; heldAt: Date; clientId: string | null; clientCode: string | null; clientName: string | null; rank: number; snippet: string; where: "transcript" | "minutes" };

/** Keyword search over transcripts and saved minutes. One hit per meeting, best rank first. */
export async function searchMeetings(q: string, clientId?: string | null, limit = 30): Promise<SearchHit[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  const db = await getDb();
  const clientFilter = clientId ? sql`and m.client_id = ${clientId}` : sql``;
  const transcriptHits = (await db.execute(sql`
    select m.id as meeting_id, m.title, m.held_at, m.client_id, c.code as client_code, c.name as client_name,
      ts_rank(t.search_vector, plainto_tsquery('english', ${query})) as rank,
      ts_headline('english', t.full_text, plainto_tsquery('english', ${query}), 'MaxFragments=2, MaxWords=18, MinWords=8, StartSel=<<, StopSel=>>') as snippet
    from meeting_transcripts t
    join meetings m on m.id = t.meeting_id
    left join clients c on c.id = m.client_id
    where t.search_vector @@ plainto_tsquery('english', ${query}) ${clientFilter}
    order by rank desc limit ${limit}`)) as { rows: Record<string, unknown>[] };
  const minutesHits = (await db.execute(sql`
    select m.id as meeting_id, m.title, m.held_at, m.client_id, c.code as client_code, c.name as client_name,
      ts_rank(d.search_vector, plainto_tsquery('english', ${query})) as rank,
      ts_headline('english', d.content, plainto_tsquery('english', ${query}), 'MaxFragments=2, MaxWords=18, MinWords=8, StartSel=<<, StopSel=>>') as snippet
    from documents d
    join meetings m on m.id = d.meeting_id
    left join clients c on c.id = m.client_id
    where d.type = 'mom' and d.search_vector @@ plainto_tsquery('english', ${query}) ${clientFilter}
    order by rank desc limit ${limit}`)) as { rows: Record<string, unknown>[] };

  const byMeeting = new Map<string, SearchHit>();
  const add = (r: Record<string, unknown>, where: SearchHit["where"]) => {
    const hit: SearchHit = {
      meetingId: String(r.meeting_id),
      title: String(r.title),
      heldAt: new Date(String(r.held_at)),
      clientId: (r.client_id as string | null) ?? null,
      clientCode: (r.client_code as string | null) ?? null,
      clientName: (r.client_name as string | null) ?? null,
      rank: Number(r.rank),
      snippet: String(r.snippet ?? ""),
      where,
    };
    const prev = byMeeting.get(hit.meetingId);
    if (!prev || prev.rank < hit.rank) byMeeting.set(hit.meetingId, hit);
  };
  for (const r of minutesHits.rows) add(r, "minutes");
  for (const r of transcriptHits.rows) add(r, "transcript");
  return Array.from(byMeeting.values()).sort((a, b) => b.rank - a.rank).slice(0, limit);
}

/** Text Ask Orbit reads for a meeting: the notes when present, else the minutes. */
export async function meetingContext(ids: string[]): Promise<{ meetingId: string; title: string; heldAt: Date; clientCode: string | null; text: string }[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const rows = await db.query.meetings.findMany({ where: inArray(meetings.id, ids), with: { client: true, outputs: true } });
  return rows.map((m) => {
    const notes = m.outputs.find((o: MeetingOutput) => o.kind === "notes")?.text ?? "";
    const text = [m.mom ?? "", notes].filter(Boolean).join("\n\n").slice(0, 7000);
    return { meetingId: m.id, title: m.title, heldAt: m.heldAt, clientCode: (m.client as Client | null)?.code ?? null, text };
  });
}

/** Latest minuted meetings, used when a question has no keyword hits. */
export async function latestMinuted(clientId: string | null, limit = 4): Promise<string[]> {
  const db = await getDb();
  const rows = await db.query.meetings.findMany({
    where: and(eq(meetings.status, "minuted"), clientId ? eq(meetings.clientId, clientId) : undefined),
    orderBy: [desc(meetings.heldAt)],
    limit,
    columns: { id: true },
  });
  return rows.map((r) => r.id);
}

export const _unused = { clients, meetingOutputs, isNull };
