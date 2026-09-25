"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import type { Health } from "@/lib/db/schema";
import { HEALTH, phaseLabel, phaseRing } from "@/lib/core/constants";
import { formatDate, nowDubai } from "@/lib/core/dates";
import { cn } from "@/lib/utils";
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

const RING_BASE: Record<1 | 2 | 3, { r: number; dur: number; reverse: boolean }> = {
  1: { r: 118, dur: 140, reverse: false },
  2: { r: 192, dur: 190, reverse: true },
  3: { r: 268, dur: 250, reverse: false },
};

/** Two decimal rounding keeps server and client markup byte identical. */
const rd = (n: number) => Math.round(n * 100) / 100;

function spinStyle(dur: number, reverse: boolean): string {
  return reverse ? `spin ${dur}s linear infinite reverse` : `spin ${dur}s linear infinite`;
}

const HEALTH_VAR: Record<Health, string> = {
  on_track: "var(--ok)",
  at_risk: "var(--warn)",
  blocked: "var(--bad)",
};

export function OrbitView({ clients }: { clients: OrbitClient[] }) {
  const router = useRouter();
  const [hover, setHover] = useState<OrbitClient | null>(null);
  const now = nowDubai();
  const compact = useMediaQuery("(max-width: 640px)");
  // Phones get tighter rings so labels stay legible when the SVG scales down.
  const scale = compact ? 0.72 : 1;
  const SIZE = compact ? 470 : 640;
  const C = SIZE / 2;
  const RINGS = {
    1: { ...RING_BASE[1], r: Math.round(RING_BASE[1].r * scale) },
    2: { ...RING_BASE[2], r: Math.round(RING_BASE[2].r * scale) },
    3: { ...RING_BASE[3], r: Math.round(RING_BASE[3].r * scale) },
  } as const;

  const placed = useMemo(() => {
    const maxAct = Math.max(1, ...clients.map((c) => c.activityCount14d));
    const groups: Record<1 | 2 | 3, OrbitClient[]> = { 1: [], 2: [], 3: [] };
    for (const c of clients) groups[phaseRing(c.phase)].push(c);
    const out: { client: OrbitClient; ring: 1 | 2 | 3; angle: number; radius: number }[] = [];
    (Object.keys(groups) as unknown as (1 | 2 | 3)[]).forEach((ringKey) => {
      const ring = Number(ringKey) as 1 | 2 | 3;
      const list = groups[ring];
      const offset = ring === 1 ? -90 : ring === 2 ? -30 : -150;
      list.forEach((client, i) => {
        const angle = offset + (360 / Math.max(list.length, 1)) * i;
        const radius = Math.round((11 + (client.activityCount14d / maxAct) * 13) * (compact ? 0.85 : 1));
        out.push({ client, ring, angle, radius });
      });
    });
    return out;
  }, [clients, compact]);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Orbit view of all clients">
        <defs>
          <filter id="orbit-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="orbit-core">
            <stop offset="0%" stopColor="var(--teal)" stopOpacity="0.9" />
            <stop offset="60%" stopColor="var(--teal)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--teal)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Rings with tick marks, like a star chart */}
        {([3, 2, 1] as const).map((ring) => (
          <g key={ring}>
            <circle cx={C} cy={C} r={RINGS[ring].r} fill="none" stroke="var(--border)" strokeWidth={1} strokeDasharray={ring === 3 ? "2 6" : undefined} />
            {Array.from({ length: ring === 1 ? 12 : ring === 2 ? 24 : 36 }).map((_, i) => {
              const a = ((360 / (ring === 1 ? 12 : ring === 2 ? 24 : 36)) * i * Math.PI) / 180;
              const r1 = RINGS[ring].r - 3;
              const r2 = RINGS[ring].r + 3;
              return <line key={i} x1={rd(C + r1 * Math.cos(a))} y1={rd(C + r1 * Math.sin(a))} x2={rd(C + r2 * Math.cos(a))} y2={rd(C + r2 * Math.sin(a))} stroke="var(--border)" strokeWidth={1} opacity={0.6} />;
            })}
          </g>
        ))}

        {/* Core: today */}
        <circle cx={C} cy={C} r={compact ? 54 : 70} fill="url(#orbit-core)" />
        <circle cx={C} cy={C} r={compact ? 26 : 30} fill="var(--bg-2)" stroke="var(--border-strong)" />
        <text x={C} y={C - 2} textAnchor="middle" className="font-display" fill="var(--text)" fontSize={26} fontWeight={600}>
          {now.getDate()}
        </text>
        <text x={C} y={C + 15} textAnchor="middle" fill="var(--muted)" fontSize={9} letterSpacing={2} style={{ fontFamily: "var(--font-mono)" }}>
          {now.toLocaleString("en-GB", { month: "short" }).toUpperCase()}
        </text>

        {/* Orbiting clients */}
        {([1, 2, 3] as const).map((ring) => {
          const cfg = RINGS[ring];
          const nodes = placed.filter((p) => p.ring === ring);
          if (nodes.length === 0) return null;
          return (
            <g
              key={ring}
              data-orbit-ring
              style={{
                transformOrigin: `${C}px ${C}px`,
                animation: spinStyle(cfg.dur, cfg.reverse),
              }}
            >
              {nodes.map(({ client, angle, radius }) => {
                const a = (angle * Math.PI) / 180;
                const x = rd(C + cfg.r * Math.cos(a));
                const y = rd(C + cfg.r * Math.sin(a));
                const color = HEALTH_VAR[client.health];
                const dim = client.phase === "on_hold";
                return (
                  <g
                    key={client.id}
                    data-orbit-ring
                    style={{
                      transformOrigin: `${x}px ${y}px`,
                      animation: spinStyle(cfg.dur, !cfg.reverse),
                      cursor: "pointer",
                      opacity: dim ? 0.45 : hover && hover.id !== client.id ? 0.55 : 1,
                      transition: "opacity 0.25s ease",
                    }}
                    onMouseEnter={() => setHover(client)}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover(client)}
                    onBlur={() => setHover(null)}
                    onClick={() => router.push(`/clients/${client.id}`)}
                    tabIndex={0}
                    role="link"
                    aria-label={`${client.name}, ${HEALTH[client.health].label}, ${phaseLabel(client.phase)}`}
                  >
                    <circle cx={x} cy={y} r={radius + 10} fill={color} opacity={0.12} />
                    <circle cx={x} cy={y} r={radius} fill={color} filter="url(#orbit-glow)" />
                    <circle cx={rd(x - radius * 0.3)} cy={rd(y - radius * 0.3)} r={rd(radius * 0.3)} fill="white" opacity={0.55} />
                    <text x={x} y={y + radius + 15} textAnchor="middle" fill="var(--text-2)" fontSize={11} fontWeight={600} style={{ fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
                      {client.code}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {hover && (
          <motion.div
            key={hover.id}
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="glass glass-sm pointer-events-none absolute left-1/2 top-3 z-10 w-[min(320px,90%)] -translate-x-1/2 p-3.5"
          >
            <div className="flex items-center gap-2">
              <span className={cn("orb", `orb-${HEALTH[hover.health].css}`)} />
              <p className="font-display text-[15px] font-semibold">{hover.name}</p>
              <span className="num ml-auto text-[11px] text-muted">{hover.code}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="pill !py-0.5 !text-[11px]">{phaseLabel(hover.phase)}</span>
              <span className={cn("pill !py-0.5 !text-[11px]", `pill-${HEALTH[hover.health].css}`)}>{HEALTH[hover.health].label}</span>
              <span className="text-[11px] text-muted">{hover.activityCount14d} updates in 14 days</span>
            </div>
            {hover.nextStep && <p className="mt-2 text-[13px] text-text-2">Next: {hover.nextStep}</p>}
            {hover.nextMilestone && (
              <p className="mt-1 text-[12px] text-teal">
                {hover.nextMilestone.title}: {formatDate(hover.nextMilestone.date)}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-3 flex flex-col gap-2 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><RingMark size={8} /> Inner ring: go live</span>
          <span className="inline-flex items-center gap-1.5"><RingMark size={11} /> Middle: build and test</span>
          <span className="inline-flex items-center gap-1.5"><RingMark size={14} dashed /> Outer: scope</span>
        </div>
        <div className="flex items-center gap-4">
          {(["on_track", "at_risk", "blocked"] as Health[]).map((h) => (
            <span key={h} className="inline-flex items-center gap-1.5">
              <span className={cn("orb !size-2", `orb-${HEALTH[h].css}`)} /> {HEALTH[h].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RingMark({ size, dashed }: { size: number; dashed?: boolean }) {
  return (
    <span
      className="inline-block rounded-full border border-muted/70"
      style={{ width: size, height: size, borderStyle: dashed ? "dashed" : "solid" }}
    />
  );
}
