"use client";

import Link from "next/link";
import type { Milestone } from "@/lib/db/schema";
import { phaseLabel } from "@/lib/core/constants";
import { formatDate, type ISODate } from "@/lib/core/dates";
import { fractionFor, journeyDomain, monthTicks } from "@/lib/core/journey";
import { HealthMark } from "@/components/aurora/HealthMark";
import { JourneyTrack, type TrackClient } from "./JourneyTrack";

export type TrackerRow = { client: TrackClient; milestones: Milestone[] };

/**
 * Every client on one shared time axis, one line each, so you can see where each one stands.
 * Same rail as the client page: hover to read, click to act, drag to move, click the line to add.
 */
export function Tracker({ rows, today }: { rows: TrackerRow[]; today: ISODate }) {
  const dates = rows.flatMap((r) => r.milestones.filter((m) => m.status !== "cancelled").map((m) => m.date));
  const domain = journeyDomain(dates, today, { padBefore: 10, padAfter: 21, minDays: 60 });
  const ticks = monthTicks(domain);
  const todayX = fractionFor(today, domain) * 100;

  return (
    <div className="border-y border-ink">
      {/* axis header */}
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr_150px]">
        <div className="hidden sm:block" />
        <div className="relative h-10">
          <span className="num absolute top-1 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-text" style={{ left: `${todayX}%` }}>
            Today, {formatDate(today, false)}
          </span>
          {ticks.map((t) => (
            <span key={t.date} className="num absolute bottom-1 -translate-x-1/2 text-[10px] text-muted" style={{ left: `${t.fraction * 100}%` }}>
              {t.label}
            </span>
          ))}
        </div>
        <div className="hidden sm:block" />
      </div>

      {rows.map((r) => (
        <div key={r.client.id} className="grid grid-cols-1 border-t border-border sm:grid-cols-[180px_1fr_150px]">
          <div className="flex items-center gap-3 pr-4 pt-3 sm:block sm:pt-0 sm:self-center">
            <span className="num text-[11px] text-muted">{r.client.code}</span>
            <Link href={`/clients/${r.client.id}?tab=dates`} className="block truncate text-[15px] text-text hover:underline">
              {r.client.name}
            </Link>
          </div>
          <div className="relative">
            {ticks.map((t) => (
              <div key={t.date} className="pointer-events-none absolute inset-y-0 border-l border-dashed border-border" style={{ left: `${t.fraction * 100}%` }} />
            ))}
            <JourneyTrack client={r.client} milestones={r.milestones} domain={domain} today={today} />
          </div>
          <div className="flex items-center gap-4 pb-3 sm:flex-col sm:items-end sm:justify-center sm:gap-1 sm:pb-0 sm:pl-4">
            <span className="text-[13px] text-text-2">{phaseLabel(r.client.phase)}</span>
            <HealthMark health={r.client.health} className="text-[12px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
