"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { SETTINGS_KEYS } from "@/lib/core/constants";
import { setSetting } from "@/lib/data/settings";
import { clearDemoData, seedDemoData } from "@/lib/demo/seed";
import { fail, ok, type ActionResult } from "./result";

export async function setOwnerNameAction(name: string): Promise<ActionResult<string>> {
  await requireSession();
  const parsed = z.string().trim().min(1).max(60).safeParse(name);
  if (!parsed.success) return fail("Enter a name");
  try {
    await setSetting(SETTINGS_KEYS.ownerName, parsed.data);
    revalidatePath("/", "layout");
    return ok(parsed.data);
  } catch (e) {
    return fail(e);
  }
}

export async function loadDemoDataAction(): Promise<ActionResult<{ inserted: number }>> {
  await requireSession();
  try {
    const result = await seedDemoData();
    revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}

export async function clearDemoDataAction(): Promise<ActionResult<{ removed: number }>> {
  await requireSession();
  try {
    const result = await clearDemoData();
    revalidatePath("/", "layout");
    return ok(result);
  } catch (e) {
    return fail(e);
  }
}
