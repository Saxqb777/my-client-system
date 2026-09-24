"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as "light" | "dark" | undefined) ?? "dark"}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast: "!glass !glass-sm !text-text !text-sm !shadow-2xl",
          description: "!text-muted",
          actionButton: "!bg-accent !text-accent-ink",
        },
      }}
    />
  );
}
