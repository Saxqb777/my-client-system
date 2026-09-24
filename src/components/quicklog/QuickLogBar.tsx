"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/aurora/Kbd";
import { useQuickLog } from "./QuickLogProvider";

const EXAMPLES = [
  "ADFH UAT signed off, go live moved to 15 Oct",
  "Call with Mariam, UAT start pushed by one week",
  "Waiting on Khalid for UAT sign off",
  "EDGE blocked: SSO access still pending with security",
  "Sent BRD v2 to Noura, follow up Monday",
];

export function QuickLogBar({ className }: { className?: string }) {
  const { open, openPalette } = useQuickLog();
  const [text, setText] = useState("");
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % EXAMPLES.length), 4200);
    return () => clearInterval(t);
  }, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    open(text.trim(), { autoParse: true });
    setText("");
  }

  return (
    <form onSubmit={submit} className={cn("group relative", className)}>
      <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-teal" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Log anything: "${EXAMPLES[i]}"`}
        aria-label="Quick log"
        className="field h-10 rounded-full pl-10 pr-24 text-[14px] shadow-[0_0_0_0_transparent] transition focus:shadow-[0_10px_40px_-18px_var(--teal)]"
      />
      <button
        type="button"
        onClick={openPalette}
        className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-full px-2 py-1 text-muted transition hover:text-text"
        aria-label="Open command palette"
      >
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </button>
    </form>
  );
}
