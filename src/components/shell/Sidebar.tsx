"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/aurora/Kbd";
import { OrbitMark } from "./OrbitMark";
import { NAV, isActive } from "./nav";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";
import { useQuickLog } from "@/components/quicklog/QuickLogProvider";

export function Sidebar({ ownerName, today }: { ownerName: string; today: string }) {
  const pathname = usePathname();
  const quickLog = useQuickLog();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] flex-col border-r border-border bg-bg-2 px-6 py-7 lg:flex">
      <Link href="/" className="flex items-center gap-2.5 text-text">
        <OrbitMark size={26} />
        <span className="serif-italic text-[27px] leading-none">Orbit</span>
      </Link>
      <p className="num mt-3 text-[11px] text-muted">{today}</p>

      <button
        type="button"
        onClick={() => quickLog.open()}
        className="mt-7 flex h-9 items-center justify-between rounded-[4px] border border-border-strong px-3 text-[13px] text-text-2 transition hover:border-text hover:text-text"
      >
        <span>Log an update</span>
        <Kbd>⌘K</Kbd>
      </button>

      <nav className="mt-9 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href, item.exact);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("relative flex h-9 items-center text-[15px] transition-colors", active ? "text-text" : "text-muted hover:text-text")}
            >
              {active && <span className="absolute -left-6 top-1/2 h-4 w-[2px] -translate-y-1/2 bg-signal" aria-hidden />}
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 text-[13px]">
        <div className="flex items-center justify-between border-t border-border pt-4">
          <div>
            <p className="text-text">{ownerName}</p>
            <p className="text-[11px] text-muted">Abu Dhabi</p>
          </div>
          <ThemeToggle className="size-8" />
        </div>
        <SignOutButton className="-ml-2.5" />
      </div>
    </aside>
  );
}
