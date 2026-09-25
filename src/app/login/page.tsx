import type { Metadata } from "next";
import { AuroraBackground } from "@/components/aurora/AuroraBackground";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";
  return (
    <main className="relative flex min-h-dvh items-center justify-center p-6">
      <AuroraBackground />
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex items-center gap-3">
          <OrbitMark />
          <p className="font-display text-2xl leading-none">Orbit</p>
        </div>
        <div className="glass p-6">
          <h1 className="font-display text-xl">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Enter your password.</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-faint">Sessions last 30 days on this device.</p>
      </div>
    </main>
  );
}

function OrbitMark() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="20" stroke="var(--border-strong)" />
      <circle cx="22" cy="22" r="12" stroke="var(--border-strong)" strokeDasharray="3 4" />
      <circle cx="22" cy="22" r="4.5" fill="var(--teal)" style={{ filter: "drop-shadow(0 0 8px var(--teal))" }} />
      <circle cx="36.5" cy="14" r="3" fill="var(--violet)" style={{ filter: "drop-shadow(0 0 6px var(--violet))" }} />
      <circle cx="12" cy="31" r="2.4" fill="var(--magenta)" style={{ filter: "drop-shadow(0 0 6px var(--magenta))" }} />
    </svg>
  );
}
