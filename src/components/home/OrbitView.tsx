"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Health } from "@/lib/db/schema";
import { HEALTH, phaseLabel, phaseRing } from "@/lib/core/constants";
import { formatDate, nowDubai } from "@/lib/core/dates";
import { HealthMark } from "@/components/aurora/HealthMark";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";

export type OrbitClient = {
  id: string;
  name: string;
  code: string;
  health: Health;
  phase: string;
  activityCount14d: number;
  nextStep: string | null;
  nextMilestone: { title: string; date: string } | null;
};

const RING_R: Record<1 | 2 | 3, number> = { 1: 112, 2: 188, 3: 264 };
const RING_LABEL: Record<1 | 2 | 3, string> = { 1: "Live", 2: "Build and test", 3: "Scope" };

/** Two decimal rounding keeps server and client markup byte identical. */
const rd = (n: number) => Math.round(n * 100) / 100;

const FILL: Record<Health, string> = { on_track: "var(--ok)", at_risk: "var(--warn)", blocked: "var(--bad)" };

/**
 * The orbit: a technical drawing, not a solar system.
 * Rings are hairlines. Each client is a solid mark whose size follows the last 14 days of activity
 * and whose colour is its health. Inner ring is live, outer ring is still in scope.
 */
export function OrbitView({ clients }: { clients: OrbitClient[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<OrbitClient | null>(null);
  const now = nowDubai();
  const compact = useMediaQuery("(max-width: 640px)");
  const scale = compact ? 0.74 : 1;
  const SIZE = compact ? 480 : 640;
  const C = SIZE / 2;
  const r = (ring: 1 | 2 | 3) => Math.round(RING_R[ring] * scale);

  const placed = useMemo(() => {
    const maxAct = Math.max(1, ...clients.map((c) => c.activityCount14d));
    const groups: Record<1 | 2 | 3, OrbitClient[]> = { 1: [], 2: [], 3: [] };
    for (const c of clients) groups[phaseRing(c.phase)].push(c);
    const out: { client: OrbitClient; ring: 1 | 2 | 3; angle: number; radius: number }[] = [];
    ([1, 2, 3] as const).forEach((ring) => {
      const list = groups[ring];
      const offset = ring === 1 ? -40 : ring === 2 ? 20 : -140;
      list.forEach((client, i) => {
        const angle = offset + (360 / Math.max(list.length, 1)) * i;
        const radius = Math.round((7 + (client.activityCount14d / maxAct) * 9) * (compact ? 0.85 : 1));
        out.push({ client, ring, angle, radius });
      });
    });
    return out;
  }, [clients, compact]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Orbit view of all clients">
        {([3, 2, 1] as const).map((ring) => (
          <g key={ring}>
            <circle cx={C} cy={C} r={r(ring)} fill="none" stroke="var(--border-strong)" strokeWidth={1} strokeDasharray={ring === 3 ? "1 5" : undefined} />
            {Array.from({ length: 4 }).map((_, i) => {
              const a = ((90 * i - 90) * Math.PI) / 180;
              return <line key={i} x1={rd(C + (r(ring) - 4) * Math.cos(a))} y1={rd(C + (r(ring) - 4) * Math.sin(a))} x2={rd(C + (r(ring) + 4) * Math.cos(a))} y2={rd(C + (r(ring) + 4) * Math.sin(a))} stroke="var(--border-strong)" strokeWidth={1} />;
            })}
            <text x={C + 8} y={C - r(ring) - 6} fill="var(--muted)" fontSize={compact ? 10 : 11} style={{ fontFamily: "var(--font-mono)" }}>
              {RING_LABEL[ring]}
            </text>
          </g>
        ))}

        {/* Today */}
        <circle cx={C} cy={C} r={compact ? 30 : 36} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1} />
        <text x={C} y={C + 6} textAnchor="middle" fill="var(--text)" fontSize={compact ? 26 : 30} style={{ fontFamily: "var(--font-display)" }}>
          {now.getDate()}
        </text>
        <text x={C} y={C + (compact ? 44 : 52)} textAnchor="middle" fill="var(--muted)" fontSize={11} style={{ fontFamily: "var(--font-mono)" }}>
          {now.toLocaleString("en-GB", { month: "long" })}
        </text>

        {placed.map(({ client, ring, angle, radius }) => {
          const a = (angle * Math.PI) / 180;
          const x = rd(C + r(ring) * Math.cos(a));
          const y = rd(C + r(ring) * Math.sin(a));
          const dim = hover && hover.id !== client.id;
          return (
            <g
              key={client.id}
              style={{ cursor: "pointer", opacity: client.phase === "on_hold" ? 0.45 : dim ? 0.4 : 1, transition: "opacity 0.2s ease" }}
              onMouseEnter={() => setHover(client)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(client)}
              onBlur={() => setHover(null)}
              onClick={() => router.push(`/clients/${client.id}`)}
              tabIndex={0}
              role="link"
              aria-label={`${client.name}, ${HEALTH[client.health].label}, ${phaseLabel(client.phase)}`}
            >
              <circle cx={x} cy={y} r={radius + 3} fill="var(--bg)" />
              <circle cx={x} cy={y} r={radius} fill={FILL[client.health]} />
              <text x={x} y={y + radius + 16} textAnchor="middle" fill="var(--text-2)" fontSize={12} style={{ fontFamily: "var(--font-mono)" }}>
                {client.code}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (
        <div className="float pointer-events-none absolute left-1/2 top-2 z-10 w-[min(320px,92%)] -translate-x-1/2 p-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="serif text-[19px] leading-tight text-text">{hover.name}</p>
            <span className="num text-[11px] text-muted">{hover.code}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
            <span>{phaseLabel(hover.phase)}</span>
            <HealthMark health={hover.health} className="text-[12px]" />
            <span>{hover.activityCount14d} updates in 14 days</span>
          </div>
          {hover.nextStep && <p className="mt-2 text-[13px] text-text-2">Next: {hover.nextStep}</p>}
          {hover.nextMilestone && (
            <p className="mt-1 text-[12px] text-text-2">
              {hover.nextMilestone.title}, <span className="num">{formatDate(hover.nextMilestone.date)}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[12px] text-muted">
        {(["on_track", "at_risk", "blocked"] as Health[]).map((h) => (
          <HealthMark key={h} health={h} className="text-[12px] font-normal text-muted" />
        ))}
        <span>Mark size follows activity in the last 14 days</span>
      </div>
    </div>
  );
}
