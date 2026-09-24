"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { createMilestone, deleteMilestone, updateMilestone } from "@/lib/data/milestones";
import { milestoneInputSchema, milestonePatchSchema } from "@/lib/validation";
import { fail, ok, zodMessage, type ActionResult } from "./result";
import type { Milestone } from "@/lib/db/schema";

export async function createMilestoneAction(input: unknown): Promise<ActionResult<Milestone>> {
  await requireSession();
  const parsed = milestoneInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createMilestone(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updateMilestoneAction(id: string, patch: unknown): Promise<ActionResult<Milestone>> {
  await requireSession();
  const parsed = milestonePatchSchema.safeParse(patch);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updateMilestone(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteMilestoneAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteMilestone(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
