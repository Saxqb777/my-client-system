"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { buildMinutes, minutesPlanSchema, type MinutesPlan } from "@/lib/ai/mom";
import { aiEnabled } from "@/lib/ai/client";
import { getClient, updateClient } from "@/lib/data/clients";
import { createMeeting, deleteMeeting, getMeeting, saveMinutes, updateMeeting, type SavedMinutes } from "@/lib/data/meetings";
import { meetingInputSchema, meetingPatchSchema } from "@/lib/validation";
import type { Meeting } from "@/lib/db/schema";
import { fail, ok, zodMessage, type ActionResult } from "./result";

export async function createMeetingAction(input: unknown): Promise<ActionResult<Meeting>> {
  await requireSession();
  const parsed = meetingInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createMeeting(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updateMeetingAction(id: string, patch: unknown): Promise<ActionResult<Meeting>> {
  await requireSession();
  const parsed = meetingPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updateMeeting(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMeetingAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteMeeting(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

const transcriptSchema = z.string().trim().min(40, "Paste the whole transcript or notes, at least a few lines").max(200_000, "That transcript is too long, trim it to the meeting itself");

/** Stores the transcript on the meeting and asks Claude for minutes in the client's format. Nothing else is saved yet. */
export async function buildMinutesAction(meetingId: string, transcript: unknown): Promise<ActionResult<{ plan: MinutesPlan; engine: "claude" | "rules"; aiConfigured: boolean }>> {
  await requireSession();
  const parsed = transcriptSchema.safeParse(transcript);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const meeting = await getMeeting(meetingId);
    if (!meeting) return fail("Meeting not found");
    const client = await getClient(meeting.clientId);
    if (!client) return fail("Client not found");
    await updateMeeting(meetingId, { rawNotes: parsed.data, status: meeting.status === "planned" ? "held" : meeting.status });
    const result = await buildMinutes({ meeting, client, transcript: parsed.data });
    return ok({ ...result, aiConfigured: aiEnabled() });
  } catch (e) {
    return fail(e);
  }
}

const acceptSchema = z.object({
  tasks: z.array(z.boolean()),
  dateChanges: z.array(z.boolean()),
  health: z.boolean(),
  nextStep: z.boolean(),
  notes: z.boolean(),
});

export async function saveMinutesAction(meetingId: string, plan: unknown, accept: unknown): Promise<ActionResult<SavedMinutes>> {
  await requireSession();
  const p = minutesPlanSchema.safeParse(plan);
  if (!p.success) return fail(zodMessage(p.error.issues));
  const a = acceptSchema.safeParse(accept);
  if (!a.success) return fail("Bad review state");
  try {
    const result = await saveMinutes(meetingId, p.data, a.data);
    revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

export async function setMomFormatAction(clientId: string, format: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = z.string().trim().max(4000).safeParse(format);
  if (!parsed.success) return fail("Format too long");
  try {
    await updateClient(clientId, { momFormat: parsed.data || null }, "app");
    revalidatePath(`/clients/${clientId}`);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function setClientNotesAction(clientId: string, notes: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = z.string().trim().max(20000).safeParse(notes);
  if (!parsed.success) return fail("Notes too long");
  try {
    await updateClient(clientId, { notes: parsed.data || null }, "app");
    revalidatePath(`/clients/${clientId}`);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
