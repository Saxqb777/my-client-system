import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "ink";

export function Badge({ tone = "neutral", className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn("tag", tone !== "neutral" && `tag-${tone}`, className)} {...props} />;
}
