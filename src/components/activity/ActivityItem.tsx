import Link from "next/link";
import type { Activity, Client } from "@/lib/db/schema";
import { ACTIVITY_SOURCES, ACTIVITY_TYPES } from "@/lib/core/constants";
import { formatTime } from "@/lib/core/dates";
import { TONE_TEXT, activityTone } from "./tones";
import { ActivityRowMenu } from "./ActivityRowMenu";
import { UndoButton } from "@/components/changes/UndoButton";
import { cn } from "@/lib/utils";

export type ActivityChange = { id: string; undone: boolean; meetingId: string | null };

export function ActivityItem({ activity, client, showClient = true, compact, change }: { activity: Activity; client?: Pick<Client, "id" | "name" | "code"> | null; showClient?: boolean; compact?: boolean; change?: ActivityChange | null }) {
  const meta = ACTIVITY_TYPES[activity.type];
  return (
    <li className={cn("group grid grid-cols-[48px_1fr_auto] items-start gap-x-3 border-b border-border last:border-0", compact ? "py-2" : "py-3")}>
      <span className="num pt-[3px] text-[12px] text-muted">{formatTime(activity.occurredAt)}</span>
      <div className="min-w-0">
        <p className={cn("text-text", compact ? "text-[13px]" : "text-[14.5px]")}>{activity.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-muted">
          {showClient && client && (
            <Link href={`/clients/${client.id}`} className="num text-text-2 hover:underline">
              {client.code}
            </Link>
          )}
          <span className={TONE_TEXT[activityTone(activity.type)]}>{meta.label}</span>
          {activity.source !== "app" && <span>{ACTIVITY_SOURCES[activity.source]}</span>}
          {change && (
            <Link href={`/changes?meeting=${change.meetingId ?? ""}`} className="hover:underline">
              {change.undone ? "Orbit change, undone" : "Orbit change"}
            </Link>
          )}
          {activity.tags.map((tag) => (
            <span key={tag} className="text-faint">
              {tag}
            </span>
          ))}
        </p>
        {activity.body && !compact && <p className="mt-1.5 max-w-3xl whitespace-pre-line text-[13.5px] leading-relaxed text-text-2">{activity.body}</p>}
      </div>
      <span className="flex items-center gap-1">
        {change && !change.undone && <UndoButton changeId={change.id} undone={false} />}
        <ActivityRowMenu id={activity.id} className="opacity-0 transition group-hover:opacity-100 focus-within:opacity-100" />
      </span>
    </li>
  );
}
