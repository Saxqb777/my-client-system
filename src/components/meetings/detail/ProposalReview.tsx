"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { PendingProposal } from "@/lib/db/schema";
import { applyProposalAction } from "@/actions/meetingIntel";
import { HEALTH, MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("flex size-4 shrink-0 items-center justify-center rounded-[3px] border", checked ? "border-ink bg-ink" : "border-border-strong")}>
      {checked && <span className="block size-2 bg-paper" />}
    </button>
  );
}

/**
 * What Claude proposed beyond the minutes: follow ups, date moves, health, next step, notes.
 * Tick and apply. Phase 2 applies the clear ones by itself and logs them with Undo.
 */
export function ProposalReview({ meetingId, proposal, hasClient }: { meetingId: string; proposal: PendingProposal; hasClient: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [accept, setAccept] = useState({ tasks: proposal.tasks.map(() => true), dateChanges: proposal.dateChanges.map(() => true), health: true, nextStep: true, notes: Boolean(proposal.notesUpdate) });
  const reviewed = Boolean(proposal.reviewedAt);
  const nothing = proposal.tasks.length + proposal.dateChanges.length === 0 && !proposal.health && !proposal.nextStep && !proposal.notesUpdate;

  function apply() {
    start(async () => {
      const res = await applyProposalAction(meetingId, accept);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Applied", { description: res.data.lines.slice(1, 4).join(". ") });
        router.refresh();
      }
    });
  }

  if (nothing) return <p className="py-3 text-[14px] text-muted">Nothing to apply from this meeting beyond the minutes.</p>;

  return (
    <div className="space-y-6">
      {reviewed && <p className="text-[13px] text-muted">Applied on {formatDate(proposal.reviewedAt!.slice(0, 10))}. Applying again only adds what is ticked.</p>}
      {!hasClient && <p className="text-[13px] text-warn">This meeting has no client, so dates, health and next step cannot be applied. Tasks still can.</p>}

      {proposal.tasks.length > 0 && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Follow ups for you, ticked ones become tasks</h3>
          <ul className="divide-y divide-border">
            {proposal.tasks.map((t, i) => (
              <li key={i} className="flex items-start gap-3 py-2 text-[14px]">
                <Check checked={accept.tasks[i]} onChange={(v) => setAccept({ ...accept, tasks: accept.tasks.map((x, j) => (j === i ? v : x)) })} />
                <div>
                  <p className="text-text">{t.title}</p>
                  <p className="text-[12px] text-muted">
                    {t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No date"}
                    {t.waitingOn ? `, waiting on ${t.waitingOn}` : ""}
                    {t.priority !== "normal" ? `, ${t.priority}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposal.dateChanges.length > 0 && hasClient && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Dates mentioned</h3>
          <ul className="divide-y divide-border">
            {proposal.dateChanges.map((d, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-[14px]">
                <Check checked={accept.dateChanges[i]} onChange={(v) => setAccept({ ...accept, dateChanges: accept.dateChanges.map((x, j) => (j === i ? v : x)) })} />
                <span>
                  {d.title ?? MILESTONE_TYPES[d.type as keyof typeof MILESTONE_TYPES]?.label ?? d.type}
                  {d.newDate ? `: move to ${formatDate(d.newDate)}` : ""}
                  {d.markDone ? ", mark done" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(proposal.health || proposal.nextStep) && hasClient && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Client status</h3>
          <ul className="divide-y divide-border text-[14px]">
            {proposal.health && (
              <li className="flex items-start gap-3 py-2">
                <Check checked={accept.health} onChange={(v) => setAccept({ ...accept, health: v })} />
                <span>
                  Health to <span className="font-medium">{HEALTH[proposal.health].label}</span>
                  {proposal.healthReason ? <span className="text-muted">. {proposal.healthReason}</span> : null}
                </span>
              </li>
            )}
            {proposal.nextStep && (
              <li className="flex items-start gap-3 py-2">
                <Check checked={accept.nextStep} onChange={(v) => setAccept({ ...accept, nextStep: v })} />
                <span>Next step: {proposal.nextStep}</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {proposal.notesUpdate && hasClient && (
        <section>
          <h3 className="label mb-1 flex items-center gap-3 border-b border-border pb-1">
            <Check checked={accept.notes} onChange={(v) => setAccept({ ...accept, notes: v })} /> Update the client notes with what this meeting taught
          </h3>
          <p className={cn("whitespace-pre-wrap py-2 text-[13px] leading-relaxed text-text-2", !accept.notes && "opacity-50")}>{proposal.notesUpdate}</p>
        </section>
      )}

      {proposal.openQuestions.length > 0 && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Unclear in the transcript</h3>
          <ul className="list-disc space-y-1 py-2 pl-5 text-[13px] text-text-2">
            {proposal.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex justify-end border-t border-border pt-3">
        <Button onClick={apply} disabled={pending}>
          {pending && <Loader2 className="animate-spin" />} Apply ticked items
        </Button>
      </div>
    </div>
  );
}
