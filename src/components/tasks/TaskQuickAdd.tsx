"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { quickAddTaskAction } from "@/actions/tasks";
import { formatDate } from "@/lib/core/dates";
import { cn } from "@/lib/utils";

/**
 * One line, Enter, done. Client, date, waiting on and priority are read from the words.
 * Examples: "ADSO chase Mohamad for the AFSYS session Friday" or "Send BRD schedule mail tomorrow, high".
 */
export function TaskQuickAdd({ className, autoFocus }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (value.length < 2) return;
    start(async () => {
      const res = await quickAddTaskAction(value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { line } = res.data;
      const bits = [line.clientCode, line.dueDate ? `due ${formatDate(line.dueDate, false)}` : null, line.waitingOn ? `waiting on ${line.waitingOn}` : null, line.priority !== "normal" ? line.priority : null].filter(Boolean);
      toast.success(line.title, { description: bits.length ? bits.join(", ") : "No client or date. Edit the row if needed." });
      setText("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className={cn("flex items-center gap-4 border-b border-border py-3", className)}>
      <label htmlFor="task-quick-add" className="serif-italic shrink-0 text-[19px] text-muted">
        Add
      </label>
      <input
        id="task-quick-add"
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Client, what to do, when. For example: IDS rerun trip plan Monday, or ADSO waiting on Mohamad for the AFSYS session"
        aria-label="Add a task"
        disabled={pending}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint disabled:opacity-60"
      />
      {pending && <Loader2 className="size-4 animate-spin text-muted" />}
    </form>
  );
}
