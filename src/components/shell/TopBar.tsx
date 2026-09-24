"use client";

import Link from "next/link";
import { QuickLogBar } from "@/components/quicklog/QuickLogBar";
import { OrbitMark } from "./OrbitMark";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[color-mix(in_oklab,var(--bg)_60%,transparent)] backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-3 px-4 sm:px-6 lg:h-16 lg:px-8">
        <Link href="/" className="flex items-center gap-2 lg:hidden">
          <OrbitMark size={28} />
          <span className="font-display text-lg font-semibold">Orbit</span>
        </Link>
        <div className="hidden flex-1 justify-center lg:flex">
          <QuickLogBar className="w-full max-w-[680px]" />
        </div>
        <div className="ml-auto flex items-center gap-1 lg:hidden">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
