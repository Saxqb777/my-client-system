import type { Health } from "@/lib/db/schema";
import { HEALTH } from "@/lib/core/constants";
import { cn } from "@/lib/utils";

type Props = {
  health: Health;
  size?: "sm" | "lg" | "xl";
  pulse?: boolean;
  label?: boolean;
  className?: string;
};

export function HealthOrb({ health, size = "sm", pulse, label, className }: Props) {
  const meta = HEALTH[health];
  const shouldPulse = pulse ?? health !== "on_track";
  const orb = (
    <span
      className={cn(
        "orb",
        `orb-${meta.css}`,
        size === "lg" && "orb-lg",
        size === "xl" && "orb-xl",
        shouldPulse && "orb-pulse",
        className,
      )}
      role="img"
      aria-label={meta.label}
      title={meta.label}
    />
  );
  if (!label) return orb;
  return (
    <span className="inline-flex items-center gap-2">
      {orb}
      <span className={cn("text-sm font-medium", `text-${meta.css}`)}>{meta.label}</span>
    </span>
  );
}

export function HealthPill({ health, className }: { health: Health; className?: string }) {
  const meta = HEALTH[health];
  return (
    <span className={cn("pill", `pill-${meta.css}`, className)}>
      <span className={cn("orb", `orb-${meta.css}`, "!size-2 !shadow-[0_0_8px_var(--orb)]")} />
      {meta.label}
    </span>
  );
}
