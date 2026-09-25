import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, hint, action, className, compact }: { title: string; hint?: string; action?: ReactNode; className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex flex-col items-start", compact ? "py-4" : "py-10", className)}>
      <p className="serif text-[20px] text-text">{title}</p>
      {hint && <p className="mt-1 max-w-md text-[13px] text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
