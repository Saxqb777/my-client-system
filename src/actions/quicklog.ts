"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { quickLogPlanSchema, type QuickLogPlan } from "@/lib/ai/quicklog";
import { applyQuickLog, type ApplyResult } from "@/lib/data/quicklog";
import { fail, ok, zodMessage, type ActionResult } from "./result";

const applySchema = z.object({
  clientId: z.string().uuid("Pick a client first"),
  plan: quickLogPlanSchema,
});

export async function applyQuickLogAction(input: { clientId: string; plan: QuickLogPlan }): Promise<ActionResult<ApplyResult>> {
  await requireSession();
  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const result = await applyQuickLog(parsed.data.plan, parsed.data.clientId);
    revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
