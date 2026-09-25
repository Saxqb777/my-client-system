"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, GripVertical, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { Client, Task } from "@/lib/db/schema";
import { deleteTaskAction, updateTaskAction } from "@/actions/tasks";
import { addDaysISO, countdownLabel, daysUntil, formatDate, todayISO } from "@/lib/core/dates";
import type { NavClient } from "@/components/shell/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { TaskEditDialog } from "./TaskEditDialog";

function nextMonday(today: string) {
  const d = new Date(`${today}T00:00:00Z`);
  const delta = ((1 - d.getUTCDay() + 7) % 7) || 7;
  return addDaysISO(today, delta);
}

export function TaskRow({
  task,
  client,
  showClient = true,
  compact,
  clients,
  handle,
}: {
  task: Task;
  client?: Pick<Client, "id" | "name" | "code"> | null;
  showClient?: boolean;
  compact?: boolean;
  clients?: NavClient[];
  /** Show a drag handle (the parent provides the drag behaviour). */
  handle?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [justDone, setJustDone] = useState(false);
  const [edit, setEdit] = useState<false | "any" | "waiting" | "due">(false);
  const done = task.status === "done" || justDone;
  const days = task.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = !done && days !== null && days < 0;
  const waitingDays = task.status === "waiting" && task.waitingSince ? -daysUntil(task.waitingSince) : null;
  const today = todayISO();

  function patch(values: Record<string, unknown>, message?: string) {
    start(async () => {
      const res = await updateTaskAction(task.id, values);
      if (!res.ok) {
        setJustDone(false);
        toast.error(res.error);
        return;
      }
      if (message) toast.success(message);
      router.refresh();
    });
  }

  function toggle() {
    if (done) {
      setJustDone(false);
      patch({ status: "todo" });
    } else {
      setJustDone(true);
      patch({ status: "done" }, "Done");
    }
  }

  return (
    <li className={cn("group flex items-start gap-3 border-b border-border last:border-0", compact ? "py-2" : "py-2.5")}>
      {handle && <GripVertical className="mt-1 size-4 shrink-0 cursor-grab text-faint opacity-0 transition group-hover:opacity-100 active:cursor-grabbing" aria-hidden />}
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={done ? "Reopen task" : "Mark done"}
        className={cn(
          "mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-[3px] border transition",
          done ? "border-ink bg-ink text-paper" : "border-border-strong hover:border-ink",
        )}
      >
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>

      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => setEdit("any")} className={cn("text-left", compact ? "text-[13.5px]" : "text-[14.5px]", done ? "text-muted line-through" : "text-text")}>
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12px] text-muted">
          {showClient && client && (
            <Link href={`/clients/${client.id}`} className="num text-text-2 hover:underline">
              {client.code}
            </Link>
          )}
          {task.dueDate && !done && (
            <span className={cn(overdue ? "text-bad" : days === 0 ? "text-warn" : "")}>{overdue || days === 0 || days === 1 ? countdownLabel(task.dueDate) : formatDate(task.dueDate, false)}</span>
          )}
          {task.status === "waiting" && !done && (
            <span className="text-warn">
              Waiting on {task.waitingOn ?? "someone"}
              {waitingDays !== null && waitingDays > 0 ? `, ${waitingDays} ${waitingDays === 1 ? "day" : "days"}` : ""}
            </span>
          )}
          {task.status === "in_progress" && !done && <span className="text-info">In progress</span>}
          {task.priority === "urgent" && !done && <span className="text-bad">Urgent</span>}
          {task.priority === "high" && !done && <span className="text-warn">High</span>}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label="Task options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!done && (
            <>
              <DropdownMenuItem onSelect={() => patch({ dueDate: today })}>Due today</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => patch({ dueDate: addDaysISO(today, 1) })}>Due tomorrow</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => patch({ dueDate: nextMonday(today) })}>Due next week</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEdit("due")}>Pick a date</DropdownMenuItem>
              {task.dueDate && <DropdownMenuItem onSelect={() => patch({ dueDate: null })}>Clear date</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setEdit("waiting")}>{task.status === "waiting" ? "Change who we wait on" : "Waiting on someone"}</DropdownMenuItem>
              {task.status === "waiting" && <DropdownMenuItem onSelect={() => patch({ status: "todo", waitingOn: null })}>Reply came, back to do</DropdownMenuItem>}
              {task.status !== "in_progress" && <DropdownMenuItem onSelect={() => patch({ status: "in_progress" })}>Start</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setEdit("any")}>Edit</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {done && <DropdownMenuItem onSelect={() => patch({ status: "todo" })}>Reopen</DropdownMenuItem>}
          <DropdownMenuItem
            danger
            onSelect={() =>
              start(async () => {
                const res = await deleteTaskAction(task.id);
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TaskEditDialog task={task} open={edit !== false} onOpenChange={(v) => !v && setEdit(false)} clients={clients} focus={edit === "waiting" || edit === "due" ? edit : undefined} />
    </li>
  );
}
