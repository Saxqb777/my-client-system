import type { Metadata } from "next";
import { listClients } from "@/lib/data/clients";
import { listLibrary, searchMeetings } from "@/lib/data/meetingLibrary";
import { PageHeader } from "@/components/aurora/PageHeader";
import { Panel } from "@/components/aurora/Panel";
import { AskOrbit } from "@/components/meetings/library/AskOrbit";
import { MeetingsLedger } from "@/components/meetings/library/MeetingsLedger";
import { ReviewInbox } from "@/components/meetings/library/ReviewInbox";
import { UploadTranscript } from "@/components/meetings/library/UploadTranscript";

export const metadata: Metadata = { title: "Meetings" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function MeetingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const clientFilter = typeof sp.client === "string" ? sp.client : "";
  const [clients, all] = await Promise.all([listClients(), listLibrary({ limit: 400 })]);
  const nav = clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }));

  const needsReview = all.filter((m) => m.processing === "needs_review");
  const failed = all.filter((m) => m.processing === "failed");
  const inFlight = all.filter((m) => m.processing === "received" || m.processing === "processing");
  const listed = all.filter((m) => (clientFilter === "other" ? m.otherWork : clientFilter ? m.clientId === clientFilter : true));
  const hits = q ? await searchMeetings(q, clientFilter && clientFilter !== "other" ? clientFilter : null) : null;
  const filteredHits = hits && clientFilter === "other" ? hits.filter((h) => !h.clientId) : hits;

  return (
    <div className="animate-fade-up space-y-10">
      <PageHeader title="Meetings" description={`${all.length} on record${needsReview.length ? `, ${needsReview.length} to review` : ""}${failed.length ? `, ${failed.length} failed` : ""}`} actions={<UploadTranscript clients={nav} />} />

      <Panel title="Ask Orbit" aside="Answers from your meetings only, with sources">
        <AskOrbit clients={nav} />
      </Panel>

      <ReviewInbox needsReview={needsReview} failed={failed} inFlight={inFlight} clients={nav} />

      <Panel title="Library" aside={`${listed.length} ${listed.length === 1 ? "meeting" : "meetings"}`}>
        <MeetingsLedger meetings={listed} clients={nav} q={q} clientFilter={clientFilter} hits={filteredHits} />
      </Panel>
    </div>
  );
}
