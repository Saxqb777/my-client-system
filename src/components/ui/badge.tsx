import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "bad" | "teal" | "violet" | "magenta";

export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("pill", tone !== "neutral" && `pill-${tone}`, className)} {...props} />;
}
