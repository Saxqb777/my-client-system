import Link from "next/link";
import type { Dashboard } from "@/lib/data/dashboard";
import { ACTIVITY_TYPES } from "@/lib/core/constants";
import { relativeTime } from "@/lib/core/dates";
import { GlassCard, CardTitle } from "@/components/aurora/GlassCard";
import { Badge } from "@/components/ui/badge";
import { activityTone } from "@/components/activity/tones";

export function RecentActivity({ items }: { items: Dashboard["recent"] }) {
  return (
    <GlassCard>
      <div className="flex items-end justify-between">
        <CardTitle>Recent activity</CardTitle>
        <Link href="/activity" className="link text-xs">
          Full log
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">No activity yet</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {items.slice(0, 8).map((a) => (
            <li key={a.id} className="flex items-start gap-3 py-2.5">
              <Badge tone={activityTone(a.type)} className="mt-0.5 !py-0.5 !text-[11px]">
                {ACTIVITY_TYPES[a.type].label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{a.title}</p>
                <p className="flex items-center gap-2 text-[11px] text-muted">
                  <Link href={`/clients/${a.client!.id}`} className="num text-teal hover:underline">
                    {a.client!.code}
                  </Link>
                  <span>{relativeTime(a.occurredAt)}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
