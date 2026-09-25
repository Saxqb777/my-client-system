"use client";

import { useState, type FormEvent } from "react";
import { cn } from "@/lib/utils";
import { Kbd } from "@/components/aurora/Kbd";
import { useQuickLog } from "./QuickLogProvider";

/** One line under the masthead. Type what happened, press Enter, confirm what Orbit understood. */
export function QuickLogBar({ className }: { className?: string }) {
  const { open, openPalette } = useQuickLog();
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    if (text.trim().length < 2) return;
    open(text.trim(), { autoParse: true });
    setText("");
  }

  return (
    <form onSubmit={submit} className={cn("flex items-center gap-4 border-b border-border py-3", className)}>
      <label htmlFor="quick-log" className="serif-italic shrink-0 text-[19px] text-muted">
        Log
      </label>
      <input
        id="quick-log"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened. Client, update, dates, who you are waiting on."
        aria-label="Quick log"
        className="min-w-0 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
      />
      <button type="button" onClick={openPalette} className="hidden items-center gap-1 sm:flex" aria-label="Open command palette">
        <Kbd>⌘K</Kbd>
      </button>
    </form>
  );
}
