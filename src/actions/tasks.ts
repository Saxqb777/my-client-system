"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/guard";
import { parseTaskLine, type TaskLine } from "@/lib/ai/taskline";
import { listClients } from "@/lib/data/clients";
import { createTask, deleteTask, reorderTasks, updateTask } from "@/lib/data/tasks";
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

const quickAddSchema = z.string().trim().min(2, "Write a little more").max(300);

/** One typed line becomes a task: client, due date, waiting on and priority are read from the words. */
export async function quickAddTaskAction(text: unknown): Promise<ActionResult<{ task: Task; line: TaskLine }>> {
  await requireSession();
  const parsed = quickAddSchema.safeParse(text);
  if (!parsed.success) return fail(zodMessage(parsed.error.issues));
  try {
    const clients = await listClients();
    const line = parseTaskLine(parsed.data, clients);
    const row = await createTask({
      clientId: line.clientId,
      title: line.title,
      details: null,
      status: line.waitingOn ? "waiting" : "todo",
      priority: line.priority,
      dueDate: line.dueDate,
      waitingOn: line.waitingOn,
    });
    revalidatePath("/", "layout");
    return ok({ task: row, line });
  } catch (e) {
    return fail(e);
  }
}

export async function reorderTasksAction(ids: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = z.array(z.string().uuid()).max(200).safeParse(ids);
  if (!parsed.success) return fail("Bad order");
  try {
    await reorderTasks(parsed.data);
    revalidatePath("/tasks");
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
