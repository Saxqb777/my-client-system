import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { formatDateTime } from "@/lib/core/dates";
import { Panel } from "@/components/aurora/Panel";

/** Meetings that need a transcript first, then the next ones on the calendar. */
export function MeetingsPanel({ data }: { data: Dashboard }) {
  const { meetings, awaitingMinutes } = data;
  if (meetings.length === 0 && awaitingMinutes.length === 0) return null;
  return (
    <Panel title="Meetings" aside={meetings.length ? `${meetings.length} in 7 days` : undefined}>
      <ul>
        {awaitingMinutes.map((m) => (
          <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
            <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/clients/${m.clientId}?tab=meetings`} className="text-[14px] text-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[12px] text-warn">{m.client.name}. Waiting for the transcript to draft the minutes.</p>
            </div>
          </li>
        ))}
        {meetings.map((m) => (
          <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
            <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
            <div className="min-w-0 flex-1">
              <Link href={`/clients/${m.clientId}?tab=meetings`} className="text-[14px] text-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[12px] text-muted">
                {m.client.name}
                {m.location ? `, ${m.location}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
