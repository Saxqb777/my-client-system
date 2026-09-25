import Link from "next/link";
import { Settings } from "lucide-react";
import { OrbitMark } from "./OrbitMark";
import { ThemeToggle } from "./ThemeToggle";

/** Phone and tablet header. On desktop the sidebar carries the wordmark. */
export function TopBar() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-bg lg:hidden">
      <div className="flex h-12 items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 text-text">
          <OrbitMark size={22} />
          <span className="serif-italic text-[22px] leading-none">Orbit</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/settings" className="flex size-8 items-center justify-center text-muted hover:text-text" aria-label="Settings">
            <Settings className="size-4" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
