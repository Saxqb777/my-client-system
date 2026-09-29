"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Evidence, PendingProposal } from "@/lib/db/schema";
import type { ChangeWithLinks } from "@/lib/data/changeLog";
import { applyProposalAction } from "@/actions/meetingIntel";
import { HEALTH, MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate, formatDateTime } from "@/lib/core/dates";
import { evidenceGap } from "@/lib/meetings/evidence";
import { clock } from "@/lib/meetings/transcript";
import { ChangeRow } from "@/components/changes/ChangeList";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("mt-[3px] flex size-4 shrink-0 items-center justify-center rounded-[3px] border", checked ? "border-ink bg-ink" : "border-border-strong")}>
      {checked && <span className="block size-2 bg-paper" />}
    </button>
  );
}

/** The quote behind a held item, why it was held, and a jump into the transcript. */
function Why({ evidence, transcript, onSeek }: { evidence: Evidence | null | undefined; transcript: string; onSeek: (s: number) => void }) {
  const gap = evidenceGap(evidence, transcript);
  return (
    <p className="mt-0.5 text-[12px] text-muted">
      {evidence?.quote ? (
        <>
          <span className="serif-italic text-[13px] text-text-2">&ldquo;{evidence.quote}&rdquo;</span>
          {evidence.at !== null && evidence.at !== undefined && (
            <button type="button" onClick={() => onSeek(evidence.at!)} className="num ml-2 text-[11px] underline decoration-border-strong underline-offset-2 hover:text-text">
              {clock(evidence.at)}
            </button>
          )}
        </>
      ) : null}
      {gap ? <span className={cn(evidence?.quote ? "ml-2" : "")}>Held for you: {gap}.</span> : null}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Review tab. Top: what Orbit already applied from this meeting, each with Undo. Below: what it held because the
 * evidence rule did not pass or the client was not confirmed. Tick and apply; the same path logs the change.
 */
export function ProposalReview({ meetingId, proposal, hasClient, changes, transcript, onSeek }: { meetingId: string; proposal: PendingProposal; hasClient: boolean; changes: ChangeWithLinks[]; transcript: string; onSeek: (s: number) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const risks = proposal.risks ?? [];
  const doneItems = proposal.doneItems ?? [];
  const phase = proposal.phaseDates && (proposal.phaseDates.startDate || proposal.phaseDates.targetDate) ? proposal.phaseDates : null;
  const [accept, setAccept] = useState({
    tasks: proposal.tasks.map(() => true),
    dateChanges: proposal.dateChanges.map(() => true),
    health: Boolean(proposal.health),
    nextStep: Boolean(proposal.nextStep),
    phaseDates: Boolean(phase),
    risks: risks.map(() => true),
    doneItems: doneItems.map(() => true),
    notes: Boolean(proposal.notesUpdate),
  });
  const heldCount = proposal.tasks.length + proposal.dateChanges.length + risks.length + doneItems.length + (proposal.health ? 1 : 0) + (proposal.nextStep ? 1 : 0) + (phase ? 1 : 0) + (proposal.notesUpdate ? 1 : 0);
  const reviewed = Boolean(proposal.reviewedAt);

  function apply() {
    start(async () => {
      const res = await applyProposalAction(meetingId, accept);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(res.data.lines.length ? "Applied" : "Nothing ticked", { description: res.data.lines.slice(0, 3).join(". ") });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-8">
      {changes.length > 0 && (
        <Section title={`Applied by Orbit, ${changes.length}`}>
          <p className="py-1 text-[12px] text-muted">Each one had a quote and a time in the transcript. Undo puts the old value back.</p>
          <ul>
            {changes.map((c) => (
              <ChangeRow key={c.id} change={c} showClient={false} showMeeting={false} compact />
            ))}
          </ul>
        </Section>
      )}
      {proposal.autoApplied && changes.length === 0 && heldCount === 0 && <p className="py-3 text-[14px] text-muted">Nothing to apply from this meeting beyond the minutes.</p>}
      {!proposal.autoApplied && heldCount === 0 && <p className="py-3 text-[14px] text-muted">Nothing to apply from this meeting beyond the minutes.</p>}

      {heldCount > 0 && (
        <div className="space-y-6">
          <p className="text-[13px] text-muted">
            Held for you{reviewed ? `, last reviewed ${formatDateTime(proposal.reviewedAt!)}` : ""}. Tick what should apply.
            {!hasClient ? " This meeting has no client, so only tasks can apply." : ""}
          </p>

          {proposal.tasks.length > 0 && (
            <Section title="Follow ups for you">
              <ul className="divide-y divide-border">
                {proposal.tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-3 py-2 text-[14px]">
                    <Check checked={accept.tasks[i]} onChange={(v) => setAccept({ ...accept, tasks: accept.tasks.map((x, j) => (j === i ? v : x)) })} />
                    <div className="min-w-0">
                      <p className="text-text">{t.title}</p>
                      <p className="text-[12px] text-muted">
                        {t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No date"}
                        {t.waitingOn ? `, waiting on ${t.waitingOn}` : ""}
                        {t.priority !== "normal" ? `, ${t.priority}` : ""}
                      </p>
                      <Why evidence={t.evidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {proposal.dateChanges.length > 0 && hasClient && (
            <Section title="Dates mentioned">
              <ul className="divide-y divide-border">
                {proposal.dateChanges.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 py-2 text-[14px]">
                    <Check checked={accept.dateChanges[i]} onChange={(v) => setAccept({ ...accept, dateChanges: accept.dateChanges.map((x, j) => (j === i ? v : x)) })} />
                    <div className="min-w-0">
                      <p className="text-text">
                        {d.title ?? MILESTONE_TYPES[d.type as keyof typeof MILESTONE_TYPES]?.label ?? d.type}
                        {d.newDate ? `: move to ${formatDate(d.newDate)}` : ""}
                        {d.markDone ? ", mark done" : ""}
                      </p>
                      <Why evidence={d.evidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {(proposal.health || proposal.nextStep || phase) && hasClient && (
            <Section title="Client status">
              <ul className="divide-y divide-border text-[14px]">
                {proposal.health && (
                  <li className="flex items-start gap-3 py-2">
                    <Check checked={accept.health} onChange={(v) => setAccept({ ...accept, health: v })} />
                    <div className="min-w-0">
                      <p>
                        Health to <span className="font-medium">{HEALTH[proposal.health].label}</span>
                        {proposal.healthReason ? <span className="text-muted">. {proposal.healthReason}</span> : null}
                      </p>
                      <Why evidence={proposal.healthEvidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                )}
                {proposal.nextStep && (
                  <li className="flex items-start gap-3 py-2">
                    <Check checked={accept.nextStep} onChange={(v) => setAccept({ ...accept, nextStep: v })} />
                    <div className="min-w-0">
                      <p>Next step: {proposal.nextStep}</p>
                      <Why evidence={proposal.nextStepEvidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                )}
                {phase && (
                  <li className="flex items-start gap-3 py-2">
                    <Check checked={accept.phaseDates} onChange={(v) => setAccept({ ...accept, phaseDates: v })} />
                    <div className="min-w-0">
                      <p>
                        {phase.startDate ? `Phase start ${formatDate(phase.startDate)}` : ""}
                        {phase.startDate && phase.targetDate ? ", " : ""}
                        {phase.targetDate ? `phase target ${formatDate(phase.targetDate)}` : ""}
                      </p>
                      <Why evidence={phase.evidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                )}
              </ul>
            </Section>
          )}

          {risks.length > 0 && hasClient && (
            <Section title="Risks and delays">
              <ul className="divide-y divide-border">
                {risks.map((r, i) => (
                  <li key={i} className="flex items-start gap-3 py-2 text-[14px]">
                    <Check checked={accept.risks[i]} onChange={(v) => setAccept({ ...accept, risks: accept.risks.map((x, j) => (j === i ? v : x)) })} />
                    <div className="min-w-0">
                      <p className={r.status === "resolved" ? "text-text" : "text-warn"}>
                        {r.status === "resolved" ? "Resolved: " : ""}
                        {r.text}
                      </p>
                      <Why evidence={r.evidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {doneItems.length > 0 && hasClient && (
            <Section title="Reported done">
              <ul className="divide-y divide-border">
                {doneItems.map((d, i) => (
                  <li key={i} className="flex items-start gap-3 py-2 text-[14px]">
                    <Check checked={accept.doneItems[i]} onChange={(v) => setAccept({ ...accept, doneItems: accept.doneItems.map((x, j) => (j === i ? v : x)) })} />
                    <div className="min-w-0">
                      <p className="text-text">{d.text}</p>
                      <Why evidence={d.evidence} transcript={transcript} onSeek={onSeek} />
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {proposal.notesUpdate && hasClient && (
            <Section title="Client notes">
              <label className="flex items-start gap-3 py-2 text-[13px] text-muted">
                <Check checked={accept.notes} onChange={(v) => setAccept({ ...accept, notes: v })} /> Replace the client notes with this rewrite. Notes never change by themselves.
              </label>
              <p className={cn("whitespace-pre-wrap py-1 text-[13px] leading-relaxed text-text-2", !accept.notes && "opacity-50")}>{proposal.notesUpdate}</p>
            </Section>
          )}

          <div className="flex justify-end border-t border-border pt-3">
            <Button onClick={apply} disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} Apply ticked items
            </Button>
          </div>
        </div>
      )}

      {proposal.openQuestions.length > 0 && (
        <Section title="Unclear in the transcript">
          <ul className="list-disc space-y-1 py-2 pl-5 text-[13px] text-text-2">
            {proposal.openQuestions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
