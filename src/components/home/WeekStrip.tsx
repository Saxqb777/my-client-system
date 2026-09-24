import Link from "next/link";
import type { MilestoneWithClient } from "@/lib/data/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { daysUntil, formatDate } from "@/lib/core/dates";
import { CountdownRing } from "@/components/aurora/CountdownRing";
import { GlassCard, CardEyebrow, CardTitle } from "@/components/aurora/GlassCard";

export function WeekStrip({ milestones }: { milestones: MilestoneWithClient[] }) {
  return (
    <GlassCard>
      <div className="flex items-end justify-between">
        <div>
          <CardEyebrow>Next 7 days</CardEyebrow>
          <CardTitle className="mt-1">Dates coming up</CardTitle>
        </div>
        <span className="num text-xs text-muted">{milestones.length} dates</span>
      </div>
      {milestones.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No dates in the next 7 days. Add target, SIT, UAT or go live dates on a client page.</p>
      ) : (
        <div className="-mx-2 mt-4 flex gap-3 overflow-x-auto px-2 pb-2">
          {milestones.map((m) => {
            const days = daysUntil(m.date);
            return (
              <Link
                key={m.id}
                href={`/clients/${m.client.id}`}
                className="glass-inset glass-hover flex min-w-[220px] shrink-0 items-center gap-3 p-3"
              >
                <CountdownRing daysLeft={days} span={14} size={52} caption="days" />
                <div className="min-w-0">
                  <p className="num text-[11px] text-teal">{m.client.code}</p>
                  <p className="truncate text-sm font-medium text-text">{m.title}</p>
                  <p className="text-[11px] text-muted">
                    {MILESTONE_TYPES[m.type].label} · {formatDate(m.date, false)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
