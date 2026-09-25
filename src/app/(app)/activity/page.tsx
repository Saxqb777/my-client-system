import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { activitySourceEnum, activityTypeEnum, type ActivitySource, type ActivityType } from "@/lib/db/schema";
import { listActivities } from "@/lib/data/activities";
import { listClients } from "@/lib/data/clients";
import { PageHeader } from "@/components/aurora/PageHeader";
import { GlassCard } from "@/components/aurora/GlassCard";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { ActivityFilters } from "@/components/activity/ActivityFilters";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Activity" };

type Params = Record<string, string | string[] | undefined>;
const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const type = str(p.type);
  const source = str(p.source);
  const limit = Math.min(500, Math.max(30, Number(str(p.limit) ?? 60) || 60));
  const [clients, activities] = await Promise.all([
    listClients(),
    listActivities({
      clientId: str(p.client),
      type: type && (activityTypeEnum.enumValues as string[]).includes(type) ? (type as ActivityType) : undefined,
      source: source && (activitySourceEnum.enumValues as string[]).includes(source) ? (source as ActivitySource) : undefined,
      q: str(p.q),
      limit,
    }),
  ]);
  const more = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (typeof v === "string" && k !== "limit") more.set(k, v);
  more.set("limit", String(limit + 60));

  return (
    <div className="animate-fade-up">
      <PageHeader title="Activity" />
      <Suspense>
        <ActivityFilters clients={clients.map((c) => ({ id: c.id, name: c.name, code: c.code, health: c.health }))} />
      </Suspense>
      <GlassCard>
        <ActivityFeed activities={activities} />
        {activities.length >= limit && (
          <div className="mt-4 flex justify-center">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/activity?${more.toString()}`}>Show more</Link>
            </Button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
