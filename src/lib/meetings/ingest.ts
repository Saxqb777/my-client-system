import { createHash } from "node:crypto";
import { z } from "zod";
import { and, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { meetings, meetingTranscripts, type Meeting, type TranscriptSegment } from "@/lib/db/schema";
import { formatDate } from "@/lib/core/dates";
import { parseTranscriptText, type ParsedTranscript } from "./transcript";

/** What the Mac helper (or a manual upload) sends. Either timed segments or the flat text, both is best. */
export const ingestBodySchema = z
  .object({
    source: z.enum(["mac_helper", "upload"]).default("mac_helper"),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }).nullable().optional(),
    calendarTitle: z.string().trim().max(300).nullable().optional(),
    title: z.string().trim().max(300).nullable().optional(),
    attendees: z.array(z.string().trim().min(1).max(120)).max(100).default([]),
    language: z.string().trim().max(10).default("en"),
    segments: z
      .array(z.object({ start: z.number().min(0), end: z.number().min(0), speaker: z.string().trim().max(80).default("other"), text: z.string().max(5000) }))
      .max(20000)
      .default([]),
    fullText: z.string().max(2_000_000).optional(),
    /** Set when the sender already knows the client. Skips matching. */
    clientCode: z.string().trim().max(16).nullable().optional(),
  })
  .refine((b) => b.segments.length > 0 || (b.fullText ?? "").trim().length >= 40, { message: "Send segments or at least a few lines of fullText" });

export type IngestBody = z.infer<typeof ingestBodySchema>;

/** Same start minute plus the same opening words means the same meeting, however many times it is sent. */
export function ingestHash(startedAt: string, opening: string): string {
  const minute = new Date(startedAt).toISOString().slice(0, 16);
  const words = opening.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return createHash("sha256").update(`${minute}|${words}`).digest("hex");
}

export function transcriptFromBody(body: IngestBody): ParsedTranscript {
  if (body.segments.length) {
    const segments: TranscriptSegment[] = body.segments.map((s) => ({ start: s.start, end: Math.max(s.end, s.start), speaker: s.speaker || "other", text: s.text.trim() })).filter((s) => s.text);
    const fullText = segments.map((s) => s.text).join("\n");
    return { segments, fullText, wordCount: fullText.split(/\s+/).filter(Boolean).length, durationSec: segments.length ? Math.max(...segments.map((s) => s.end)) : 0 };
  }
  return parseTranscriptText(body.fullText ?? "");
}

export type IngestResult = { meeting: Meeting; duplicate: boolean };

/** Saves the meeting and its transcript. Returns the existing row when the hash already exists. */
export async function createIngestedMeeting(body: IngestBody, clientId: string | null, opts: { otherWork?: boolean } = {}): Promise<IngestResult> {
  const db = await getDb();
  const parsed = transcriptFromBody(body);
  const opening = parsed.segments[0]?.text ?? parsed.fullText;
  const hash = ingestHash(body.startedAt, opening);
  const existing = await db.query.meetings.findFirst({ where: (m, { eq }) => eq(m.ingestHash, hash) });
  if (existing) return { meeting: existing, duplicate: true };

  const heldAt = new Date(body.startedAt);
  const endedAt = body.endedAt ? new Date(body.endedAt) : parsed.durationSec ? new Date(heldAt.getTime() + parsed.durationSec * 1000) : null;
  const durationMin = endedAt ? Math.max(1, Math.round((endedAt.getTime() - heldAt.getTime()) / 60000)) : null;
  const title = body.title?.trim() || body.calendarTitle?.trim() || `Meeting ${formatDate(heldAt)}`;

  const [meeting] = await db
    .insert(meetings)
    .values({
      clientId,
      title,
      heldAt,
      endedAt,
      durationMin,
      status: "held",
      source: body.source,
      calendarTitle: body.calendarTitle?.trim() || null,
      attendees: body.attendees,
      rawNotes: parsed.fullText,
      otherWork: Boolean(opts.otherWork),
      processing: "received",
      ingestHash: hash,
    })
    .onConflictDoNothing({ target: meetings.ingestHash })
    .returning();
  if (!meeting) {
    const raced = await db.query.meetings.findFirst({ where: (m, { eq }) => eq(m.ingestHash, hash) });
    if (!raced) throw new Error("Could not save the meeting");
    return { meeting: raced, duplicate: true };
  }
  await db.insert(meetingTranscripts).values({ meetingId: meeting.id, fullText: parsed.fullText, segments: parsed.segments, language: body.language, wordCount: parsed.wordCount });
  return { meeting, duplicate: false };
}

/** Meetings that arrived through ingest or upload in the last hour, for the rate limit. */
export async function countRecentIngests(hours = 1): Promise<number> {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600_000);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetings)
    .where(and(inArray(meetings.source, ["mac_helper", "upload"]), gte(meetings.createdAt, since)));
  return row?.n ?? 0;
}

export const INGEST_LIMITS = {
  maxBytes: (Number(process.env.ORBIT_INGEST_MAX_MB) || 5) * 1024 * 1024,
  perHour: Number(process.env.ORBIT_INGEST_PER_HOUR) || 30,
};
