import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  hint,
  action,
  className,
  compact,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-6" : "py-12", className)}>
      <div className="mb-3 size-10 rounded-full border border-dashed border-border-strong" />
      <p className="text-sm font-medium text-text-2">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
