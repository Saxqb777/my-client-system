import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

export function SignOutButton({ className, iconOnly }: { className?: string; iconOnly?: boolean }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button
        type="submit"
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-sm text-text-2 transition hover:bg-surface-2 hover:text-text",
          className,
        )}
        aria-label="Sign out"
      >
        <LogOut className="size-4" />
        {!iconOnly && <span>Sign out</span>}
      </button>
    </form>
  );
}
