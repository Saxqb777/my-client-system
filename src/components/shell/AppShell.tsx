import type { ReactNode } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { TIMEZONE } from "@/lib/core/constants";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuickLogProvider } from "@/components/quicklog/QuickLogProvider";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { NavClient } from "./nav";

export function AppShell({ children, clients, ownerName }: { children: ReactNode; clients: NavClient[]; ownerName: string }) {
  const today = formatInTimeZone(new Date(), TIMEZONE, "EEEE d MMMM yyyy");
  return (
    <TooltipProvider delayDuration={200}>
      <QuickLogProvider clients={clients}>
        <div className="min-h-dvh">
          <Sidebar ownerName={ownerName} today={today} />
          <div className="lg:pl-[224px]">
            <TopBar />
            <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-10">{children}</main>
          </div>
          <MobileNav />
        </div>
      </QuickLogProvider>
    </TooltipProvider>
  );
}
