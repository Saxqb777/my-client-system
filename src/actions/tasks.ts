"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/guard";
import { createTask, deleteTask, updateTask } from "@/lib/data/tasks";
import { taskInputSchema, taskPatchSchema } from "@/lib/validation";
import { fail, ok, zodMessage, type ActionResult } from "./result";
import type { Task } from "@/lib/db/schema";

export async function createTaskAction(input: unknown): Promise<ActionResult<Task>> {
  await requireSession();
  const parsed = taskInputSchema.safeParse(input);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await createTask(parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function updateTaskAction(id: string, patch: unknown): Promise<ActionResult<Task>> {
  await requireSession();
  const parsed = taskPatchSchema.safeParse(patch);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const row = await updateTask(id, parsed.data);
    revalidatePath("/", "layout");
    return ok(row);
  } catch (e) {
    return fail(e);
  }
}

export async function deleteTaskAction(id: string): Promise<ActionResult> {
  await requireSession();
  try {
    await deleteTask(id);
    revalidatePath("/", "layout");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
