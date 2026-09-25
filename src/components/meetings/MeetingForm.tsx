"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Meeting, Person } from "@/lib/db/schema";
import { createMeetingAction, updateMeetingAction } from "@/actions/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function toLocalInput(d: Date) {
  // Dubai wall clock for the datetime input
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromLocalInput(v: string) {
  // Interpret the typed wall clock as Dubai time
  return new Date(`${v}:00+04:00`);
}

function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600 * 1000);
  const s = toLocalInput(d);
  return `${s.slice(0, 11)}10:00`;
}

type FormState = { title: string; when: string; location: string; attendees: Set<string>; extra: string };

export function MeetingForm({ clientId, people, open, onOpenChange, meeting }: { clientId: string; people: Person[]; open: boolean; onOpenChange: (v: boolean) => void; meeting?: Meeting | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function init(m?: Meeting | null): FormState {
    return {
      title: m?.title ?? "",
      when: m ? toLocalInput(m.heldAt) : defaultWhen(),
      location: m?.location ?? "",
      attendees: new Set<string>(m?.attendees ?? people.filter((p) => p.isPrimary).map((p) => p.name)),
      extra: "",
    };
  }

  const [form, setForm] = useState<FormState>(() => init(meeting));
  const key = `${open}:${meeting?.id ?? ""}`;
  const [prevKey, setPrevKey] = useState(key);
  if (key !== prevKey) {
    setPrevKey(key);
    setForm(init(meeting));
  }

  function toggle(name: string) {
    const next = new Set(form.attendees);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setForm({ ...form, attendees: next });
  }

  function save() {
    const attendees = [...form.attendees, ...form.extra.split(",").map((s) => s.trim()).filter(Boolean)];
    const payload = { clientId, title: form.title.trim(), heldAt: fromLocalInput(form.when).toISOString(), attendees, location: form.location.trim() || null };
    start(async () => {
      const res = meeting ? await updateMeetingAction(meeting.id, payload) : await createMeetingAction(payload);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(meeting ? "Meeting updated" : "Meeting set");
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meeting ? "Edit meeting" : "Set a meeting"}</DialogTitle>
          <DialogDescription>Once the time passes, Orbit asks you for the transcript and drafts the minutes in this client&apos;s format.</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="UAT session 3, BRD session 2, weekly status" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>When, Abu Dhabi time</Label>
              <Input type="datetime-local" value={form.when} onChange={(e) => setForm({ ...form, when: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Where</Label>
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Teams, client office, Fero office" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Attendees</Label>
            {people.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {people.map((p) => (
                  <button key={p.id} type="button" onClick={() => toggle(p.name)} className={cn("tag transition", form.attendees.has(p.name) ? "tag-ink bg-surface-3" : "hover:border-border-strong")}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <Input value={form.extra} onChange={(e) => setForm({ ...form, extra: e.target.value })} placeholder="Others, comma separated" className="mt-1.5" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || form.title.trim().length < 2 || !form.when}>
            {pending && <Loader2 className="animate-spin" />} {meeting ? "Save" : "Set meeting"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
