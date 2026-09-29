"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { undoChange, type UndoResult } from "@/lib/data/changeLog";
import { fail, ok, type ActionResult } from "./result";

/** Undo one automatic change. Without force, a field that moved again since comes back as a conflict for Saaqib to decide. */
export async function undoChangeAction(id: unknown, force: unknown = false): Promise<ActionResult<UndoResult>> {
  await requireSession();
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return fail("Bad change id");
  try {
    const result = await undoChange(parsed.data, { force: Boolean(force) });
    if (result.ok) revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
