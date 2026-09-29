"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { generateFridayPack } from "@/lib/friday/generate";
import { EDITABLE_CELLS } from "@/lib/friday/build";
import { setReportStatus, updateReportCell } from "@/lib/data/reports";
import { fail, ok, zodMessage, type ActionResult } from "./result";

const week = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Week start must be a date");

/** Generate or regenerate the pack for a week. Hand edits stay unless reset is on. */
export async function generateFridayAction(weekStart: unknown, reset: unknown = false): Promise<ActionResult<{ id: string; engine: "claude" | "rules"; rows: number }>> {
  await requireSession();
  const w = week.safeParse(weekStart);
  if (!w.success) return fail(zodMessage(w.error.issues));
  try {
    const { report, engine } = await generateFridayPack(w.data, { reset: Boolean(reset) });
    revalidatePath("/friday");
    return ok({ id: report.id, engine, rows: report.rows.length });
  } catch (e) {
    return fail(e);
  }
}

const cellSchema = z.object({ id: z.string().uuid(), clientId: z.string().uuid(), key: z.enum(EDITABLE_CELLS as [string, ...string[]]), value: z.string().max(2000) });

/** One cell edited inline. */
export async function saveFridayCellAction(input: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = cellSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    await updateReportCell(parsed.data.id, parsed.data.clientId, parsed.data.key as (typeof EDITABLE_CELLS)[number], parsed.data.value.trim());
    revalidatePath("/friday");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}

export async function setFridayStatusAction(id: unknown, status: unknown): Promise<ActionResult> {
  await requireSession();
  const i = z.string().uuid().safeParse(id);
  const s = z.enum(["draft", "final"]).safeParse(status);
  if (!i.success || !s.success) return fail("Bad input");
  try {
    await setReportStatus(i.data, s.data);
    revalidatePath("/friday");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
