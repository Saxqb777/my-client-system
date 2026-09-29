import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { activities, clients, documents, meetingOutputs, meetings, type ActionItem, type PendingProposal } from "@/lib/db/schema";
import { buildMinutes } from "@/lib/ai/mom";
import { buildNotes, NOTES_PROMPT_VERSION } from "@/lib/ai/notes";
import { condenseTranscript, LONG_MEETING_MINUTES } from "@/lib/ai/condense";
import { AI_MODEL } from "@/lib/ai/client";
import { momDateLine, momHeading, projectLabel, renderMinutesText } from "@/lib/core/minutes";
import { renderDetailsText, renderNotesText, type MeetingDetails } from "@/lib/core/notes";
import { getClient } from "@/lib/data/clients";
import { listVocabulary } from "@/lib/data/vocabulary";
import { AUTO_LINK_CONFIDENCE, matchClient } from "./match";
import { transcriptForPrompt } from "./transcript";

export const MOM_PROMPT_VERSION = "mom-v2";

/**
 * The pipeline behind every ingested or uploaded meeting. Runs after the HTTP response (Next `after`)
 * and again on Retry. Steps: match the client, draft the MOM in the approved layout plus the details
 * sheet, draft the understanding notes, save everything, mark processed or needs review.
 * Nothing about the client is changed here; the proposal (tasks, dates, health) waits for review.
 * Errors land on the meeting row. Transcript text never goes to the logs.
 */
