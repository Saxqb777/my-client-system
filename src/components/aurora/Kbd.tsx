import { cn } from "@/lib/utils";

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd className={cn("num inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] border border-border-strong px-1 text-[11px] text-muted", className)}>
      {children}
    </kbd>
  );
}
