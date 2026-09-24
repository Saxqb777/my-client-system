import type { ReactNode } from "react";
import { AuroraBackground } from "@/components/aurora/AuroraBackground";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QuickLogProvider } from "@/components/quicklog/QuickLogProvider";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import type { NavClient } from "./nav";

export function AppShell({ children, clients, ownerName }: { children: ReactNode; clients: NavClient[]; ownerName: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <QuickLogProvider clients={clients}>
        <div className="relative min-h-dvh">
          <AuroraBackground />
          <Sidebar ownerName={ownerName} />
          <div className="lg:pl-[232px]">
            <TopBar />
            <main className="mx-auto w-full max-w-[1400px] px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-12 lg:pt-7">{children}</main>
          </div>
          <MobileNav />
        </div>
      </QuickLogProvider>
    </TooltipProvider>
  );
}
