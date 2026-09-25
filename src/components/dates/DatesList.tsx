"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { MilestoneType } from "@/lib/db/schema";
import type { MilestoneWithClient } from "@/lib/data/milestones";
import { createMilestoneAction, deleteMilestoneAction, updateMilestoneAction } from "@/actions/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { addDaysISO, daysUntil, delayText, formatDate, todayISO } from "@/lib/core/dates";
import type { NavClient } from "@/components/shell/nav";
import { Panel } from "@/components/aurora/Panel";
import { DaysFigure } from "@/components/aurora/DaysFigure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Group = { key: string; title: string; items: MilestoneWithClient[] };

function groupByWindow(rows: MilestoneWithClient[], today: string): Group[] {
  const weekEnd = addDaysISO(today, 7);
  const twoWeeks = addDaysISO(today, 14);
  const month = addDaysISO(today, 30);
  const g: Record<string, MilestoneWithClient[]> = { overdue: [], week: [], next: [], month: [], later: [] };
  for (const m of rows) {
    if (m.date < today) g.overdue.push(m);
    else if (m.date <= weekEnd) g.week.push(m);
    else if (m.date <= twoWeeks) g.next.push(m);
    else if (m.date <= month) g.month.push(m);
    else g.later.push(m);
  }
  return [
    { key: "overdue", title: "Overdue", items: g.overdue },
    { key: "week", title: "Next 7 days", items: g.week },
    { key: "next", title: "The week after", items: g.next },
    { key: "month", title: "Within 30 days", items: g.month },
    { key: "later", title: "Later", items: g.later },
  ];
}

export function DatesList({ rows, clients }: { rows: MilestoneWithClient[]; clients: NavClient[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<MilestoneWithClient | null>(null);
  const [form, setForm] = useState({ clientId: clients[0]?.id ?? "", title: "", type: "target" as MilestoneType, date: "" });
  const [move, setMove] = useState({ date: "", reason: "" });
  const today = todayISO();
  const groups = groupByWindow(rows, today);

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
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted">{rows.length} open dates across {new Set(rows.map((r) => r.clientId)).size} clients</p>
        <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
          <CalendarPlus /> Add date
        </Button>
      </div>

      {rows.length === 0 && <p className="py-3 text-[14px] text-muted">No open dates. Add one or set them on a client page.</p>}

      {groups.map((grp) =>
        grp.items.length === 0 ? null : (
          <Panel key={grp.key} title={grp.title} aside={String(grp.items.length)}>
            <ul>
              {grp.items.map((m) => {
                const slip = delayText(m.originalDate, m.date);
                return (
                  <li key={m.id} className="flex items-start gap-4 border-b border-border py-3 last:border-0">
                    <span className="num w-[86px] shrink-0 pt-[3px] text-[12px] text-muted">{formatDate(m.date, false)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[15px] text-text">
                        {m.title}
                        <Badge>{MILESTONE_TYPES[m.type].label}</Badge>
                        {slip && <Badge tone="warn">Moved by {slip}</Badge>}
                      </p>
                      <p className="mt-0.5 text-[12px] text-muted">
                        <Link href={`/clients/${m.client.id}?tab=dates`} className="hover:underline">
                          {m.client.name}
                        </Link>
                        {m.dateHistory.at(-1)?.reason ? `. Last move: ${m.dateHistory.at(-1)!.reason}` : ""}
                      </p>
                    </div>
                    <DaysFigure daysLeft={daysUntil(m.date)} size="sm" className="pt-0.5" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Options" disabled={pending}>
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setMoving(m);
                            setMove({ date: m.date, reason: "" });
                          }}
                        >
                          Move date
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => run(() => updateMilestoneAction(m.id, { status: "done" }), `${m.title} done`)}>Mark done</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => run(() => updateMilestoneAction(m.id, { status: "cancelled" }))}>Cancel</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem danger onSelect={() => run(() => deleteMilestoneAction(m.id))}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                );
              })}
            </ul>
          </Panel>
        ),
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a date</DialogTitle>
            <DialogDescription>The first date becomes the baseline. Moving it later shows the delay.</DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Select value={form.clientId} onValueChange={(v) => setForm({ ...form, clientId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !form.clientId || !form.title.trim() || !form.date}
              onClick={() =>
                run(async () => {
                  const res = await createMilestoneAction({ clientId: form.clientId, title: form.title.trim(), type: form.type, date: form.date });
                  if (res.ok) {
                    setAdding(false);
                    setForm({ ...form, title: "", date: "" });
                  }
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
              {moving?.client.name}. Currently {moving ? formatDate(moving.date) : ""}, baseline {moving ? formatDate(moving.originalDate) : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="space-y-1.5">
              <Label>New date</Label>
              <Input type="date" autoFocus value={move.date} onChange={(e) => setMove({ ...move, date: e.target.value })} />
              {moving && move.date && delayText(moving.originalDate, move.date) && <p className="text-xs text-warn">{delayText(moving.originalDate, move.date)} against the baseline.</p>}
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
