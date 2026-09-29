import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listClients } from "@/lib/data/clients";
import { getMeetingFull } from "@/lib/data/meetingLibrary";
import { listChanges } from "@/lib/data/changeLog";
import { MeetingView } from "@/components/meetings/detail/MeetingView";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const TABS = new Set(["minutes", "details", "notes", "transcript", "review"]);

function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meeting = isUuid(id) ? await getMeetingFull(id) : null;
  return { title: meeting?.title ?? "Meeting" };
}

export default async function MeetingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = typeof sp.tab === "string" && TABS.has(sp.tab) ? sp.tab : undefined;
  const t = typeof sp.t === "string" && /^\d+(\.\d+)?$/.test(sp.t) ? Number(sp.t) : null;
  if (!isUuid(id)) notFound();
  const [meeting, clients, changes] = await Promise.all([getMeetingFull(id), listClients(), listChanges({ meetingId: id, limit: 100 })]);
  if (!meeting) notFound();
  return (
    <div className="animate-fade-up space-y-6">
      <Link href="/meetings" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="size-3.5" /> Meetings
      </Link>
      <MeetingView meeting={meeting} clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} changes={changes} initialTab={tab ?? (t !== null ? "transcript" : undefined)} initialSeek={t} />
    </div>
  );
}
