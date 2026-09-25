import type { Metadata } from "next";
import { OrbitMark } from "@/components/shell/OrbitMark";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : "/";
  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="flex items-center gap-3 text-text">
          <OrbitMark size={30} />
          <p className="serif-italic text-[34px] leading-none">Orbit</p>
        </div>
        <p className="mt-3 text-[14px] text-muted">Client tracking for Saaqib.</p>
        <div className="mt-8 border-t border-ink pt-6">
          <h1 className="serif text-[26px]">Sign in</h1>
          <LoginForm next={next} />
        </div>
        <p className="mt-8 text-[12px] text-faint">Sessions last 30 days on this device.</p>
      </div>
    </main>
  );
}
