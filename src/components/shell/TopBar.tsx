import Link from "next/link";
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
        <ThemeToggle />
      </div>
    </header>
  );
}
