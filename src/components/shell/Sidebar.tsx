"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/core/text";
import { Kbd } from "@/components/aurora/Kbd";
import { OrbitMark } from "./OrbitMark";
import { NAV, isActive } from "./nav";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";
import { useQuickLog } from "@/components/quicklog/QuickLogProvider";

export function Sidebar({ ownerName }: { ownerName: string }) {
  const pathname = usePathname();
  const quickLog = useQuickLog();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[232px] flex-col border-r border-border bg-[color-mix(in_oklab,var(--bg)_55%,transparent)] px-4 py-5 backdrop-blur-xl lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2">
        <OrbitMark size={34} />
        <div>
          <p className="font-display text-[20px] font-semibold leading-none">Orbit</p>
          <p className="mt-1 text-[11px] text-muted">Work command center</p>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => quickLog.open()}
        className="mt-6 flex items-center gap-2 rounded-[12px] border border-border bg-surface px-3 py-2.5 text-left text-sm text-text-2 transition hover:border-border-strong hover:bg-surface-2 hover:text-text"
      >
        <Sparkles className="size-4 text-teal" />
        <span className="flex-1">Log an update</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="mt-6 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex h-10 items-center gap-3 rounded-[12px] px-3 text-sm font-medium transition",
                active ? "bg-surface-2 text-text" : "text-text-2 hover:bg-surface hover:text-text",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-teal shadow-[0_0_10px_var(--teal)]" />
              )}
              <Icon className={cn("size-[18px]", active ? "text-teal" : "text-muted group-hover:text-text-2")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3">
        <div className="flex items-center gap-3 rounded-[14px] border border-border bg-surface px-3 py-2.5">
          <span className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--teal),var(--violet))] text-xs font-semibold text-white">
            {initials(ownerName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{ownerName}</p>
            <p className="text-[11px] text-muted">Abu Dhabi</p>
          </div>
          <ThemeToggle className="size-8" />
        </div>
        <SignOutButton className="w-full justify-start" />
      </div>
    </aside>
  );
}
