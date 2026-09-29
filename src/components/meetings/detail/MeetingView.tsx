"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Copy, FileDown, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { NavClient } from "@/components/shell/nav";
import type { MeetingFull } from "@/lib/data/meetingLibrary";
import type { UnderstandingNotes } from "@/lib/core/notes";
import type { MeetingDetails } from "@/lib/core/notes";
import { retryMeetingAction } from "@/actions/meetingIntel";
import { formatDateTime } from "@/lib/core/dates";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignClient } from "../library/AssignClient";
import { ProcessingWatch } from "../library/ProcessingWatch";
import { NotesView } from "./NotesView";
import { ProposalReview } from "./ProposalReview";
import { TranscriptViewer } from "./TranscriptViewer";
import { MinutesSheet } from "./MinutesSheet";
import { cn } from "@/lib/utils";

const STATE: Record<string, { word: string; tone: string }> = {
  received: { word: "Queued", tone: "text-muted" },
  processing: { word: "Drafting the minutes", tone: "text-muted" },
  processed: { word: "Processed", tone: "text-ok" },
  needs_review: { word: "Needs review", tone: "text-warn" },
  failed: { word: "Failed", tone: "text-bad" },
};

/** One meeting: header with client and state, then Minutes, Additional details, Notes, Transcript, Review. */
export function MeetingView({ meeting, clients }: { meeting: MeetingFull; clients: NavClient[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState("minutes");
  const [seek, setSeek] = useState<number | null>(null);

  const details = meeting.outputs.find((o) => o.kind === "details");
  const notesOut = meeting.outputs.find((o) => o.kind === "notes");
  const notes = notesOut?.data as UnderstandingNotes | undefined;
  const detailsData = details?.data as MeetingDetails | undefined;
  const state = meeting.processing ? STATE[meeting.processing] : null;
  const inFlight = meeting.processing === "received" || meeting.processing === "processing";
  const clientCode = meeting.client?.code ?? null;
  const proposal = meeting.minutes?.proposal ?? null;

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(() => toast.success(label));
  }
  function retry() {
    start(async () => {
      const res = await retryMeetingAction(meeting.id);
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Running again");
        router.refresh();
      }
    });
  }
  function jump(sec: number) {
    setSeek(sec);
    setTab("transcript");
  }

  return (
    <div className="space-y-7">
      <ProcessingWatch meetingId={meeting.id} state={meeting.processing} />
      <header className="border-b border-ink pb-4">
        <p className="num text-[11px] text-muted">
          {meeting.client ? (
            <Link href={`/clients/${meeting.client.id}?tab=meetings`} className="hover:underline">
              {meeting.client.code}
            </Link>
          ) : meeting.otherWork ? (
            "OTHER WORK"
          ) : (
            "UNMATCHED"
          )}
        </p>
        <h1 className="serif mt-1 text-[34px] leading-[1.05] text-text sm:text-[40px]">{meeting.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          <span className="num">{formatDateTime(meeting.heldAt)}</span>
          {meeting.durationMin ? <span className="num">{meeting.durationMin} min</span> : null}
          {meeting.location ? <span>{meeting.location}</span> : null}
          <span>{meeting.source === "mac_helper" ? "From the Mac helper" : meeting.source === "upload" ? "Uploaded" : meeting.source === "import" ? "Imported" : "Set in Orbit"}</span>
          {state && <span className={cn("font-medium", state.tone)}>{state.word}</span>}
        </p>
        {meeting.matchReason && (
          <p className="mt-1 text-[12px] text-muted">
            Match: {meeting.matchReason}
            {typeof meeting.matchConfidence === "number" ? ` (${Math.round(meeting.matchConfidence * 100)}%)` : ""}
          </p>
        )}
        {meeting.processing === "failed" && <p className="mt-1 text-[13px] text-bad">{meeting.errorMessage ?? "Processing failed"}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {meeting.mom && (
            <>
              <a href={`/api/meetings/${meeting.id}/docx`} className="link inline-flex items-center gap-1.5 text-[13px]" download>
                <FileDown className="size-3.5" /> Word MOM
              </a>
              {details && (
                <a href={`/api/meetings/${meeting.id}/docx?sheet=details`} className="link inline-flex items-center gap-1.5 text-[13px]" download>
                  <FileDown className="size-3.5" /> Word details
                </a>
              )}
              <button type="button" className="link inline-flex items-center gap-1.5 text-[13px]" onClick={() => copy(meeting.mom!, "Minutes copied, ready to paste into an email")}>
                <Copy className="size-3.5" /> Copy as email text
              </button>
            </>
          )}
          {(meeting.processing === "failed" || meeting.processing === "processed" || meeting.processing === "needs_review") && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" disabled={pending} onClick={retry}>
              {pending ? <Loader2 className="animate-spin" /> : <RotateCcw />} {meeting.processing === "failed" ? "Retry" : "Redraft"}
            </Button>
          )}
        </div>

        {(meeting.processing === "needs_review" || meeting.otherWork || (!meeting.client && meeting.processing)) && !inFlight && (
          <div className="mt-4">
            <p className="mb-1.5 text-[12px] text-muted">{meeting.processing === "needs_review" ? "Which client is this? Pick one, or file it under Other Work." : "Move this meeting to a client, or make a new one."}</p>
            <AssignClient meetingId={meeting.id} clients={clients} current={{ clientId: meeting.clientId, otherWork: meeting.otherWork }} compact />
          </div>
        )}
      </header>

      {inFlight ? (
        <p className="py-6 text-[14px] text-muted">Orbit is reading the transcript and drafting the minutes. This page refreshes by itself, usually within two minutes.</p>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="minutes">Minutes</TabsTrigger>
            <TabsTrigger value="details">Additional details</TabsTrigger>
            <TabsTrigger value="notes">Notes</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="minutes">
            {meeting.mom ? (
              <MinutesSheet meeting={meeting} clientCode={clientCode} />
            ) : (
              <p className="py-3 text-[14px] text-muted">No minutes yet.</p>
            )}
          </TabsContent>

          <TabsContent value="details">
            {details && detailsData ? (
              <div className="grid gap-7 lg:grid-cols-2">
                <section>
                  <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">Attendees</h3>
                  <p className="py-1.5 text-[14px]"><span className="text-muted">Fero: </span>{detailsData.attendeesFero?.join(", ") || "none listed"}</p>
                  <p className="py-1.5 text-[14px]"><span className="text-muted">Client: </span>{detailsData.attendeesClient?.join(", ") || "none listed"}</p>
                </section>
                <section>
                  <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">Next meeting</h3>
                  <p className="py-1.5 text-[14px]">{detailsData.nextMeeting ?? "Not set"}</p>
                </section>
                <section>
                  <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">Agenda</h3>
                  <ol className="list-decimal divide-y divide-border pl-5">{(detailsData.agenda ?? []).map((a, i) => <li key={i} className="py-1.5 text-[14px]">{a}</li>)}</ol>
                </section>
                <section>
                  <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">Decisions</h3>
                  <ol className="list-decimal divide-y divide-border pl-5">{(detailsData.decisions ?? []).map((a, i) => <li key={i} className="py-1.5 text-[14px]">{a}</li>)}</ol>
                </section>
                <section className="lg:col-span-2">
                  <h3 className="mb-1 border-b border-border pb-1 font-display text-[17px] text-text">Open points</h3>
                  <ul className="divide-y divide-border">{(detailsData.openPoints ?? []).map((a, i) => <li key={i} className="py-1.5 text-[14px]">{a}</li>)}</ul>
                </section>
                <div className="lg:col-span-2">
                  <Button variant="secondary" size="sm" onClick={() => copy(details.text, "Details copied")}>
                    <Copy /> Copy details
                  </Button>
                </div>
              </div>
            ) : (
              <p className="py-3 text-[14px] text-muted">No details sheet for this meeting. It is made when the transcript is processed.</p>
            )}
          </TabsContent>

          <TabsContent value="notes">
            {notes ? <NotesView notes={notes} onSeek={jump} /> : <p className="py-3 text-[14px] text-muted">No notes for this meeting. They are drafted when the transcript is processed.</p>}
          </TabsContent>

          <TabsContent value="transcript">
            <TranscriptViewer segments={meeting.transcript?.segments ?? []} seek={seek} />
          </TabsContent>

          <TabsContent value="review">
            {proposal ? <ProposalReview meetingId={meeting.id} proposal={proposal} hasClient={Boolean(meeting.clientId)} /> : <p className="py-3 text-[14px] text-muted">Nothing proposed. Meetings minuted from the client page are reviewed there before saving.</p>}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
