"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { createActivity, deleteActivity, updateActivity } from "@/lib/data/activities";
import { activityInputSchema } from "@/lib/validation";
import { fail, ok, zodMessage, type ActionResult } from "./result";
import type { Activity } from "@/lib/db/schema";

export async function logActivityAction(input: unknown): Promise<ActionResult<Activity>> {
  await requireSession();
  const parsed = activityInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createActivity(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updateActivityAction(id: string, input: unknown): Promise<ActionResult<Activity>> {
  await requireSession();
  const parsed = activityInputSchema.partial().safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updateActivity(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteActivityAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteActivity(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
