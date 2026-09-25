"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/lib/db/schema";
import { createClientAction, updateClientAction } from "@/actions/clients";
import { CLIENT_HUES, HEALTH, PHASES } from "@/lib/core/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  code: string;
  fullName: string;
  system: string;
  aliases: string;
  owner: string;
  phase: string;
  health: Client["health"];
  nextStep: string;
  phaseStartDate: string;
  phaseTargetDate: string;
  color: string;
  notes: string;
};

function toState(c?: Client | null): FormState {
  return {
    name: c?.name ?? "",
    code: c?.code ?? "",
    fullName: c?.fullName ?? "",
    system: c?.system ?? "",
    aliases: (c?.aliases ?? []).join(", "),
    owner: c?.owner ?? "Saaqib",
    phase: c?.phase ?? "discovery",
    health: c?.health ?? "on_track",
    nextStep: c?.nextStep ?? "",
    phaseStartDate: c?.phaseStartDate ?? "",
    phaseTargetDate: c?.phaseTargetDate ?? "",
    color: c?.color ?? "",
    notes: c?.notes ?? "",
  };
}

export function ClientForm({ open, onOpenChange, client }: { open: boolean; onOpenChange: (v: boolean) => void; client?: Client | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toState(client));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const editing = Boolean(client);

  // Reset the form each time the sheet opens (state adjustment during render, no effect needed).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setForm(toState(client));
      setError(null);
    }
  }

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  function submit() {
    setError(null);
    start(async () => {
      const payload = { ...form, code: form.code.toUpperCase() };
      const res = editing ? await updateClientAction(client!.id, payload) : await createClientAction(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(editing ? "Client updated" : `${res.data.name} added`);
      onOpenChange(false);
      if (!editing) router.push(`/clients/${res.data.id}`);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? `Edit ${client!.name}` : "New client"}</SheetTitle>
          <SheetDescription>{editing ? "Status changes are logged on the timeline." : "The short code is how Quick Log matches updates to this client."}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Name" required>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ADFH OMS" autoFocus={!editing} />
            </Field>
            <Field label="Code" required>
              <Input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} placeholder="ADFH" className="num uppercase" maxLength={16} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organisation">
              <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Abu Dhabi Food Hub" />
            </Field>
            <Field label="System">
              <Input value={form.system} onChange={(e) => set("system", e.target.value)} placeholder="OMS" />
            </Field>
          </div>
          <Field label="Also known as" hint="Comma separated. Used to match Quick Log text.">
            <Input value={form.aliases} onChange={(e) => set("aliases", e.target.value)} placeholder="Food Hub, ADFH Ops" />
          </Field>

          <div className="divider" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Phase">
              <Select value={form.phase} onValueChange={(v) => set("phase", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PHASES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Health">
              <Select value={form.health} onValueChange={(v) => set("health", v as Client["health"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(HEALTH).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Owner">
              <Input value={form.owner} onChange={(e) => set("owner", e.target.value)} />
            </Field>
          </div>
          <Field label="Next step">
            <Textarea value={form.nextStep} onChange={(e) => set("nextStep", e.target.value)} placeholder="BRD session initiation and closure" className="min-h-[72px]" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phase start date">
              <Input type="date" value={form.phaseStartDate} onChange={(e) => set("phaseStartDate", e.target.value)} />
            </Field>
            <Field label="Phase target date">
              <Input type="date" value={form.phaseTargetDate} onChange={(e) => set("phaseTargetDate", e.target.value)} />
            </Field>
          </div>

          <Field label="Accent colour">
            <div className="flex flex-wrap gap-2">
              {CLIENT_HUES.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-label={`Hue ${h}`}
                  onClick={() => set("color", String(h))}
                  className={cn(
                    "size-7 rounded-[3px] border-2 transition",
                    form.color === String(h) ? "scale-110 border-text" : "border-transparent hover:scale-105",
                  )}
                  style={{ background: `hsl(${h} 80% 60%)` }}
                />
              ))}
            </div>
          </Field>
          <Field label="Notes">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Anything worth remembering about this account" />
          </Field>

          {error && <p className="text-sm text-bad">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !form.name.trim() || form.code.trim().length < 2}>
              {pending && <Loader2 className="animate-spin" />}
              {editing ? "Save changes" : "Add client"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required && <span className="text-signal"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
