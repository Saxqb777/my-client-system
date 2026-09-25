import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ClientSummary } from "@/lib/data/clients";
import { HEALTH_ORDER, phaseLabel } from "@/lib/core/constants";
import { countdownLabel } from "@/lib/core/dates";
import { GlassCard, CardTitle } from "@/components/aurora/GlassCard";
import { HealthOrb } from "@/components/aurora/HealthOrb";

export function AttentionList({ clients }: { clients: ClientSummary[] }) {
  const flagged = clients
    .filter((c) => c.health !== "on_track")
    .sort((a, b) => HEALTH_ORDER.indexOf(a.health) - HEALTH_ORDER.indexOf(b.health));
  return (
    <GlassCard>
      <div className="flex items-end justify-between">
        <CardTitle>At risk and blocked</CardTitle>
        <Link href="/clients" className="link text-xs">
          All clients
        </Link>
      </div>
      {flagged.length === 0 ? (
        <p className="mt-4 text-sm text-muted">All clients on track</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {flagged.map((c) => (
            <li key={c.id}>
              <Link href={`/clients/${c.id}`} className="group flex items-start gap-3 py-3">
                <HealthOrb health={c.health} size="lg" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-text">
                    {c.name}
                    <span className="text-[11px] font-normal text-muted">{phaseLabel(c.phase)}</span>
                  </p>
                  {c.nextStep && <p className="mt-0.5 line-clamp-2 text-[13px] text-text-2">Next: {c.nextStep}</p>}
                  {c.nextMilestone && (
                    <p className="mt-0.5 text-[11px] text-muted">
                      {c.nextMilestone.title} {countdownLabel(c.nextMilestone.date)}
                    </p>
                  )}
                </div>
                <ArrowUpRight className="size-4 text-faint transition group-hover:text-teal" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}
