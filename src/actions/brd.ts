"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { extractFromMeetings, markCoveredFromCheck, runGapCheck, setBrdItemStatus, writeDraft } from "@/lib/data/brd";
import { docxToText } from "@/lib/brd/text";
import { fail, ok, zodMessage, type ActionResult } from "./result";

const uuid = z.string().uuid();

function refresh(clientId: string) {
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/brds");
}

export async function extractBrdAction(clientId: unknown, rereadAll: unknown = false): Promise<ActionResult<{ read: number; added: number; skipped: number; remaining: number; engine: string }>> {
  await requireSession();
  const id = uuid.safeParse(clientId);
  if (!id.success) return fail("Bad client");
  try {
    const r = await extractFromMeetings(id.data, { rereadAll: Boolean(rereadAll) });
    refresh(id.data);
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}

export async function setBrdItemStatusAction(itemId: unknown, status: unknown): Promise<ActionResult> {
  await requireSession();
  const id = uuid.safeParse(itemId);
  const s = z.enum(["open", "covered", "dropped"]).safeParse(status);
  if (!id.success || !s.success) return fail("Bad input");
  try {
    const row = await setBrdItemStatus(id.data, s.data);
    refresh(row.clientId);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function writeBrdDraftAction(clientId: unknown): Promise<ActionResult<{ id: string; version: number; engine: string }>> {
  await requireSession();
  const id = uuid.safeParse(clientId);
  if (!id.success) return fail("Bad client");
  try {
    const { draft, engine } = await writeDraft(id.data);
    refresh(id.data);
    return ok({ id: draft.id, version: draft.version, engine });
  } catch (e) {
    return fail(e);
  }
}

const MAX_BRD_BYTES = 10 * 1024 * 1024;

/** Gap check from pasted text or an uploaded .docx, .txt or .md file. */
export async function gapCheckAction(formData: FormData): Promise<ActionResult<{ id: string; findings: number; engine: string }>> {
  await requireSession();
  const id = uuid.safeParse(formData.get("clientId"));
  if (!id.success) return fail("Bad client");
  const pasted = z.string().max(400_000, "That text is too long").safeParse(String(formData.get("text") ?? ""));
  if (!pasted.success) return fail(zodMessage(pasted.error.issues));
  const file = formData.get("file");
  try {
    let text = pasted.data.trim();
    let name = "Pasted text";
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BRD_BYTES) return fail("That file is over 10 MB");
      const lower = file.name.toLowerCase();
      if (lower.endsWith(".docx")) text = await docxToText(await file.arrayBuffer());
      else if (lower.endsWith(".txt") || lower.endsWith(".md")) text = await file.text();
      else return fail("Use a .docx, .txt or .md file, or paste the text");
      name = file.name;
    }
    if (text.split(/\s+/).length < 20) return fail("Paste the BRD or choose its file. It needs more than a few lines to check.");
    const { check, engine } = await runGapCheck(id.data, name, text);
    refresh(id.data);
    return ok({ id: check.id, findings: check.findings.length, engine });
  } catch (e) {
    return fail(e);
  }
}

export async function markCoveredAction(checkId: unknown, clientId: unknown): Promise<ActionResult<{ marked: number }>> {
  await requireSession();
  const c = uuid.safeParse(checkId);
  const cl = uuid.safeParse(clientId);
  if (!c.success || !cl.success) return fail("Bad input");
  try {
    const marked = await markCoveredFromCheck(c.data);
    refresh(cl.data);
    return ok({ marked });
  } catch (e) {
    return fail(e);
  }
}
