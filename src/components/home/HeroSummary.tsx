import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/core/constants";
import { greeting } from "@/lib/core/dates";
import { HealthOrb } from "@/components/aurora/HealthOrb";

export function HeroSummary({
  ownerName,
  counts,
  dueToday,
  overdue,
}: {
  ownerName: string;
  counts: { on_track: number; at_risk: number; blocked: number };
  dueToday: number;
  overdue: number;
}) {
  const now = new Date();
  const total = counts.on_track + counts.at_risk + counts.blocked;
  const parts: string[] = [];
  if (overdue > 0) parts.push(`${overdue} overdue`);
  if (dueToday > 0) parts.push(`${dueToday} ${dueToday === 1 ? "task" : "tasks"} due today`);
  if (counts.blocked > 0) parts.push(`${counts.blocked} ${counts.blocked === 1 ? "client" : "clients"} blocked`);
  const summary =
    total === 0 ? "No clients yet. Add your first one." : parts.length ? parts.join(". ") + "." : "Nothing due today.";

  return (
    <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-sm text-muted">{formatInTimeZone(now, TIMEZONE, "EEEE d MMMM yyyy")}, Abu Dhabi</p>
        <h1 className="font-display text-[30px] leading-[1.05] sm:text-[38px]">
          {greeting(now)}, {ownerName.split(" ")[0]}.
        </h1>
        <p className="mt-2 text-sm text-text-2 sm:text-[15px]">{summary}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="pill pill-ok">
          <HealthOrb health="on_track" pulse={false} className="!size-2" /> {counts.on_track} on track
        </span>
        <span className="pill pill-warn">
          <HealthOrb health="at_risk" pulse={false} className="!size-2" /> {counts.at_risk} at risk
        </span>
        <span className="pill pill-bad">
          <HealthOrb health="blocked" pulse={false} className="!size-2" /> {counts.blocked} blocked
        </span>
      </div>
    </section>
  );
}
