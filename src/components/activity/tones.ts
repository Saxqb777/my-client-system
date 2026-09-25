import type { ActivityType } from "@/lib/db/schema";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "info" | "ink";

/** Colour only where it carries meaning: issues, decisions and deliveries. The rest stays quiet. */
export function activityTone(type: ActivityType): Tone {
  switch (type) {
    case "issue":
      return "bad";
    case "decision":
      return "ink";
    case "delivery":
      return "ok";
    case "meeting":
      return "info";
    default:
      return "neutral";
  }
}

/** Explicit class names so Tailwind can see them at build time. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted",
  ok: "text-ok",
  warn: "text-warn",
  bad: "text-bad",
  info: "text-info",
  ink: "text-text font-medium",
};
