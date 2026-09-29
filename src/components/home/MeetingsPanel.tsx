import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { formatDateTime } from "@/lib/core/dates";
import { Panel } from "@/components/aurora/Panel";

/** Meetings that need a transcript first, then the next ones on the calendar. */
export function MeetingsPanel({ data }: { data: Dashboard }) {
  const { meetings, awaitingMinutes, meetingsToReview, meetingsInFlight } = data;
  if (meetings.length === 0 && awaitingMinutes.length === 0 && meetingsToReview === 0 && meetingsInFlight === 0) return null;
  return (
    <Panel title="Meetings" aside={meetings.length ? `${meetings.length} in 7 days` : undefined}>
      {(meetingsToReview > 0 || meetingsInFlight > 0) && (
        <p className="border-b border-border py-2.5 text-[13px]">
          {meetingsToReview > 0 && (
            <Link href="/meetings" className="link text-warn">
              {meetingsToReview} {meetingsToReview === 1 ? "meeting needs" : "meetings need"} your review
            </Link>
          )}
          {meetingsToReview > 0 && meetingsInFlight > 0 ? <span className="text-muted">, </span> : null}
          {meetingsInFlight > 0 && (
            <span className="text-muted">
              {meetingsInFlight} being processed
            </span>
          )}
        </p>
      )}
      <ul>
        {awaitingMinutes.map((m) => (
          <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
            <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
            <div className="min-w-0 flex-1">
              <Link href={m.clientId ? `/clients/${m.clientId}?tab=meetings` : `/meetings/${m.id}`} className="text-[14px] text-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[12px] text-warn">{m.client?.name ?? "Other Work"}. Waiting for the transcript to draft the minutes.</p>
            </div>
          </li>
        ))}
        {meetings.map((m) => (
          <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
            <span className="num w-[132px] shrink-0 text-[12px] text-muted">{formatDateTime(m.heldAt)}</span>
            <div className="min-w-0 flex-1">
              <Link href={m.clientId ? `/clients/${m.clientId}?tab=meetings` : `/meetings/${m.id}`} className="text-[14px] text-text hover:underline">
                {m.title}
              </Link>
              <p className="text-[12px] text-muted">
                {m.client?.name ?? "Other Work"}
                {m.location ? `, ${m.location}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
