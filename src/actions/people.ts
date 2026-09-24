"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { createPerson, deletePerson, updatePerson } from "@/lib/data/people";
import { personInputSchema } from "@/lib/validation";
import { fail, ok, zodMessage, type ActionResult } from "./result";
import type { Person } from "@/lib/db/schema";

export async function createPersonAction(input: unknown): Promise<ActionResult<Person>> {
  await requireSession();
  const parsed = personInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createPerson(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updatePersonAction(id: string, input: unknown): Promise<ActionResult<Person>> {
  await requireSession();
  const parsed = personInputSchema.partial().safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updatePerson(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deletePersonAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deletePerson(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
