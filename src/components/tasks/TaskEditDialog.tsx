"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Task, TaskPriority } from "@/lib/db/schema";
import { updateTaskAction } from "@/actions/tasks";
import { TASK_PRIORITY } from "@/lib/core/constants";
import type { NavClient } from "@/components/shell/nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const NONE = "__none__";

export function TaskEditDialog({ task, open, onOpenChange, clients, focus }: { task: Task; open: boolean; onOpenChange: (v: boolean) => void; clients?: NavClient[]; focus?: "waiting" | "due" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    title: task.title,
    dueDate: task.dueDate ?? "",
    waitingOn: task.waitingOn ?? "",
    priority: task.priority as TaskPriority,
    clientId: task.clientId ?? NONE,
  });

  // Reset when a different task or a fresh open arrives.
  const [prevKey, setPrevKey] = useState(`${task.id}:${open}`);
  if (`${task.id}:${open}` !== prevKey) {
    setPrevKey(`${task.id}:${open}`);
    setForm({ title: task.title, dueDate: task.dueDate ?? "", waitingOn: task.waitingOn ?? "", priority: task.priority, clientId: task.clientId ?? NONE });
  }

  function save() {
    start(async () => {
      const waiting = form.waitingOn.trim() || null;
      const res = await updateTaskAction(task.id, {
        title: form.title.trim(),
        dueDate: form.dueDate || null,
        waitingOn: waiting,
        priority: form.priority,
        clientId: form.clientId === NONE ? null : form.clientId,
        status: waiting ? "waiting" : task.status === "waiting" ? "todo" : task.status,
      });
      if (!res.ok) toast.error(res.error);
      else {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <div className="space-y-1.5">
            <Label>Task</Label>
            <Input autoFocus={!focus} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Due</Label>
              <Input type="date" autoFocus={focus === "due"} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskPriority })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_PRIORITY) as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY[p].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Waiting on</Label>
              <Input autoFocus={focus === "waiting"} value={form.waitingOn} onChange={(e) => setForm({ ...form, waitingOn: e.target.value })} placeholder="Person or team, or leave empty" />
            </div>
            {clients && (
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>No client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || form.title.trim().length < 2}>
            {pending && <Loader2 className="animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