export async function processMeeting(id: string): Promise<void> {
  const db = await getDb();
  const meeting = await db.query.meetings.findFirst({ where: eq(meetings.id, id), with: { client: true, transcript: true } });
  if (!meeting) return;
  if (!meeting.transcript || !meeting.transcript.fullText.trim()) {
    await db.update(meetings).set({ processing: "failed", errorMessage: "No transcript on this meeting" }).where(eq(meetings.id, id));
    return;
  }
  await db.update(meetings).set({ processing: "processing", errorMessage: null }).where(eq(meetings.id, id));

  try {
    const segments = meeting.transcript.segments;
    let clientId = meeting.clientId;
    let matchConfidence = meeting.matchConfidence;
    let matchReason = meeting.matchReason;

    if (!clientId && !meeting.otherWork) {
      const live = await db.query.clients.findMany({ where: isNull(clients.archivedAt), with: { people: true } });
      const vocab = await listVocabulary();
      const r = matchClient({ calendarTitle: meeting.calendarTitle ?? meeting.title, attendees: meeting.attendees, text: meeting.transcript.fullText }, live, vocab);
      matchConfidence = r.confidence;
      matchReason = r.reason;
      if (r.clientId && r.confidence >= AUTO_LINK_CONFIDENCE) clientId = r.clientId;
    }

    const client = clientId ? ((await getClient(clientId)) ?? null) : null;
    const minutesLong = (meeting.durationMin ?? 0) > LONG_MEETING_MINUTES || meeting.transcript.wordCount > 18000;
    const transcriptText = minutesLong ? await condenseTranscript(segments) : transcriptForPrompt(segments);

    const { plan } = await buildMinutes({ meeting: { ...meeting, clientId }, client, transcript: transcriptText });

    const previous = clientId
      ? await db.query.meetings.findMany({
          where: and(eq(meetings.clientId, clientId), lt(meetings.heldAt, meeting.heldAt), eq(meetings.status, "minuted")),
          orderBy: [desc(meetings.heldAt)],
          limit: 3,
          with: { outputs: true },
        })
      : [];
    const { notes } = await buildNotes({
      meeting,
      client,
      segments: minutesLong ? [] : segments,
      previous: previous.map((p) => ({ title: p.title, heldAt: p.heldAt, text: p.outputs.find((o) => o.kind === "notes")?.text || p.mom || "" })),
    });
    // For a long meeting the notes call reads the condensed text instead of raw segments.
    if (minutesLong && notes.about.length === 0) notes.about.push("Long meeting: notes were drafted from the condensed transcript.");

    const title = plan.title?.trim() || meeting.title;
    const location = plan.location ?? meeting.location;
    const heading = momHeading(client?.code ?? null, title);
    const dateLine = momDateLine(meeting.heldAt, location);
    const actionItems: ActionItem[] = plan.actionItems.map((a) => ({ text: a.text, owner: a.owner ?? undefined, due: a.due ?? undefined }));
    const momText = renderMinutesText({
      clientCode: client?.code ?? null,
      clientName: client?.name ?? "Other Work",
      project: client ? projectLabel(client) : "Fero",
      title,
      heldAt: meeting.heldAt,
      location,
      objective: plan.objective,
      points: plan.points,
      actions: plan.actionItems.map((a) => ({ text: a.text, owner: a.owner })),
    });
    const details: MeetingDetails = { ...plan.details, decisions: plan.decisions };
    const detailsText = renderDetailsText(details, heading, dateLine);
    const notesText = renderNotesText(notes);
    const proposal: PendingProposal = {
      tasks: plan.tasks,
      dateChanges: plan.dateChanges,
      health: plan.health,
      healthReason: plan.healthReason,
      nextStep: plan.nextStep,
      notesUpdate: plan.notesUpdate,
      decisions: plan.decisions,
      summary: plan.summary,
      openQuestions: plan.openQuestions,
      reviewedAt: null,
    };
    const state = clientId || meeting.otherWork ? "processed" : "needs_review";

    await db
      .update(meetings)
      .set({
        clientId,
        matchConfidence,
        matchReason,
        title,
        location,
        status: "minuted",
        mom: momText,
        minutes: { objective: plan.objective, points: plan.points, proposal },
        actionItems,
        processing: state,
        processedAt: new Date(),
        errorMessage: null,
      })
      .where(eq(meetings.id, id));

    for (const out of [
      { kind: "details" as const, data: details as unknown as Record<string, unknown>, text: detailsText, promptVersion: MOM_PROMPT_VERSION },
      { kind: "notes" as const, data: notes as unknown as Record<string, unknown>, text: notesText, promptVersion: NOTES_PROMPT_VERSION },
    ]) {
      await db
        .insert(meetingOutputs)
        .values({ meetingId: id, kind: out.kind, data: out.data, text: out.text, model: AI_MODEL, promptVersion: out.promptVersion })
        .onConflictDoUpdate({ target: [meetingOutputs.meetingId, meetingOutputs.kind], set: { data: out.data, text: out.text, model: AI_MODEL, promptVersion: out.promptVersion, createdAt: new Date() } });
    }

    if (meeting.documentId) {
      await db.update(documents).set({ clientId, title: `${title} minutes`, content: momText, meetingId: id }).where(eq(documents.id, meeting.documentId));
    } else {
      const [doc] = await db.insert(documents).values({ clientId, type: "mom", title: `${title} minutes`, content: momText, tags: ["mom"], meetingId: id }).returning();
      await db.update(meetings).set({ documentId: doc.id }).where(eq(meetings.id, id));
    }

    if (clientId && state === "processed") {
      const existing = await db.query.activities.findFirst({ where: and(eq(activities.meetingId, id), eq(activities.type, "meeting")) });
      if (!existing) {
        await db.insert(activities).values({ clientId, type: "meeting", title: `Minutes ready: ${title}`, body: plan.summary, occurredAt: meeting.heldAt, source: "system", meetingId: id });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : "Processing failed";
    console.error(`[orbit] meeting ${id} failed: ${message}`);
    await db.update(meetings).set({ processing: "failed", errorMessage: message }).where(eq(meetings.id, id));
  }
}

/** Saaqib picked a client, or Other Work, for a meeting in Needs review. The pipeline runs again with that context. */
export async function assignMeeting(id: string, target: { clientId: string } | { otherWork: true }): Promise<void> {
  const db = await getDb();
  const patch = "clientId" in target ? { clientId: target.clientId, otherWork: false } : { clientId: null, otherWork: true };
  await db.update(meetings).set({ ...patch, matchConfidence: 1, matchReason: "Chosen by Saaqib", processing: "received", errorMessage: null }).where(eq(meetings.id, id));
}
