"use client";

import { useMounted } from "@/lib/hooks/useMounted";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme : "light";
  const options = [
    { value: "light", label: "Paper", desc: "Ink on warm paper. The default." },
    { value: "dark", label: "Ink", desc: "The same page in reverse, for evenings." },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setTheme(o.value)}
          className={cn("rounded-[4px] border p-4 text-left transition", current === o.value ? "border-ink" : "border-border hover:border-border-strong")}
        >
          <span className="serif block text-[18px] text-text">{o.label}</span>
          <span className="block text-[12px] text-muted">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}
