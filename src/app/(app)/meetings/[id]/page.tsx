import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listClients } from "@/lib/data/clients";
import { getMeetingFull } from "@/lib/data/meetingLibrary";
import { MeetingView } from "@/components/meetings/detail/MeetingView";

type Props = { params: Promise<{ id: string }> };

function isUuid(v: string) {
  return /^[0-9a-f-]{36}$/i.test(v);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const meeting = isUuid(id) ? await getMeetingFull(id) : null;
  return { title: meeting?.title ?? "Meeting" };
}

export default async function MeetingPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [meeting, clients] = await Promise.all([getMeetingFull(id), listClients()]);
  if (!meeting) notFound();
  return (
    <div className="animate-fade-up space-y-6">
      <Link href="/meetings" className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-text">
        <ArrowLeft className="size-3.5" /> Meetings
      </Link>
      <MeetingView meeting={meeting} clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} />
    </div>
  );
}
