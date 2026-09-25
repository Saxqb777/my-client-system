import type { Health } from "@/lib/db/schema";
import { HEALTH } from "@/lib/core/constants";
import { cn } from "@/lib/utils";

const TEXT: Record<Health, string> = { on_track: "text-ok", at_risk: "text-warn", blocked: "text-bad" };

/** Health as a word, with a small ink square in front. */
export function HealthMark({ health, className, swatch = true }: { health: Health; className?: string; swatch?: boolean }) {
  const meta = HEALTH[health];
  return (
    <span className={cn("inline-flex items-center gap-2 text-[13px] font-medium", TEXT[health], className)}>
      {swatch && <span className={cn("swatch", `swatch-${meta.css}`)} aria-hidden />}
      {meta.label}
    </span>
  );
}

export function HealthSwatch({ health, className }: { health: Health; className?: string }) {
  const meta = HEALTH[health];
  return <span className={cn("swatch", `swatch-${meta.css}`, className)} role="img" aria-label={meta.label} title={meta.label} />;
}

export function healthText(health: Health) {
  return TEXT[health];
}
