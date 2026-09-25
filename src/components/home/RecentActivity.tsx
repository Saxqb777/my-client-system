import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { ACTIVITY_TYPES } from "@/lib/core/constants";
import { formatDate, toISODate } from "@/lib/core/dates";
import { Panel } from "@/components/aurora/Panel";
import { TONE_TEXT, activityTone } from "@/components/activity/tones";
import { cn } from "@/lib/utils";

export function RecentActivity({ items }: { items: Dashboard["recent"] }) {
  return (
    <Panel
      title="Recent activity"
      aside={
        <Link href="/activity" className="link">
          Full log
        </Link>
      }
    >
      {items.length === 0 ? (
        <p className="py-3 text-[14px] text-muted">No activity yet.</p>
      ) : (
        <ul>
          {items.slice(0, 10).map((a) => (
            <li key={a.id} className="grid grid-cols-[72px_1fr] items-baseline gap-x-4 border-b border-border py-2.5 last:border-0 sm:grid-cols-[86px_64px_1fr]">
              <span className="num text-[12px] text-muted">{formatDate(toISODate(a.occurredAt), false)}</span>
              <Link href={`/clients/${a.client!.id}`} className="num hidden text-[12px] text-text-2 hover:underline sm:block">
                {a.client!.code}
              </Link>
              <p className="min-w-0 text-[14px] text-text">
                <span className="num mr-2 text-[12px] text-text-2 sm:hidden">{a.client!.code}</span>
                {a.title} <span className={cn("ml-1 text-[12px]", TONE_TEXT[activityTone(a.type)])}>{ACTIVITY_TYPES[a.type].label}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
