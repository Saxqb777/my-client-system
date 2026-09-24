"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Check, History, Loader2, MoreHorizontal, MoveRight, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Milestone, MilestoneType } from "@/lib/db/schema";
import { createMilestoneAction, deleteMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { countdownLabel, daysUntil, delayText, formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CountdownRing } from "@/components/aurora/CountdownRing";
import { EmptyState } from "@/components/aurora/EmptyState";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function MilestonesPanel({ clientId, milestones }: { clientId: string; milestones: Milestone[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<Milestone | null>(null);
  const [form, setForm] = useState({ title: "", type: "target" as MilestoneType, date: "" });
  const [move, setMove] = useState({ date: "", reason: "" });

  const upcoming = milestones.filter((m) => m.status === "upcoming" || m.status === "missed").sort((a, b) => a.date.localeCompare(b.date));
  const finished = milestones.filter((m) => m.status === "done" || m.status === "cancelled").sort((a, b) => b.date.localeCompare(a.date));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {upcoming.length} upcoming · {finished.length} done
        </p>
        <Button size="sm" variant="secondary" onClick={() => { setForm({ title: "", type: "target", date: "" }); setAdding(true); }}>
          <CalendarPlus /> Add date
        </Button>
      </div>

      {milestones.length === 0 ? (
        <EmptyState title="No dates yet" hint="Add target, SIT, UAT, go live and system dates. Orbit counts down to each and flags slips." compact />
      ) : (
        <>
          <ul className="space-y-2">
            {upcoming.map((m) => (
              <Row key={m.id} m={m} onMove={() => { setMoving(m); setMove({ date: m.date, reason: "" }); }} onDone={() => run(() => updateMilestoneAction(m.id, { status: "done" }), `${m.title} done`)} onDelete={() => run(() => deleteMilestoneAction(m.id))} onCancel={() => run(() => updateMilestoneAction(m.id, { status: "cancelled" }))} />
            ))}
          </ul>
          {finished.length > 0 && (
            <div>
              <p className="eyebrow mb-2">Completed</p>
              <ul className="space-y-2 opacity-80">
                {finished.map((m) => (
                  <Row key={m.id} m={m} onReopen={() => run(() => updateMilestoneAction(m.id, { status: "upcoming" }))} onDelete={() => run(() => deleteMilestoneAction(m.id))} />
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a date</DialogTitle>
            <DialogDescription>The first date you set becomes the baseline. Moving it later shows the delay.</DialogDescription>
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
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} min="2000-01-01" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !form.title.trim() || !form.date}
              onClick={() =>
                run(async () => {
                  const res = await createMilestoneAction({ clientId, title: form.title.trim(), type: form.type, date: form.date });
                  if (res.ok) setAdding(false);
                  return res;
                }, "Date added")
              }
            >
              {pending && <Loader2 className="animate-spin" />} Add date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(moving)} onOpenChange={(v) => !v && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move {moving?.title}</DialogTitle>
            <DialogDescription>
              Currently {moving ? formatDate(moving.date) : ""}. Original baseline {moving ? formatDate(moving.originalDate) : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="space-y-1.5">
              <Label>New date</Label>
              <Input type="date" autoFocus value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} />
              {moving && move.date && delayText(moving.originalDate, move.date) && (
                <p className="text-xs text-warn">Delayed {delayText(moving.originalDate, move.date)} against the original date.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={move.reason} onChange={(e) => setMove({ ...move, reason: e.target.value })} placeholder="Client SME availability" className="min-h-[64px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !move.date || move.date === moving?.date}
              onClick={() =>
                run(async () => {
                  const res = await updateMilestoneAction(moving!.id, { date: move.date, reason: move.reason || null });
                  if (res.ok) setMoving(null);
                  return res;
                }, "Date moved")
              }
            >
              {pending && <Loader2 className="animate-spin" />} Move date
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ m, onMove, onDone, onReopen, onCancel, onDelete }: { m: Milestone; onMove?: () => void; onDone?: () => void; onReopen?: () => void; onCancel?: () => void; onDelete: () => void }) {
  const done = m.status === "done";
  const days = daysUntil(m.date);
  const slip = delayText(m.originalDate, m.date);
  const moves = m.dateHistory.length;
  return (
    <li className={cn("glass-inset flex items-center gap-3 p-3", m.status === "cancelled" && "opacity-60")}>
      <CountdownRing daysLeft={days} span={30} size={52} done={done} caption={done ? undefined : "days"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn("text-sm font-medium", done && "line-through text-muted")}>{m.title}</p>
          <Badge className="!py-0 !text-[11px]">{MILESTONE_TYPES[m.type].label}</Badge>
          {slip && !done && <Badge tone="warn" className="!py-0 !text-[11px]">Delayed: {slip}</Badge>}
          {m.status === "cancelled" && <Badge className="!py-0 !text-[11px]">Cancelled</Badge>}
          {m.isDemo && <span className="text-[10px] uppercase tracking-wider text-faint">demo</span>}
        </div>
        <p className="mt-0.5 text-[12px] text-muted">
          <span className="num">{formatDate(m.date)}</span>
          {!done && m.status !== "cancelled" && <span className={cn("ml-2", days < 0 ? "text-bad" : days <= 3 ? "text-warn" : "")}>{countdownLabel(m.date)}</span>}
          {moves > 0 && (
            <span className="ml-2 inline-flex items-center gap-1">
              <History className="size-3" /> moved {moves} {moves === 1 ? "time" : "times"} from {formatDate(m.originalDate)}
            </span>
          )}
        </p>
        {m.dateHistory.at(-1)?.reason && <p className="mt-0.5 text-[12px] text-text-2">Last move: {m.dateHistory.at(-1)!.reason}</p>}
      </div>
      <div className="flex items-center gap-1">
        {onDone && (
          <Button size="sm" variant="ghost" onClick={onDone} title="Mark done">
            <Check /> Done
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Options">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onMove && (
              <DropdownMenuItem onSelect={onMove}>
                <MoveRight /> Move date
              </DropdownMenuItem>
            )}
            {onReopen && (
              <DropdownMenuItem onSelect={onReopen}>
                <RotateCcw /> Reopen
              </DropdownMenuItem>
            )}
            {onCancel && <DropdownMenuItem onSelect={onCancel}>Cancel milestone</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem danger onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}
