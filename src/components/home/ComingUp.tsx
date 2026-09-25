import Link from "next/link";
import type { MilestoneWithClient } from "@/lib/data/milestones";
import { MILESTONE_TYPES } from "@/lib/core/constants";
import { daysUntil, formatDate } from "@/lib/core/dates";
import { DaysFigure } from "@/components/aurora/DaysFigure";
import { Panel } from "@/components/aurora/Panel";

export function ComingUp({ upcoming, overdue }: { upcoming: MilestoneWithClient[]; overdue: MilestoneWithClient[] }) {
  const rows = [...overdue, ...upcoming].slice(0, 9);
  return (
    <Panel
      title="Coming up"
      aside={
        <Link href="/dates" className="link">
          All dates
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="py-3 text-[14px] text-muted">No dates in the next 45 days.</p>
      ) : (
        <ul>
          {rows.map((m) => (
            <li key={m.id} className="flex items-baseline gap-4 border-b border-border py-3 last:border-0">
              <span className="num w-[86px] shrink-0 text-[12px] text-muted">{formatDate(m.date, false)}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/clients/${m.client.id}?tab=dates`} className="text-[14px] text-text hover:underline">
                  {m.title}
                </Link>
                <p className="text-[12px] text-muted">
                  {m.client.name}, {MILESTONE_TYPES[m.type].label}
                </p>
              </div>
              <DaysFigure daysLeft={daysUntil(m.date)} size="sm" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
