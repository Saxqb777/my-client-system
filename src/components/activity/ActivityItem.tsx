import Link from "next/link";
import type { Activity, Client } from "@/lib/db/schema";
import { ACTIVITY_SOURCES, ACTIVITY_TYPES } from "@/lib/core/constants";
import { formatTime } from "@/lib/core/dates";
import { Badge } from "@/components/ui/badge";
import { activityTone, TONE_DOT } from "./tones";
import { ActivityRowMenu } from "./ActivityRowMenu";
import { cn } from "@/lib/utils";

export function ActivityItem({
  activity,
  client,
  showClient = true,
  compact,
}: {
  activity: Activity;
  client?: Pick<Client, "id" | "name" | "code"> | null;
  showClient?: boolean;
  compact?: boolean;
}) {
  const meta = ACTIVITY_TYPES[activity.type];
  return (
    <li className={cn("group relative flex gap-3", compact ? "py-2" : "py-3")}>
      <div className="flex w-12 shrink-0 flex-col items-end pt-0.5">
        <span className="num text-[11px] text-muted">{formatTime(activity.occurredAt)}</span>
      </div>
      <div className="relative flex flex-col items-center">
        <span className={cn("mt-1.5 size-2 rounded-full", TONE_DOT[activityTone(activity.type)])} />
        <span className="mt-1 w-px flex-1 bg-border" />
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {showClient && client && (
            <Link href={`/clients/${client.id}`} className="num text-[11px] font-medium text-teal hover:underline">
              {client.code}
            </Link>
          )}
          <Badge tone={activityTone(activity.type)} className="!py-0.5 !text-[11px]">
            {meta.label}
          </Badge>
          {activity.source !== "app" && <span className="text-[11px] text-faint">{ACTIVITY_SOURCES[activity.source]}</span>}
          {activity.isDemo && <span className="text-[10px] uppercase tracking-wider text-faint">demo</span>}
        </div>
        <p className={cn("mt-1 text-text", compact ? "text-[13px]" : "text-sm")}>{activity.title}</p>
        {activity.body && !compact && <p className="mt-1 whitespace-pre-line text-sm text-muted">{activity.body}</p>}
      </div>
      <ActivityRowMenu id={activity.id} className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100" />
    </li>
  );
}
