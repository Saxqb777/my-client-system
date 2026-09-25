"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Task } from "@/lib/db/schema";
import { createTaskAction } from "@/actions/tasks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskRow } from "@/components/tasks/TaskRow";
import { EmptyState } from "@/components/aurora/EmptyState";
import { cn } from "@/lib/utils";

export function TasksPanel({ clientId, tasks }: { clientId: string; tasks: Task[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [more, setMore] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const waiting = tasks.filter((t) => t.status === "waiting");
  const done = tasks.filter((t) => t.status === "done" || t.status === "cancelled").sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));

  function add() {
    if (title.trim().length < 2) return;
    start(async () => {
      const res = await createTaskAction({ clientId, title: title.trim(), dueDate: due || null, waitingOn: waitingOn || null });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(waitingOn ? `Waiting on ${waitingOn}` : "Task added");
        setTitle("");
        setDue("");
        setWaitingOn("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="glass-inset p-3">
        <div className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task or follow up"
            className="h-10 border-0 bg-transparent px-1 focus:shadow-none"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button variant="ghost" size="icon" onClick={() => setMore((v) => !v)} aria-label="More options" className={cn(more && "text-teal")}>
            <ChevronDown className={cn("transition", more && "rotate-180")} />
          </Button>
          <Button size="icon" onClick={add} disabled={pending || title.trim().length < 2} aria-label="Add task">
            {pending ? <Loader2 className="animate-spin" /> : <Plus />}
          </Button>
        </div>
        {more && (
          <div className="mt-2 grid gap-2 border-t border-border pt-2 sm:grid-cols-2">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9" aria-label="Due date" />
            <Input value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} placeholder="Waiting on (person or client)" className="h-9" />
          </div>
        )}
      </div>

      {tasks.length === 0 ? (
        <EmptyState title="No tasks" hint="Add follow ups here or through Quick Log." compact />
      ) : (
        <div className="space-y-5">
          <Group title="Open" n={open.length}>
            {open.map((t) => (
              <TaskRow key={t.id} task={t} showClient={false} />
            ))}
            {open.length === 0 && <li className="py-2 text-[13px] text-muted">No open tasks</li>}
          </Group>
          <Group title="Waiting on others" n={waiting.length}>
            {waiting.map((t) => (
              <TaskRow key={t.id} task={t} showClient={false} />
            ))}
            {waiting.length === 0 && <li className="py-2 text-[13px] text-muted">No waiting items</li>}
          </Group>
          {done.length > 0 && (
            <div>
              <button type="button" className="eyebrow mb-1 flex items-center gap-1" onClick={() => setShowDone((v) => !v)}>
                Done <span className="num">{done.length}</span> <ChevronDown className={cn("size-3 transition", showDone && "rotate-180")} />
              </button>
              {showDone && (
                <ul className="divide-y divide-border/60">
                  {done.map((t) => (
                    <TaskRow key={t.id} task={t} showClient={false} compact />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, n, children }: { title: string; n: number; children: React.ReactNode }) {
  return (
    <div>
      <p className="eyebrow mb-1">
        {title} <span className="num">{n}</span>
      </p>
      <ul className="divide-y divide-border/60">{children}</ul>
    </div>
  );
}
