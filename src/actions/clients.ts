"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { createClient, deleteClient, setArchived, updateClient } from "@/lib/data/clients";
import { clientInputSchema, clientPatchSchema } from "@/lib/validation";
import { fail, ok, zodMessage, type ActionResult } from "./result";
import type { Client } from "@/lib/db/schema";

export async function createClientAction(input: unknown): Promise<ActionResult<Client>> {
  await requireSession();
  const parsed = clientInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createClient(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientAction(id: string, patch: unknown): Promise<ActionResult<Client>> {
  await requireSession();
  const parsed = clientPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updateClient(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function archiveClientAction(id: string, archived: boolean): Promise<ActionResult<Client>> {
  await requireSession();
  try {
    const row = await setArchived(id, archived);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClientAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteClient(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
