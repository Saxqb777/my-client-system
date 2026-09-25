"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Copy, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { Meeting, Person } from "@/lib/db/schema";
import { deleteMeetingAction, updateMeetingAction } from "@/actions/meetings";
import { formatDateTime } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/aurora/EmptyState";
import { MeetingForm } from "./MeetingForm";
import { MinutesBuilder } from "./MinutesBuilder";
import { cn } from "@/lib/utils";

type Tone = "upcoming" | "needs" | "past";

function MeetingRow({ m, tone, clientName, pending, onEdit, onMinutes, onCancel, onDelete }: { m: Meeting; tone: Tone; clientName: string; pending: boolean; onEdit: () => void; onMinutes: () => void; onCancel: () => void; onDelete: () => void }) {
  const [openMom, setOpenMom] = useState(false);
  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => toast.success("Minutes copied"));
  }
  return (
    <li className="border-b border-border py-3 last:border-0">
      <div className="flex items-start gap-4">
        <span className="num w-[132px] shrink-0 pt-0.5 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] text-text">{m.title}</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {m.attendees.length ? m.attendees.join(", ") : "No attendees listed"}
            {m.location ? `, ${m.location}` : ""}
          </p>
          {tone === "needs" && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={onMinutes}>
                Add the transcript
              </Button>
              <span className="text-[12px] text-muted">Orbit drafts the minutes in {clientName}&apos;s format.</span>
            </div>
          )}
          {tone === "past" && m.mom && (
            <div className="mt-2">
              <button type="button" className="link text-[13px]" onClick={() => setOpenMom((v) => !v)}>
                {openMom ? "Hide minutes" : "Show minutes"}
              </button>
              {openMom && (
                <div className="mt-2 border-l-2 border-border pl-4">
                  <pre className="whitespace-pre-wrap font-sans text-[13.5px] leading-relaxed text-text">{m.mom}</pre>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => copy(m.mom!)}>
                    <Copy /> Copy minutes
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {m.status === "minuted" && <Badge tone="ok">Minuted</Badge>}
          {m.status === "cancelled" && <Badge>Cancelled</Badge>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Meeting options" disabled={pending}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {tone !== "past" && <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>}
              {tone === "upcoming" && <DropdownMenuItem onSelect={onMinutes}>Add transcript now</DropdownMenuItem>}
              {tone === "past" && m.mom && <DropdownMenuItem onSelect={onMinutes}>Rebuild minutes</DropdownMenuItem>}
              {tone !== "past" && <DropdownMenuItem onSelect={onCancel}>Cancel meeting</DropdownMenuItem>}
              <DropdownMenuSeparator />
              <DropdownMenuItem danger onSelect={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
  );
}

export function MeetingsPanel({ clientId, clientName, meetings, people, now }: { clientId: string; clientName: string; meetings: Meeting[]; people: Person[]; now: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [form, setForm] = useState<false | Meeting | "new">(false);
  const [minutesFor, setMinutesFor] = useState<Meeting | null>(null);

  const upcoming = meetings.filter((m) => m.status === "planned" && m.heldAt.getTime() >= now).sort((a, b) => a.heldAt.getTime() - b.heldAt.getTime());
  const needMinutes = meetings.filter((m) => (m.status === "planned" || m.status === "held") && m.heldAt.getTime() < now && !m.mom);
  const past = meetings.filter((m) => m.status === "minuted" || m.status === "cancelled" || (m.mom && m.status !== "planned"));

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    start(async () => {
      const res = await fn();
      if (!res.ok) toast.error(res.error ?? "Something went wrong");
      else {
        if (done) toast.success(done);
        router.refresh();
      }
    });
  }

  const rowProps = (m: Meeting, tone: Tone) => ({
    m,
    tone,
    clientName,
    pending,
    onEdit: () => setForm(m),
    onMinutes: () => setMinutesFor(m),
    onCancel: () => run(() => updateMeetingAction(m.id, { status: "cancelled" }), "Meeting cancelled"),
    onDelete: () => run(() => deleteMeetingAction(m.id), "Meeting removed"),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-muted">
          {upcoming.length} upcoming, {needMinutes.length} waiting for a transcript, {past.length} minuted
        </p>
        <Button size="sm" variant="secondary" onClick={() => setForm("new")}>
          <CalendarPlus /> Set a meeting
        </Button>
      </div>

      {meetings.length === 0 && <EmptyState title="No meetings yet" hint="Set the next one. When its time passes, Orbit asks for the transcript and drafts the minutes." compact />}

      {needMinutes.length > 0 && (
        <section>
          <h3 className="mb-1 border-b border-ink pb-1 text-[13px] font-medium text-warn">Waiting for a transcript</h3>
          <ul>
            {needMinutes.map((m) => (
              <MeetingRow key={m.id} {...rowProps(m, "needs")} />
            ))}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Upcoming</h3>
          <ul>
            {upcoming.map((m) => (
              <MeetingRow key={m.id} {...rowProps(m, "upcoming")} />
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section>
          <h3 className="label mb-1 border-b border-border pb-1">Minuted</h3>
          <ul className={cn(pending && "opacity-70")}>
            {past.map((m) => (
              <MeetingRow key={m.id} {...rowProps(m, "past")} />
            ))}
          </ul>
        </section>
      )}

      <MeetingForm clientId={clientId} people={people} open={form !== false} onOpenChange={(v) => !v && setForm(false)} meeting={form === "new" ? null : form || null} />
      {minutesFor && <MinutesBuilder key={minutesFor.id} meeting={minutesFor} clientName={clientName} open onOpenChange={(v) => !v && setMinutesFor(null)} />}
    </div>
  );
}
