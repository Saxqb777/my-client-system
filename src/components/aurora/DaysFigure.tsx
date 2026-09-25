import { cn } from "@/lib/utils";

/**
 * Days until a date as a plain figure. Big serif number, small unit.
 * Negative means overdue.
 */
export function DaysFigure({ daysLeft, done, size = "md", className }: { daysLeft: number; done?: boolean; size?: "sm" | "md" | "lg"; className?: string }) {
  const overdue = !done && daysLeft < 0;
  const tone = done ? "text-muted" : overdue ? "text-bad" : daysLeft <= 3 ? "text-warn" : "text-text";
  const n = Math.abs(daysLeft);
  const unit = done ? "done" : daysLeft === 0 ? "today" : overdue ? (n === 1 ? "day late" : "days late") : n === 1 ? "day" : "days";
  const figure = done ? "" : daysLeft === 0 ? "" : String(n);
  const numSize = size === "lg" ? "text-[44px] leading-none" : size === "md" ? "text-[28px] leading-none" : "text-[20px] leading-none";
  return (
    <span className={cn("inline-flex items-baseline gap-1.5 whitespace-nowrap", tone, className)}>
      {figure && <span className={cn("serif tabular-nums", numSize)}>{figure}</span>}
      <span className={cn("text-[12px]", figure ? "" : "font-medium")}>{unit}</span>
    </span>
  );
}
