"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Loader2, Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import type { Meeting } from "@/lib/db/schema";
import type { MinutesPlan } from "@/lib/ai/mom";
import { buildMinutesAction, saveMinutesAction } from "@/actions/meetings";
import { HEALTH, MILESTONE_TYPES } from "@/lib/core/constants";
import { formatDate, formatDateTime } from "@/lib/core/dates";
import { renderMinutesText } from "@/lib/core/minutes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Stage = "transcript" | "building" | "review";

/**
 * Paste or upload the transcript, let Claude draft the minutes in the standard layout
 * (objective, discussion points, action points), review every line, then save.
 * Nothing lands in Orbit until Save. After Save the Word file is one click away.
 */
export function MinutesBuilder({ meeting, clientCode, clientName, open, onOpenChange }: { meeting: Meeting; clientCode: string; clientName: string; open: boolean; onOpenChange: (v: boolean) => void }) {
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
      toast.success("Minutes saved", {
        description: res.data.lines.slice(1, 4).join(". "),
        duration: 12000,
        action: { label: "Download Word", onClick: () => window.open(`/api/meetings/${meeting.id}/docx`, "_blank") },
      });
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
  const [preview, setPreview] = useState(false);
  const ready = Boolean(plan && plan.objective.trim().length >= 10 && plan.points.some((p) => p.text.trim()));
  const previewText = plan
    ? renderMinutesText({
        clientCode,
        clientName,
        project: "",
        title: plan.title,
        heldAt: meeting.heldAt,
        location: plan.location,
        objective: plan.objective,
        points: plan.points,
        actions: plan.actionItems.map((a) => ({ text: a.text, owner: a.owner })),
      })
    : "";

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
            <p className="text-[12px] text-muted">{engine === "claude" ? "Drafted by Claude from the transcript. Edit anything, then save. The Word file follows this layout exactly." : "Claude is not configured, so this is an empty frame in the standard layout. Fill it in, then save."}</p>

            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <Field label="Title">
                <Input value={plan.title} onChange={(e) => update({ title: e.target.value })} />
              </Field>
              <Field label="Location">
                <Input value={plan.location ?? ""} placeholder="Microsoft Teams" onChange={(e) => update({ location: e.target.value || null })} />
              </Field>
            </div>
            <p className="-mt-3 font-display text-[17px] text-text">
              {clientCode} × Fero | {plan.title || meeting.title}
            </p>

            <Field label="Meeting Objective">
              <Textarea value={plan.objective} onChange={(e) => update({ objective: e.target.value })} className="min-h-[64px] text-[13.5px] leading-relaxed" placeholder="One or two sentences on what the session was for." />
            </Field>

            <Field
              label={`Discussion Points, ${plan.points.length}`}
              action={
                <button type="button" className="link inline-flex items-center gap-1 text-[12px]" onClick={() => update({ points: [...plan.points, { topic: "", text: "" }] })}>
                  <Plus className="size-3" /> Add a point
                </button>
              }
            >
              <ul className="divide-y divide-border border-y border-border">
                {plan.points.map((p, i) => (
                  <li key={i} className="grid gap-2 py-2.5 sm:grid-cols-[180px_1fr_28px]">
                    <Input value={p.topic} placeholder="Topic" onChange={(e) => update({ points: plan.points.map((x, j) => (j === i ? { ...x, topic: e.target.value } : x)) })} className="h-8 font-medium" />
                    <Textarea value={p.text} placeholder="What was explained, confirmed and agreed." onChange={(e) => update({ points: plan.points.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} className="min-h-[72px] text-[13.5px] leading-relaxed" />
                    <button type="button" aria-label="Remove point" className="mt-1 flex h-6 w-6 items-center justify-center text-muted hover:text-text" onClick={() => update({ points: plan.points.filter((_, j) => j !== i) })}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Field>

            <Field
              label={`Action Points, ${plan.actionItems.length}`}
              action={
                <button type="button" className="link inline-flex items-center gap-1 text-[12px]" onClick={() => update({ actionItems: [...plan.actionItems, { text: "", owner: null, due: null }] })}>
                  <Plus className="size-3" /> Add an action
                </button>
              }
            >
              <ul className="divide-y divide-border border-y border-border">
                {plan.actionItems.length === 0 && <li className="py-2 text-[13px] text-muted">No actions yet.</li>}
                {plan.actionItems.map((a, i) => (
                  <li key={i} className="grid gap-2 py-2 sm:grid-cols-[24px_1fr_170px_130px_28px]">
                    <span className="num pt-2 text-[12px] text-muted">{i + 1}</span>
                    <Input value={a.text} placeholder="Action" onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                    <Input value={a.owner ?? ""} placeholder="Owner" onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, owner: e.target.value || null } : x)) })} />
                    <Input type="date" value={a.due ?? ""} onChange={(e) => update({ actionItems: plan.actionItems.map((x, j) => (j === i ? { ...x, due: e.target.value || null } : x)) })} />
                    <button type="button" aria-label="Remove action" className="mt-2 flex h-6 w-6 items-center justify-center text-muted hover:text-text" onClick={() => update({ actionItems: plan.actionItems.filter((_, j) => j !== i) })}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Field>

            <div>
              <button type="button" className="link text-[13px]" onClick={() => setPreview((v) => !v)}>
                {preview ? "Hide the text preview" : "Preview as text"}
              </button>
              {preview && <pre className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-4 font-sans text-[13px] leading-relaxed text-text">{previewText}</pre>}
            </div>

            <Field label="Summary for the client timeline">
              <Textarea value={plan.summary} onChange={(e) => update({ summary: e.target.value })} className="min-h-[56px]" />
            </Field>

            {plan.decisions.length > 0 && (
              <Field label={`Decisions for the timeline, ${plan.decisions.length}`}>
                <EditableList items={plan.decisions} onChange={(decisions) => update({ decisions })} />
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
              <Button onClick={save} disabled={saving || !ready}>
                {saving ? <Loader2 className="animate-spin" /> : <FileDown />} Save minutes
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A labelled block. `action` sits beside the label, outside it, so clicking the label text never triggers it. */
function Field({ label, action, children }: { label: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label className="block">{label}</Label>
        {action}
      </div>
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
