"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  /** Days left until the date. Negative when overdue. */
  daysLeft: number;
  /** Total span in days used to draw progress. Defaults to 30. */
  span?: number;
  size?: number;
  stroke?: number;
  done?: boolean;
  className?: string;
  caption?: string;
};

function tone(daysLeft: number, done?: boolean) {
  if (done) return "var(--ok)";
  if (daysLeft < 0) return "var(--bad)";
  if (daysLeft <= 3) return "var(--bad)";
  if (daysLeft <= 10) return "var(--warn)";
  return "var(--teal)";
}

export function CountdownRing({ daysLeft, span = 30, size = 56, stroke = 4, done, className, caption }: Props) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const remaining = done ? 0 : Math.max(0, Math.min(1, daysLeft / span));
  const progress = 1 - remaining; // ring fills as the date approaches
  const color = tone(daysLeft, done);
  const overdue = daysLeft < 0 && !done;
  const label = done ? "✓" : overdue ? `+${Math.abs(daysLeft)}` : String(daysLeft);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-strong)" strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: reduce ? c * (1 - progress) : c }}
          animate={{ strokeDashoffset: c * (1 - progress) }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={cn("num font-semibold", size >= 64 ? "text-lg" : "text-[13px]")} style={{ color }}>
          {label}
        </span>
        {caption && <span className="mt-0.5 text-[9px] uppercase tracking-wider text-muted">{caption}</span>}
      </div>
    </div>
  );
}
