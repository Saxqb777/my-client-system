"use client";

import { useMounted } from "@/lib/hooks/useMounted";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeChoice() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? theme : "dark";
  const options = [
    { value: "dark", label: "Dark", icon: Moon, desc: "Navy with aurora light at the top" },
    { value: "light", label: "Light", icon: Sun, desc: "Light with soft colour at the top" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setTheme(o.value)}
          className={cn(
            "flex items-start gap-3 rounded-[14px] border p-4 text-left transition",
            current === o.value ? "border-teal bg-[color-mix(in_oklab,var(--teal)_10%,transparent)]" : "border-border bg-surface hover:border-border-strong",
          )}
        >
          <o.icon className={cn("mt-0.5 size-4", current === o.value ? "text-teal" : "text-muted")} />
          <span>
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-xs text-muted">{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
