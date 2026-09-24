"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, Clock, Hourglass, MoreHorizontal, Play, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Client, Task } from "@/lib/db/schema";
import { deleteTaskAction, updateTaskAction } from "@/actions/tasks";
import { countdownLabel, daysUntil, formatDate } from "@/lib/core/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function TaskRow({ task, client, showClient = true, compact }: { task: Task; client?: Pick<Client, "id" | "name" | "code"> | null; showClient?: boolean; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [justDone, setJustDone] = useState(false);
  const done = task.status === "done" || justDone;
  const days = task.dueDate ? daysUntil(task.dueDate) : null;
  const overdue = !done && days !== null && days < 0;
  const waitingDays = task.status === "waiting" && task.waitingSince ? -daysUntil(task.waitingSince) : null;

  function setStatus(status: Task["status"]) {
    if (status === "done") setJustDone(true);
    start(async () => {
      const res = await updateTaskAction(task.id, { status });
      if (!res.ok) {
        setJustDone(false);
        toast.error(res.error);
        return;
      }
      if (status === "done") toast.success("Done", { description: task.title });
      router.refresh();
    });
  }

  return (
    <li className={cn("group flex items-start gap-3", compact ? "py-2" : "py-2.5")}>
      <button
        type="button"
        onClick={() => setStatus(done ? "todo" : "done")}
        disabled={pending}
        aria-label={done ? "Reopen task" : "Mark done"}
        className={cn(
          "relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition",
          done ? "border-teal bg-teal text-accent-ink" : "border-border-strong hover:border-teal",
        )}
      >
        {done && (
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 22 }}>
            <Check className="size-3" strokeWidth={3} />
          </motion.span>
        )}
        {justDone && <motion.span className="absolute inset-0 rounded-full border-2 border-teal" initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 2.2, opacity: 0 }} transition={{ duration: 0.6 }} />}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm", done ? "text-muted line-through" : "text-text")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
          {showClient && client && (
            <Link href={`/clients/${client.id}`} className="num font-medium text-teal hover:underline">
              {client.code}
            </Link>
          )}
          {task.status === "in_progress" && !done && <span className="pill pill-violet !py-0 !text-[11px]">In progress</span>}
          {task.status === "waiting" && !done && (
            <span className="pill pill-warn !py-0 !text-[11px]">
              <Hourglass className="size-3" /> Waiting on {task.waitingOn ?? "someone"}
              {waitingDays !== null && waitingDays > 0 ? ` · ${waitingDays}d` : ""}
            </span>
          )}
          {task.dueDate && !done && (
            <span className={cn("inline-flex items-center gap-1", overdue ? "text-bad" : days === 0 ? "text-warn" : "text-muted")}>
              <Clock className="size-3" />
              {overdue || days === 0 ? countdownLabel(task.dueDate) : formatDate(task.dueDate, false)}
            </span>
          )}
          {task.priority === "urgent" && !done && <span className="text-bad">Urgent</span>}
          {task.priority === "high" && !done && <span className="text-warn">High</span>}
          {task.isDemo && <span className="uppercase tracking-wider text-faint">demo</span>}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label="Task options">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {task.status !== "in_progress" && !done && (
            <DropdownMenuItem onSelect={() => setStatus("in_progress")}>
              <Play /> Start
            </DropdownMenuItem>
          )}
          {task.status !== "waiting" && !done && (
            <DropdownMenuItem onSelect={() => setStatus("waiting")}>
              <Hourglass /> Mark waiting
            </DropdownMenuItem>
          )}
          {done && (
            <DropdownMenuItem onSelect={() => setStatus("todo")}>
              <RotateCcw /> Reopen
            </DropdownMenuItem>
          )}
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
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
