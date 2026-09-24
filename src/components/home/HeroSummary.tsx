import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/core/constants";
import { greeting } from "@/lib/core/dates";
import { HealthOrb } from "@/components/aurora/HealthOrb";

export function HeroSummary({
  ownerName,
  counts,
  attention,
}: {
  ownerName: string;
  counts: { on_track: number; at_risk: number; blocked: number };
  attention: number;
}) {
  const now = new Date();
  const total = counts.on_track + counts.at_risk + counts.blocked;
  return (
    <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="eyebrow mb-2">{formatInTimeZone(now, TIMEZONE, "EEEE d MMMM yyyy")} · Abu Dhabi</p>
        <h1 className="font-display text-[30px] font-semibold leading-[1.05] sm:text-[38px]">
          {greeting(now)}, {ownerName.split(" ")[0]}.
        </h1>
        <p className="mt-2 text-sm text-muted sm:text-[15px]">
          {total === 0
            ? "No clients yet. Add your first one to start the orbit."
            : attention === 0
              ? `All ${total} clients are moving. Nothing is overdue.`
              : `${attention} ${attention === 1 ? "item needs" : "items need"} your attention today.`}
        </p>
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
