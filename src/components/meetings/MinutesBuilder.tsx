"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import type { Meeting } from "@/lib/db/schema";
import type { MinutesPlan } from "@/lib/ai/mom";
import { buildMinutesAction, saveMinutesAction } from "@/actions/meetings";
import { HEALTH, MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate, formatDateTime } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Stage = "transcript" | "building" | "review";

/**
 * Paste or upload the transcript, let Claude draft the minutes in the client's format,
 * review every line, then save. Nothing lands in Orbit until Save.
 */
export function MinutesBuilder({ meeting, clientName, open, onOpenChange }: { meeting: Meeting; clientName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("transcript");
  const [transcript, setTranscript] = useState(meeting.rawNotes ?? "");
  const [plan, setPlan] = useState<MinutesPlan | null>(null);
  const [engine, setEngine] = useState<"claude" | "rules">("rules");
  const [accept, setAccept] = useState({ tasks: [] as boolean[], dateChanges: [] as boolean[], health: true, nextStep: true, notes: true });
  const [building, startBuild] = useTransition();
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function build() {
    setStage("building");
    startBuild(async () => {
      const res = await buildMinutesAction(meeting.id, transcript);
      if (!res.ok) {
        toast.error(res.error);
        setStage("transcript");
        return;
      }
      setPlan(res.data.plan);
      setEngine(res.data.engine);
      setAccept({ tasks: res.data.plan.tasks.map(() => true), dateChanges: res.data.plan.dateChanges.map(() => true), health: true, nextStep: true, notes: Boolean(res.data.plan.notesUpdate) });
      setStage("review");
    });
  }

  function save() {
    if (!plan) return;
    startSave(async () => {
      const res = await saveMinutesAction(meeting.id, plan, accept);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Minutes saved", { description: res.data.lines.slice(1, 4).join(". ") });
      onOpenChange(false);
      router.refresh();
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setTranscript((t) => (t.trim() ? `${t.trim()}\n\n${text}` : text));
  }

  const update = (patch: Partial<MinutesPlan>) => setPlan((p) => (p ? { ...p, ...patch } : p));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[760px]">
        <SheetHeader>
          <SheetTitle>{stage === "review" ? "Review the minutes" : "Minutes of meeting"}</SheetTitle>
          <SheetDescription>
            {clientName}, {meeting.title}, {formatDateTime(meeting.heldAt)}
          </SheetDescription>
        </SheetHeader>

        {stage !== "review" && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
            <p className="text-[13px] text-muted">Paste the transcript, your notes, or both. Teams and Zoom transcript files work as they are.</p>
            <Textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Paste here" className="min-h-[320px] flex-1 font-mono text-[12.5px] leading-relaxed" disabled={stage === "building"} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept=".txt,.vtt,.md,.srt,text/plain" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={stage === "building"}>
                  <Upload /> Upload a file
                </Button>
                <span className="num text-[12px] text-muted">{transcript.trim().length.toLocaleString()} characters</span>
              </div>
              <Button onClick={build} disabled={building || transcript.trim().length < 40}>
                {building ? <Loader2 className="animate-spin" /> : null} {building ? "Reading the transcript" : "Build the minutes"}
              </Button>
            </div>
          </div>
        )}

        {stage === "review" && plan && (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto pr-1">
            <p className="text-[12px] text-muted">{engine === "claude" ? "Drafted by Claude from the transcript. Edit anything, then save." : "Claude is not configured, so this is a skeleton in the client's format. Fill it in, then save."}</p>

            <Field label="Title">
              <Input value={plan.title} onChange={(e) => update({ title: e.target.value })} />
            </Field>

            <Field label="Minutes, in this client's format">
              <Textarea value={plan.mom} onChange={(e) => update({ mom: e.target.value })} className="min-h-[360px] text-[13.5px] leading-relaxed" />
            </Field>

            <Field label="Summary for the timeline">
              <Textarea value={plan.summary} onChange={(e) => update({ summary: e.target.value })} className="min-h-[56px]" />
            </Field>

            {plan.decisions.length > 0 && (
              <Field label={`Decisions, ${plan.decisions.length}`}>
                <EditableList items={plan.decisions} onChange={(decisions) => update({ decisions })} />
              </Field>
            )}

            {plan.actionItems.length > 0 && (
              <Field label={`Action items, ${plan.actionItems.length}`}>
                <ul className="divide-y divide-border border-y border-border">
                  {plan.actionItems.map((a, i) => (
                    <li key={i} className="grid gap-2 py-2 sm:grid-cols-[1fr_160px_130px]">
                      <Input value={a.text} onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                      <Input value={a.owner ?? ""} placeholder="Owner" onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, owner: e.target.value || null } : x)) })} />
                      <Input type="date" value={a.due ?? ""} onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, due: e.target.value || null } : x)) })} />
                    </li>
                  ))}
                </ul>
              </Field>
            )}

            {plan.tasks.length > 0 && (
              <Field label="Follow ups for you, ticked ones become tasks">
                <ul className="divide-y divide-border border-y border-border">
                  {plan.tasks.map((t, i) => (
                    <li key={i} className="flex items-center gap-3 py-2">
                      <Check checked={accept.tasks[i]} onChange={(v) => setAccept({ ...accept, tasks: accept.tasks.map((x, j) => (j === i ? v : x)) })} />
                      <div className="min-w-0 flex-1">
                        <Input value={t.title} onChange={(e) => update({ tasks: plan.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} className="h-8" />
                        <p className="mt-1 text-[12px] text-muted">
                          {t.dueDate ? `Due ${formatDate(t.dueDate)}` : "No date"}
                          {t.waitingOn ? `, waiting on ${t.waitingOn}` : ""}
                          {t.priority !== "normal" ? `, ${t.priority}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Field>
            )}

            {plan.dateChanges.length > 0 && (
              <Field label="Dates mentioned">
                <ul className="divide-y divide-border border-y border-border">
                  {plan.dateChanges.map((d, i) => (
                    <li key={i} className="flex items-center gap-3 py-2 text-[14px]">
                      <Check checked={accept.dateChanges[i]} onChange={(v) => setAccept({ ...accept, dateChanges: accept.dateChanges.map((x, j) => (j === i ? v : x)) })} />
                      <span>
                        {d.title ?? MILESTONE_TYPES[d.type].label}
                        {d.newDate ? `: move to ${formatDate(d.newDate)}` : ""}
                        {d.markDone ? ", mark done" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Field>
            )}

            {(plan.health || plan.nextStep) && (
              <Field label="Client status">
                <ul className="divide-y divide-border border-y border-border text-[14px]">
                  {plan.health && (
                    <li className="flex items-start gap-3 py-2">
                      <Check checked={accept.health} onChange={(v) => setAccept({ ...accept, health: v })} />
                      <span>
                        Health to <span className="font-medium">{HEALTH[plan.health].label}</span>
                        {plan.healthReason ? <span className="text-muted">. {plan.healthReason}</span> : null}
                      </span>
                    </li>
                  )}
                  {plan.nextStep && (
                    <li className="flex items-start gap-3 py-2">
                      <Check checked={accept.nextStep} onChange={(v) => setAccept({ ...accept, nextStep: v })} />
                      <span>Next step: {plan.nextStep}</span>
                    </li>
                  )}
                </ul>
              </Field>
            )}

            {plan.notesUpdate && (
              <Field
                label={
                  <span className="flex items-center gap-3">
                    <Check checked={accept.notes} onChange={(v) => setAccept({ ...accept, notes: v })} /> Update the client notes with what this meeting taught
                  </span>
                }
              >
                <Textarea value={plan.notesUpdate} onChange={(e) => update({ notesUpdate: e.target.value })} className={cn("min-h-[140px] text-[13px]", !accept.notes && "opacity-50")} disabled={!accept.notes} />
              </Field>
            )}

            {plan.openQuestions.length > 0 && (
              <Field label="Unclear in the transcript">
                <ul className="list-disc space-y-1 pl-5 text-[13px] text-text-2">
                  {plan.openQuestions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </Field>
            )}

            <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-2 border-t border-border bg-surface px-1 py-3">
              <Button variant="ghost" onClick={() => setStage("transcript")} disabled={saving}>
                Back to transcript
              </Button>
              <Button onClick={save} disabled={saving || plan.mom.trim().length < 20}>
                {saving && <Loader2 className="animate-spin" />} Save minutes
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="block">{label}</Label>
      {children}
    </div>
  );
}

function Check({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} className={cn("flex size-4 shrink-0 items-center justify-center rounded-[3px] border", checked ? "border-ink bg-ink" : "border-border-strong")}>
      {checked && <span className="block size-2 bg-paper" />}
    </button>
  );
}

function EditableList({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((it, i) => (
        <li key={i} className="py-1.5">
          <Input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="h-8" />
        </li>
      ))}
    </ul>
  );
}
