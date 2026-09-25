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
          toast: "!float !text-text !text-sm",
          description: "!text-muted",
          actionButton: "!bg-ink !text-paper",
        },
      }}
    />
  );
}
