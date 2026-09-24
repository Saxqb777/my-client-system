"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav";
import { useQuickLog } from "@/components/quicklog/QuickLogProvider";

export function MobileNav() {
  const pathname = usePathname();
  const quickLog = useQuickLog();
  const [home, clients, activity, settings] = NAV;
  const left = [home, clients];
  const right = [activity, settings];

  const Item = ({ item }: { item: (typeof NAV)[number] }) => {
    const active = isActive(pathname, item.href, item.exact);
    const Icon = item.icon;
    return (
      <Link
        href={item.href}
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium",
          active ? "text-teal" : "text-muted",
        )}
      >
        <Icon className="size-5" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-[color-mix(in_oklab,var(--bg)_75%,transparent)] backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-stretch">
        {left.map((i) => (
          <Item key={i.href} item={i} />
        ))}
        <button
          type="button"
          onClick={() => quickLog.open()}
          className="relative -mt-5 flex flex-1 flex-col items-center gap-1 text-[10px] font-medium text-text-2"
          aria-label="Log an update"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_10px_30px_-8px_var(--teal)]">
            <Sparkles className="size-5" />
          </span>
          Log
        </button>
        {right.map((i) => (
          <Item key={i.href} item={i} />
        ))}
      </div>
    </nav>
  );
}
