import type { Activity, Client } from "@/lib/db/schema";
import { formatDayHeading, toISODate } from "@/lib/core/dates";
import { EmptyState } from "@/components/aurora/EmptyState";
import { ActivityItem } from "./ActivityItem";

type Row = Activity & { client?: Client | null };

export function ActivityFeed({ activities, showClient = true, emptyHint }: { activities: Row[]; showClient?: boolean; emptyHint?: string }) {
  if (activities.length === 0) {
    return <EmptyState title="No activity yet" hint={emptyHint ?? "Updates you log appear here."} compact />;
  }
  const groups: { key: string; label: string; items: Row[] }[] = [];
  for (const a of activities) {
    const key = toISODate(a.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(a);
    else groups.push({ key, label: formatDayHeading(a.occurredAt), items: [a] });
  }
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key}>
          <h3 className="sticky top-14 z-10 mb-1 bg-[color-mix(in_oklab,var(--bg)_70%,transparent)] py-1 text-xs font-medium text-muted backdrop-blur lg:top-16">{g.label}</h3>
          <ul className="divide-y divide-border/60">
            {g.items.map((a) => (
              <ActivityItem key={a.id} activity={a} client={a.client ?? null} showClient={showClient} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
