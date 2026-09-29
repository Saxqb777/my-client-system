import type { Metadata } from "next";
import Link from "next/link";
import { listChanges } from "@/lib/data/changeLog";
import { listClients } from "@/lib/data/clients";
import { getMeeting } from "@/lib/data/meetings";
import { PageHeader } from "@/components/aurora/PageHeader";
import { ChangeList } from "@/components/changes/ChangeList";

export const metadata: Metadata = { title: "Changes" };

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);
const isDate = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const isUuid = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);

/** Every change Orbit made by itself, with the quote behind it and an Undo. Filters live in the URL. */
export default async function ChangesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const clientId = isUuid(str(p.client));
  const meetingId = isUuid(str(p.meeting));
  const from = isDate(str(p.from));
  const to = isDate(str(p.to));
  const [clients, changes, meeting] = await Promise.all([listClients(), listChanges({ clientId, meetingId, from, to, limit: 300 }), meetingId ? getMeeting(meetingId) : null]);
  const undone = changes.filter((c) => c.undoneAt).length;
  const description = changes.length ? `${changes.length} ${changes.length === 1 ? "change" : "changes"}${undone ? `, ${undone} undone` : ""}` : "Nothing changed automatically yet";
  const filtered = Boolean(clientId || meetingId || from || to);

  return (
    <div className="animate-fade-up">
      <PageHeader title="Changes" description={description} />
      <form className="mb-6 flex flex-col gap-2 border-b border-border pb-4 sm:flex-row sm:flex-wrap sm:items-center" action="/changes" method="get">
        {meetingId && <input type="hidden" name="meeting" value={meetingId} />}
        <select name="client" defaultValue={clientId ?? ""} className="h-9 border-b border-border-strong bg-transparent px-1 text-[14px] text-text outline-none focus:border-ink">
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          From
          <input type="date" name="from" defaultValue={from ?? ""} className="num h-9 border-b border-border-strong bg-transparent px-1 text-[13px] text-text outline-none focus:border-ink" />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          To
          <input type="date" name="to" defaultValue={to ?? ""} className="num h-9 border-b border-border-strong bg-transparent px-1 text-[13px] text-text outline-none focus:border-ink" />
        </label>
        <button type="submit" className="h-9 border border-ink px-3 text-[13px] text-text">
          Filter
        </button>
        {meeting && (
          <span className="text-[13px] text-muted">
            Meeting: <Link href={`/meetings/${meeting.id}`} className="link">{meeting.title}</Link>
          </span>
        )}
        {filtered && (
          <Link href="/changes" className="link text-[13px]">
            Clear
          </Link>
        )}
      </form>
      <ChangeList changes={changes} />
    </div>
  );
}
