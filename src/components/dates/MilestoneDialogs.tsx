"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Milestone, MilestoneType } from "@/lib/db/schema";
import { createMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { delayText, formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Add a date for one client. Mount with a `key` that changes per opening so the form starts fresh. */
export function AddDateDialog({ open, onOpenChange, clientId, clientName, initialDate = "" }: { open: boolean; onOpenChange: (v: boolean) => void; clientId: string; clientName: string; initialDate?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ title: "", type: "target" as MilestoneType, date: initialDate });
  function save() {
    start(async () => {
      const res = await createMilestoneAction({ clientId, title: form.title.trim(), type: form.type, date: form.date });
      if (!res.ok) toast.error(res.error ?? "Could not add the date");
      else {
        toast.success("Date added");
        onOpenChange(false);
        router.refresh();
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a date</DialogTitle>
          <DialogDescription>{clientName}. The first date becomes the baseline, moving it later shows the delay.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="UAT sign off" />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as MilestoneType, title: form.title || MILESTONE_TYPES[v as MilestoneType].label })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(MILESTONE_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Date</Label>
            <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !form.title.trim() || !form.date} onClick={save}>
            {pending && <Loader2 className="animate-spin" />} Add date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Move a date with a reason. Mount with a `key` per opening. */
export function MoveDateDialog({ milestone, clientName, open, onOpenChange, initialDate }: { milestone: Milestone; clientName: string; open: boolean; onOpenChange: (v: boolean) => void; initialDate?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [move, setMove] = useState({ date: initialDate ?? milestone.date, reason: "" });
  const slip = move.date ? delayText(milestone.originalDate, move.date) : "";
  function save() {
    start(async () => {
      const res = await updateMilestoneAction(milestone.id, { date: move.date, reason: move.reason.trim() || null });
      if (!res.ok) toast.error(res.error ?? "Could not move the date");
      else {
        toast.success(`${milestone.title} moved to ${formatDate(move.date)}`);
        onOpenChange(false);
        router.refresh();
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {milestone.title}</DialogTitle>
          <DialogDescription>
            {clientName}. Currently {formatDate(milestone.date)}, baseline {formatDate(milestone.originalDate)}.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <div className="space-y-1.5">
            <Label>New date</Label>
            <Input type="date" autoFocus value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} />
            {slip && <p className="text-xs text-warn">{slip} against the baseline.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Textarea value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} placeholder="Client SME availability" className="min-h-[64px]" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={pending || !move.date || move.date === milestone.date} onClick={save}>
            {pending && <Loader2 className="animate-spin" />} Move date
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
