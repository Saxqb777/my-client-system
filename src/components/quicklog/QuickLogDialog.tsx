"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Bot, Check, Loader2, PenLine, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import type { ParseResult, QuickLogPlan } from "@/lib/ai/quicklog";
import { applyQuickLogAction } from "@/actions/quicklog";
import { ACTIVITY_TYPES, HEALTH, MILESTONE_TYPES, PHASES, TASK_PRIORITY } from "@/lib/core/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { HealthSwatch } from "@/components/aurora/HealthMark";
import { cn } from "@/lib/utils";

type Seed = { text: string; autoParse: boolean; nonce: number };
type Stage = "compose" | "parsing" | "preview";
type ParseResponse = ParseResult & { aiConfigured: boolean; error?: string };

const NONE = "__none__";

export function QuickLogDialog({
  open,
  onOpenChange,
  seed,
  clients,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed: Seed;
  clients: NavClient[];
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("compose");
  const [result, setResult] = useState<ParseResponse | null>(null);
  const [plan, setPlan] = useState<QuickLogPlan | null>(null);
  const [clientId, setClientId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset when the dialog is opened with a new seed. State adjustment during render, no effect.
  const [prevNonce, setPrevNonce] = useState<number | null>(null);
  if (open && seed.nonce !== prevNonce) {
    setPrevNonce(seed.nonce);
    setText(seed.text);
    setResult(null);
    setPlan(null);
    setError(null);
    setClientId("");
    setStage(seed.autoParse ? "parsing" : "compose");
  }

  // The parsing stage owns the request. Entering it starts a fetch; leaving it cancels the result.
  useEffect(() => {
    if (stage !== "parsing") return;
    const value = text.trim();
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: value }),
        });
        const data = (await res.json()) as ParseResponse;
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || "Could not read that update");
        setResult(data);
        setPlan(data.plan);
        setClientId(data.client?.id ?? "");
        setStage("preview");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not read that update");
        setStage("compose");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stage, text]);

  function parse(input: string) {
    if (input.trim().length < 2) return;
    setError(null);
    setStage("parsing");
  }

  function save() {
    if (!plan) return;
    if (!clientId) {
      setError("Pick the client this update is about.");
      return;
    }
    startSave(async () => {
      const res = await applyQuickLogAction({ clientId, plan });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(`Saved to ${res.data.client.name}`, {
        description: res.data.lines.slice(0, 4).join(", "),
        icon: <Check className="size-4 text-ok" />,
      });
      onOpenChange(false);
      router.refresh();
    });
  }

  const update = (patch: Partial<QuickLogPlan>) => setPlan((p) => (p ? { ...p, ...patch } : p));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-2xl overflow-y-auto p-0">
        <div className="p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenLine className="size-5 text-text" />
              Quick log
            </DialogTitle>
            <DialogDescription>
              {stage === "preview"
                ? "Review, edit if needed, then save."
                : "Type an update. Orbit finds the client, logs it, moves dates and adds follow ups."}
            </DialogDescription>
          </DialogHeader>

          <AnimatePresence mode="wait" initial={false}>
            {stage === "compose" && (
              <motion.div key="compose" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-5 space-y-4">
                <Textarea
                  ref={textareaRef}
                  autoFocus
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") parse(text);
                  }}
                  placeholder="ADFH UAT signed off, go live moved to 15 Oct. Waiting on Noura for the integration list."
                  className="min-h-[120px] text-[15px]"
                />
                {error && <p className="text-sm text-bad">{error}</p>}
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted">⌘ Enter to continue</p>
                  <Button onClick={() => parse(text)} disabled={text.trim().length < 2}>
                    <Wand2 /> Understand
                  </Button>
                </div>
              </motion.div>
            )}

            {stage === "parsing" && (
              <motion.div key="parsing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-6 flex flex-col items-center gap-3 py-10 text-center">
                <span className="relative flex size-12 items-center justify-center">
                  
                  <Loader2 className="size-6 animate-spin text-text" />
                </span>
                <p className="text-sm text-text-2">Reading the update</p>
                <p className="max-w-sm text-xs text-muted">“{text}”</p>
              </motion.div>
            )}

            {stage === "preview" && plan && result && (
              <motion.div key="preview" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="mt-5 space-y-5">
                <blockquote className="rounded-[4px] border border-border px-3.5 py-2.5 text-sm text-text-2">“{text}”</blockquote>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={result.engine === "claude" ? "ink" : "neutral"}>
                    <Bot className="size-3" /> {result.engine === "claude" ? "Read by Claude" : "Read by rules"}
                  </Badge>
                  {!result.aiConfigured && <span className="text-xs text-muted">Add ANTHROPIC_API_KEY to use Claude.</span>}
                  {plan.confidence !== "high" && clientId && <Badge tone="warn">Client match: {plan.confidence}</Badge>}
                </div>

                <Section title="Client">
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className={cn(!clientId && "border-[color-mix(in_oklab,var(--warn)_50%,var(--border))]")}>
                      <SelectValue placeholder="Which client is this about?" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <span className="inline-flex items-center gap-2">
                            <HealthSwatch health={c.health} /> {c.name} <span className="num text-xs text-muted">{c.code}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Section>

                <Section title="Activity" hint="Goes on the client timeline">
                  {plan.activity ? (
                    <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                      <Select value={plan.activity.type} onValueChange={(v) => update({ activity: { ...plan.activity!, type: v as QuickLogPlan["activity"] extends infer A ? (A extends { type: infer T } ? T : never) : never } })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(ACTIVITY_TYPES).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              {v.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input value={plan.activity.title} onChange={(e) => update({ activity: { ...plan.activity!, title: e.target.value } })} />
                    </div>
                  ) : (
                    <Button variant="secondary" size="sm" onClick={() => update({ activity: { type: "update", title: text, body: null } })}>
                      <Plus /> Add activity line
                    </Button>
                  )}
                </Section>

                <Section title="Client changes" hint="Only what the update says">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={plan.clientUpdates.health ?? NONE} onValueChange={(v) => update({ clientUpdates: { ...plan.clientUpdates, health: v === NONE ? null : (v as QuickLogPlan["clientUpdates"]["health"]) } })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Health" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Health unchanged</SelectItem>
                        {Object.entries(HEALTH).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={plan.clientUpdates.phase ?? NONE} onValueChange={(v) => update({ clientUpdates: { ...plan.clientUpdates, phase: v === NONE ? null : v } })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Phase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Phase unchanged</SelectItem>
                        {PHASES.map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Next step (optional)"
                      value={plan.clientUpdates.nextStep ?? ""}
                      onChange={(e) => update({ clientUpdates: { ...plan.clientUpdates, nextStep: e.target.value || null } })}
                    />
                  </div>
                </Section>

                <Section
                  title="Dates"
                  hint="Moves an existing date or creates one"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => update({ milestoneUpdates: [...plan.milestoneUpdates, { type: "target", title: null, newDate: null, markDone: false }] })}>
                      <Plus /> Add
                    </Button>
                  }
                >
                  {plan.milestoneUpdates.length === 0 && <p className="text-sm text-muted">No date changes.</p>}
                  <div className="space-y-2">
                    {plan.milestoneUpdates.map((m, i) => (
                      <div key={i} className="grid items-center gap-2 rounded-[4px] border border-border p-2 sm:grid-cols-[120px_1fr_150px_auto_auto]">
                        <Select value={m.type} onValueChange={(v) => update({ milestoneUpdates: plan.milestoneUpdates.map((x, j) => (j === i ? { ...x, type: v as typeof m.type } : x)) })}>
                          <SelectTrigger className="h-9">
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
                        <Input className="h-9" placeholder={MILESTONE_TYPES[m.type].label} value={m.title ?? ""} onChange={(e) => update({ milestoneUpdates: plan.milestoneUpdates.map((x, j) => (j === i ? { ...x, title: e.target.value || null } : x)) })} />
                        <Input className="h-9" type="date" value={m.newDate ?? ""} onChange={(e) => update({ milestoneUpdates: plan.milestoneUpdates.map((x, j) => (j === i ? { ...x, newDate: e.target.value || null } : x)) })} />
                        <label className="flex items-center gap-2 text-xs text-muted">
                          <Switch checked={m.markDone} onCheckedChange={(v) => update({ milestoneUpdates: plan.milestoneUpdates.map((x, j) => (j === i ? { ...x, markDone: v } : x)) })} /> Done
                        </label>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => update({ milestoneUpdates: plan.milestoneUpdates.filter((_, j) => j !== i) })}>
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section
                  title="Follow ups"
                  hint="Tasks and things you are waiting on"
                  action={
                    <Button variant="ghost" size="sm" onClick={() => update({ tasks: [...plan.tasks, { title: "", dueDate: null, waitingOn: null, priority: "normal" }] })}>
                      <Plus /> Add
                    </Button>
                  }
                >
                  {plan.tasks.length === 0 && <p className="text-sm text-muted">No follow ups.</p>}
                  <div className="space-y-2">
                    {plan.tasks.map((t, i) => (
                      <div key={i} className="grid items-center gap-2 rounded-[4px] border border-border p-2 sm:grid-cols-[1fr_140px_150px_110px_auto]">
                        <Input className="h-9" placeholder="What needs doing" value={t.title} onChange={(e) => update({ tasks: plan.tasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                        <Input className="h-9" placeholder="Waiting on" value={t.waitingOn ?? ""} onChange={(e) => update({ tasks: plan.tasks.map((x, j) => (j === i ? { ...x, waitingOn: e.target.value || null } : x)) })} />
                        <Input className="h-9" type="date" value={t.dueDate ?? ""} onChange={(e) => update({ tasks: plan.tasks.map((x, j) => (j === i ? { ...x, dueDate: e.target.value || null } : x)) })} />
                        <Select value={t.priority} onValueChange={(v) => update({ tasks: plan.tasks.map((x, j) => (j === i ? { ...x, priority: v as typeof t.priority } : x)) })}>
                          <SelectTrigger className="h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(TASK_PRIORITY).map(([k, v]) => (
                              <SelectItem key={k} value={k}>
                                {v.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon-sm" aria-label="Remove" onClick={() => update({ tasks: plan.tasks.filter((_, j) => j !== i) })}>
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                  </div>
                </Section>

                {plan.notes && (
                  <p className="rounded-[4px] border border-[color-mix(in_oklab,var(--warn)_35%,transparent)] bg-[color-mix(in_oklab,var(--warn)_8%,transparent)] px-3 py-2 text-sm text-warn">
                    {plan.notes}
                  </p>
                )}
                {error && <p className="text-sm text-bad">{error}</p>}

                <div className="flex items-center justify-between gap-3 pt-1">
                  <Button variant="ghost" onClick={() => setStage("compose")}>
                    <ArrowLeft /> Edit text
                  </Button>
                  <Button onClick={save} disabled={saving}>
                    {saving ? <Loader2 className="animate-spin" /> : <Check />}
                    {saving ? "Saving" : "Save to Orbit"}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <Label className="text-text">{title}</Label>
          {hint && <span className="ml-2 text-xs text-muted">{hint}</span>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
