"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, ChevronDown, Loader2, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/db/schema";
import { archiveClientAction, deleteClientAction, updateClientAction } from "@/actions/clients";
import { HEALTH, PHASES, phaseLabel } from "@/lib/core/constants";
import { daysUntil, delayText, formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HealthOrb } from "@/components/aurora/HealthOrb";
import { CountdownRing } from "@/components/aurora/CountdownRing";
import { ClientForm } from "./ClientForm";
import { cn } from "@/lib/utils";

export function ClientHeader({ client }: { client: Client }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [edit, setEdit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingNext, setEditingNext] = useState(false);
  const [nextDraft, setNextDraft] = useState(client.nextStep ?? "");

  function patch(values: Record<string, unknown>, done?: string) {
    start(async () => {
      const res = await updateClientAction(client.id, values);
      if (!res.ok) toast.error(res.error);
      else {
        if (done) toast.success(done);
        router.refresh();
      }
    });
  }

  const hasDates = client.phaseStartDate && client.phaseTargetDate;
  const totalDays = hasDates ? Math.max(1, daysUntil(client.phaseTargetDate!) - daysUntil(client.phaseStartDate!)) : 30;
  const left = client.phaseTargetDate ? daysUntil(client.phaseTargetDate) : null;
  const slip = client.phaseTargetOriginal && client.phaseTargetDate ? delayText(client.phaseTargetOriginal, client.phaseTargetDate) : "";
  const hue = client.color ?? "200";

  return (
    <header className="glass relative overflow-hidden p-5 sm:p-6" style={{ ["--hue" as string]: hue }}>
      <span className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full opacity-25 blur-3xl" style={{ background: `hsl(${hue} 80% 60%)` }} />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] text-muted">{client.code}</span>
            {client.system && <span className="text-xs text-muted">{client.system}</span>}
            {client.archivedAt && <Badge>Archived</Badge>}
            {client.demoStatus && <Badge tone="violet">Demo status</Badge>}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="group flex items-center gap-2 rounded-full pr-1 outline-none" aria-label="Change health" disabled={pending}>
                  <HealthOrb health={client.health} size="xl" />
                  <ChevronDown className="size-3.5 text-muted opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Health</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={client.health} onValueChange={(v) => patch({ health: v }, `Health: ${HEALTH[v as Client["health"]].label}`)}>
                  {Object.entries(HEALTH).map(([k, v]) => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      <span className="flex items-center gap-2">
                        <span className={cn("orb !size-2.5", `orb-${v.css}`)} /> {v.label}
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="font-display truncate text-[30px] font-semibold leading-none sm:text-[38px]">{client.name}</h1>
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 text-sm text-muted">
            {client.fullName && client.fullName !== client.name && <span>{client.fullName}</span>}
            <span>Owner: {client.owner}</span>
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="pill pill-teal transition hover:brightness-110" disabled={pending}>
                  {phaseLabel(client.phase)} <ChevronDown className="size-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Phase</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={client.phase} onValueChange={(v) => patch({ phase: v }, `Phase: ${phaseLabel(v)}`)}>
                  {PHASES.map((p) => (
                    <DropdownMenuRadioItem key={p.value} value={p.value}>
                      {p.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <span className={cn("pill", `pill-${HEALTH[client.health].css}`)}>{HEALTH[client.health].label}</span>
            {slip && <span className="pill pill-warn">Target delayed: {slip}</span>}
          </div>

          <div className="mt-5">
            <p className="mb-1.5 text-xs font-medium text-muted">Next step</p>
            {editingNext ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Textarea autoFocus value={nextDraft} onChange={(e) => setNextDraft(e.target.value)} className="min-h-[64px] max-w-xl" onKeyDown={(e) => { if (e.key === "Escape") setEditingNext(false); if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { patch({ nextStep: nextDraft }, "Next step saved"); setEditingNext(false); } }} />
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => { patch({ nextStep: nextDraft }, "Next step saved"); setEditingNext(false); }} disabled={pending}>
                    <Check /> Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingNext(false); setNextDraft(client.nextStep ?? ""); }}>
                    <X />
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setNextDraft(client.nextStep ?? ""); setEditingNext(true); }} className="group flex max-w-xl items-start gap-2 text-left">
                <span className={cn("text-[15px] leading-snug", client.nextStep ? "text-text" : "text-faint")}>{client.nextStep || "Set the next step"}</span>
                <Pencil className="mt-1 size-3.5 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col gap-4 lg:items-end">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEdit(true)}>
              <Pencil /> Edit
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="More">
                  More <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    start(async () => {
                      const res = await archiveClientAction(client.id, !client.archivedAt);
                      if (!res.ok) toast.error(res.error);
                      else {
                        toast.success(client.archivedAt ? "Client restored" : "Client archived");
                        router.refresh();
                      }
                    })
                  }
                >
                  {client.archivedAt ? <ArchiveRestore /> : <Archive />} {client.archivedAt ? "Restore" : "Archive"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem danger onSelect={() => setConfirmDelete(true)}>
                  <Trash2 /> Delete permanently
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="glass-inset flex items-center gap-4 p-3.5">
            {left !== null ? <CountdownRing daysLeft={left} span={totalDays} size={64} stroke={5} caption="days" /> : <div className="flex size-16 items-center justify-center rounded-full border border-dashed border-border-strong text-[10px] text-faint">no target</div>}
            <div className="text-sm">
              <p className="text-xs font-medium text-muted">Current phase</p>
              <p className="mt-1 text-text">
                <span className="num">{client.phaseStartDate ? formatDate(client.phaseStartDate) : "Start not set"}</span>
                <span className="text-muted"> to </span>
                <span className="num">{client.phaseTargetDate ? formatDate(client.phaseTargetDate) : "Target not set"}</span>
              </p>
              {slip && <p className="mt-0.5 text-[11px] text-warn">Originally {formatDate(client.phaseTargetOriginal!)}</p>}
              {!hasDates && (
                <button type="button" className="mt-1 text-[11px] text-teal hover:underline" onClick={() => setEdit(true)}>
                  Set phase dates
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <ClientForm open={edit} onOpenChange={setEdit} client={client} />

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {client.name}?</DialogTitle>
            <DialogDescription>This removes the client and everything linked to it: activities, dates, tasks, people and documents. Archive instead if you may need the history.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await deleteClientAction(client.id);
                  if (!res.ok) toast.error(res.error);
                  else {
                    toast.success("Client deleted");
                    router.push("/clients");
                    router.refresh();
                  }
                })
              }
            >
              {pending && <Loader2 className="animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
