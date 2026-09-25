import { cn } from "@/lib/utils";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/api/auth/logout" method="post">
      <button type="submit" className={cn("inline-flex h-8 items-center rounded-[3px] px-2.5 text-[13px] text-muted transition hover:bg-surface-2 hover:text-text", className)}>
        Sign out
      </button>
    </form>
  );
}
