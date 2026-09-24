import Link from "next/link";
import { Hourglass } from "lucide-react";
import type { ClientSummary } from "@/lib/data/clients";
import { phaseLabel } from "@/lib/core/constants";
import { daysUntil, formatDate, relativeTime } from "@/lib/core/dates";
import { CountdownRing } from "@/components/aurora/CountdownRing";
import { HealthOrb } from "@/components/aurora/HealthOrb";

export function ClientCard({ client }: { client: ClientSummary }) {
  const hue = client.color ?? "200";
  const next = client.nextMilestone;
  return (
    <Link
      href={`/clients/${client.id}`}
      className="glass glass-hover group relative flex flex-col overflow-hidden p-5"
      style={{ ["--hue" as string]: hue }}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--hue)_80%_65%/0.9),transparent)]" />
      <div className="flex items-start gap-3">
        <HealthOrb health={client.health} size="lg" className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-display truncate text-[19px] font-semibold text-text">{client.name}</h3>
            <span className="num rounded-md border border-border px-1.5 py-0.5 text-[10px] text-muted">{client.code}</span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
            {client.fullName && client.fullName !== client.name ? `${client.fullName} · ` : ""}
            {phaseLabel(client.phase)}
            {client.archivedAt ? " · Archived" : ""}
          </p>
        </div>
      </div>

      <p className="mt-4 line-clamp-2 min-h-[40px] text-[13.5px] text-text-2">
        {client.nextStep ? (
          <>
            <span className="text-muted">Next: </span>
            {client.nextStep}
          </>
        ) : (
          <span className="text-faint">No next step set</span>
        )}
      </p>

      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        {next ? (
          <>
            <CountdownRing daysLeft={daysUntil(next.date)} span={30} size={44} stroke={3.5} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-text">{next.title}</p>
              <p className="text-[11px] text-muted">{formatDate(next.date)}</p>
            </div>
          </>
        ) : (
          <div className="flex-1 text-[12px] text-faint">No upcoming dates</div>
        )}
        <div className="text-right text-[11px] text-muted">
          <p className="num">{client.activityCount14d} updates · 14d</p>
          {client.waitingTasks > 0 ? (
            <p className="inline-flex items-center gap-1 text-warn">
              <Hourglass className="size-3" /> waiting on {client.waitingTasks}
            </p>
          ) : (
            <p>{client.lastActivityAt ? relativeTime(client.lastActivityAt) : "no activity"}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
