"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import { assignMeetingAction, createClientAndAssignAction } from "@/actions/meetingIntel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * One click per client, Other Work, or a new client made on the spot. Used in the Needs review inbox
 * and on the meeting page. Every choice reruns the pipeline with that context.
 */
export function AssignClient({ meetingId, clients, current, compact = false, onDone }: { meetingId: string; clients: NavClient[]; current?: { clientId: string | null; otherWork: boolean }; compact?: boolean; onDone?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", code: "" });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        toast.success(done);
        onDone?.();
        router.refresh();
      }
    });
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", pending && "opacity-60")}>
      {clients.map((c) => {
        const active = current?.clientId === c.id;
        return (
          <Button key={c.id} size="sm" variant={active ? "primary" : "secondary"} className={cn(compact && "h-7 px-2 text-[12px]")} disabled={pending || active} onClick={() => run(() => assignMeetingAction(meetingId, { clientId: c.id }), `Moved to ${c.name}. Minutes are being redrafted.`)}>
            {c.code}
          </Button>
        );
      })}
      <Button size="sm" variant={current?.otherWork ? "primary" : "secondary"} className={cn(compact && "h-7 px-2 text-[12px]")} disabled={pending || current?.otherWork} onClick={() => run(() => assignMeetingAction(meetingId, { otherWork: true }), "Filed under Other Work")}>
        Other Work
      </Button>
      <Button size="sm" variant="ghost" className={cn(compact && "h-7 px-2 text-[12px]")} disabled={pending} onClick={() => setCreating(true)}>
        New client
      </Button>
      {pending && <Loader2 className="size-3.5 animate-spin text-muted" />}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New client</DialogTitle>
            <DialogDescription>Creates the client and moves this meeting there. You can fill in the rest on the client page.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input autoFocus value={form.name} placeholder="Etihad Rail TMS" onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input value={form.code} placeholder="ERAIL" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || form.name.trim().length < 2 || form.code.trim().length < 2}
              onClick={() =>
                run(async () => {
                  const res = await createClientAndAssignAction(meetingId, { name: form.name.trim(), code: form.code.trim() });
                  if (res.ok) setCreating(false);
                  return res;
                }, `${form.name.trim()} created, meeting moved`)
              }
            >
              {pending && <Loader2 className="animate-spin" />} Create and move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
