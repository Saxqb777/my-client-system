"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV, isActive } from "./nav";
import { useQuickLog } from "@/components/quicklog/QuickLogProvider";

function Item({ item, pathname }: { item: (typeof NAV)[number]; pathname: string }) {
  const active = isActive(pathname, item.href, item.exact);
  return (
    <Link href={item.href} className={cn("flex flex-1 items-center justify-center py-3.5 text-[13px]", active ? "text-text underline decoration-signal decoration-2 underline-offset-[6px]" : "text-muted")}>
      {item.label}
    </Link>
  );
}

export function MobileNav() {
  const pathname = usePathname();
  const quickLog = useQuickLog();
  const [home, tasks, , clients, activity] = NAV;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg lg:hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-stretch">
        <Item item={home} pathname={pathname} />
        <Item item={tasks} pathname={pathname} />
        <button type="button" onClick={() => quickLog.open()} className="flex flex-1 items-center justify-center" aria-label="Log an update">
          <span className="flex size-9 items-center justify-center rounded-full bg-ink text-paper">
            <Plus className="size-4" />
          </span>
        </button>
        <Item item={clients} pathname={pathname} />
        <Item item={activity} pathname={pathname} />
      </div>
    </nav>
  );
}
