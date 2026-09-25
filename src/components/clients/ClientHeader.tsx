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
import { HealthMark } from "@/components/aurora/HealthMark";
import { DaysFigure } from "@/components/aurora/DaysFigure";
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

  const left = client.phaseTargetDate ? daysUntil(client.phaseTargetDate) : null;
  const slip = client.phaseTargetOriginal && client.phaseTargetDate ? delayText(client.phaseTargetOriginal, client.phaseTargetDate) : "";

  return (
    <header className="border-b border-ink pb-7">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
        <span className="num">{client.code}</span>
        {client.system && <span>{client.system}</span>}
        {client.archivedAt && <Badge>Archived</Badge>}
      </div>

      <div className="mt-2 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="serif text-[40px] leading-[1.02] text-text sm:text-[56px]">{client.name}</h1>
          {client.fullName && client.fullName !== client.name && <p className="mt-2 text-[14px] text-muted">{client.fullName}</p>}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px]">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1 text-text underline decoration-border-strong underline-offset-4 hover:decoration-text" disabled={pending}>
                  {phaseLabel(client.phase)} <ChevronDown className="size-3.5 text-muted" />
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="inline-flex items-center gap-1" aria-label="Change health" disabled={pending}>
                  <HealthMark health={client.health} className="text-[14px]" />
                  <ChevronDown className="size-3.5 text-muted" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Health</DropdownMenuLabel>
                <DropdownMenuRadioGroup value={client.health} onValueChange={(v) => patch({ health: v }, `Health: ${HEALTH[v as Client["health"]].label}`)}>
                  {(Object.keys(HEALTH) as Client["health"][]).map((k) => (
                    <DropdownMenuRadioItem key={k} value={k}>
                      <HealthMark health={k} className="font-normal" />
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <span className="text-muted">Owner {client.owner}</span>
          </div>

          <div className="mt-7 max-w-2xl">
            <p className="label mb-1.5">Next step</p>
            {editingNext ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <Textarea
                  autoFocus
                  value={nextDraft}
                  onChange={(e) => setNextDraft(e.target.value)}
                  className="min-h-[72px]"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditingNext(false);
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      patch({ nextStep: nextDraft }, "Next step saved");
                      setEditingNext(false);
                    }
                  }}
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    onClick={() => {
                      patch({ nextStep: nextDraft }, "Next step saved");
                      setEditingNext(false);
                    }}
                    disabled={pending}
                  >
                    <Check /> Save
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingNext(false);
                      setNextDraft(client.nextStep ?? "");
                    }}
                  >
                    <X />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setNextDraft(client.nextStep ?? "");
                  setEditingNext(true);
                }}
                className="group flex items-start gap-2 text-left"
              >
                <span className={cn("serif text-[22px] leading-snug", client.nextStep ? "text-text" : "text-faint")}>{client.nextStep || "Set the next step"}</span>
                <Pencil className="mt-2 size-3.5 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 lg:w-[260px]">
          <div className="flex items-center gap-2 lg:justify-end">
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

          <div className="mt-5 border-t border-border pt-4">
            <p className="label">Current phase</p>
            {left !== null ? (
              <DaysFigure daysLeft={left} size="lg" className="mt-1" />
            ) : (
              <button type="button" className="mt-1 text-[14px] text-text underline decoration-border-strong underline-offset-4 hover:decoration-text" onClick={() => setEdit(true)}>
                Set a target date
              </button>
            )}
            <p className="num mt-2 text-[12px] text-muted">
              {client.phaseStartDate ? formatDate(client.phaseStartDate) : "Start not set"} to {client.phaseTargetDate ? formatDate(client.phaseTargetDate) : "target not set"}
            </p>
            {slip && (
              <p className="mt-1 text-[12px] text-warn">
                Originally {formatDate(client.phaseTargetOriginal!)}, moved by {slip}
              </p>
            )}
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
