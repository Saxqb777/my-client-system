import type { ActivityType } from "@/lib/db/schema";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "teal" | "violet" | "magenta";

export function activityTone(type: ActivityType): Tone {
  switch (type) {
    case "meeting":
      return "violet";
    case "email":
      return "teal";
    case "whatsapp":
      return "ok";
    case "call":
      return "teal";
    case "decision":
      return "magenta";
    case "issue":
      return "bad";
    case "delivery":
      return "ok";
    default:
      return "neutral";
  }
}

/** Explicit class names so Tailwind can see them at build time. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
  teal: "bg-teal",
  violet: "bg-violet",
  magenta: "bg-magenta",
};
