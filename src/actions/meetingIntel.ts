"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { TIMEZONE } from "@/lib/core/constants";
import { askOrbit, type AskAnswer } from "@/lib/ai/ask";
import { createClient } from "@/lib/data/clients";
import { getDb } from "@/lib/db";
import { meetings } from "@/lib/db/schema";
import { applyReview } from "@/lib/meetings/autoUpdate";
import { createIngestedMeeting } from "@/lib/meetings/ingest";
import { assignMeeting, processMeeting } from "@/lib/meetings/process";
import { parseTranscriptFile, parseTranscriptText } from "@/lib/meetings/transcript";
import { transcriptFileProblem } from "@/lib/meetings/transcriptFile";
import { clientInputSchema } from "@/lib/validation";
import { eq } from "drizzle-orm";
import { fail, ok, zodMessage, type ActionResult } from "./result";

const uploadSchema = z.object({
  /** "" lets Orbit match, "other" is Other Work, otherwise a client id. */
  clientId: z.string().default(""),
  title: z.string().trim().max(300).default(""),
  heldAt: z.string().default(""),
  text: z.string().default(""),
});

/** Manual fallback: paste or upload a transcript, pick a client or let Orbit match, then the pipeline runs. */
export async function uploadTranscriptAction(formData: FormData): Promise<ActionResult<{ meetingId: string; duplicate: boolean }>> {
  await requireSession();
  const fields = uploadSchema.safeParse({ clientId: formData.get("clientId") ?? "", title: formData.get("title") ?? "", heldAt: formData.get("heldAt") ?? "", text: formData.get("text") ?? "" });
  if (!fields.success) return fail(zodMessage(fields.error.issues));
  const file = formData.get("file");
  try {
    let parsed;
    if (file instanceof File && file.size > 0) {
      const problem = transcriptFileProblem(file.name, file.size);
      if (problem) return fail(problem);
      parsed = await parseTranscriptFile(file.name, await file.arrayBuffer());
    } else if (fields.data.text.trim().length >= 40) {
      parsed = parseTranscriptText(fields.data.text);
    } else {
      return fail("Paste the transcript or choose a file");
    }
    if (!parsed.segments.length) return fail("Could not read any lines from that transcript");
    const startedAt = fields.data.heldAt ? fromZonedTime(fields.data.heldAt, TIMEZONE) : new Date();
    const sel = fields.data.clientId;
    const clientId = sel && sel !== "other" ? sel : null;
    const { meeting, duplicate } = await createIngestedMeeting(
      { source: "upload", startedAt: startedAt.toISOString(), endedAt: null, calendarTitle: fields.data.title || null, title: fields.data.title || null, attendees: [], language: "en", segments: parsed.segments, fullText: parsed.fullText, clientCode: null },
      clientId,
      { otherWork: sel === "other" },
    );
    if (!duplicate) after(() => processMeeting(meeting.id));
    revalidatePath("/meetings");
    return ok({ meetingId: meeting.id, duplicate });
  } catch (e) {
    return fail(e);
  }
}

/** Needs review: Saaqib picks a client or Other Work. The pipeline runs again with that context. */
export async function assignMeetingAction(id: string, target: { clientId: string } | { otherWork: true }): Promise<ActionResult> {
  await requireSession();
  try {
    await assignMeeting(id, target);
    after(() => processMeeting(id));
    revalidatePath("/meetings");
    revalidatePath(`/meetings/${id}`);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

/** From an Other Work or unmatched meeting: make the client in one step and move the meeting there. */
export async function createClientAndAssignAction(id: string, input: unknown): Promise<ActionResult<{ clientId: string }>> {
  await requireSession();
  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const client = await createClient(parsed.data);
    await assignMeeting(id, { clientId: client.id });
    after(() => processMeeting(id));
    revalidatePath("/", "layout");
    return ok({ clientId: client.id });
  } catch (e) {
    return fail(e);
  }
}

export async function retryMeetingAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    const db = await getDb();
    await db.update(meetings).set({ processing: "received", errorMessage: null }).where(eq(meetings.id, id));
    after(() => processMeeting(id));
    revalidatePath(`/meetings/${id}`);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

const acceptSchema = z.object({
  tasks: z.array(z.boolean()).default([]),
  dateChanges: z.array(z.boolean()).default([]),
  health: z.boolean().default(false),
  nextStep: z.boolean().default(false),
  phaseDates: z.boolean().default(false),
  risks: z.array(z.boolean()).default([]),
  doneItems: z.array(z.boolean()).default([]),
  notes: z.boolean().default(false),
});

/** Review tab: apply the items Saaqib ticked. They go through the same path as automatic changes and are logged. */
export async function applyProposalAction(id: string, accept: unknown): Promise<ActionResult<{ lines: string[] }>> {
  await requireSession();
  const a = acceptSchema.safeParse(accept);
  if (!a.success) return fail("Bad review state");
  try {
    const result = await applyReview(id, a.data);
    revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

export async function askOrbitAction(question: unknown, clientId: unknown): Promise<ActionResult<AskAnswer>> {
  await requireSession();
  const q = z.string().trim().min(3, "Ask a fuller question").max(1000).safeParse(question);
  if (!q.success) return fail(zodMessage(q.error.issues));
  const c = z.string().uuid().nullable().safeParse(clientId ?? null);
  try {
    return ok(await askOrbit(q.data, c.success ? c.data : null));
  } catch (e) {
    return fail(e);
  }
}
