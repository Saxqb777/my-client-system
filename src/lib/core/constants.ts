import type { ActivitySource, ActivityType, Health, MilestoneType, TaskPriority, TaskStatus } from "@/lib/db/schema";

export const APP_NAME = "Orbit";
export const DEFAULT_OWNER = "Saaqib";
export const TIMEZONE = "Asia/Dubai";

/** Orbit ring: 1 is closest to go live, 3 is furthest. */
export const PHASES = [
  { value: "discovery", label: "Discovery", ring: 3 },
  { value: "requirements", label: "BRD", ring: 3 },
  { value: "design", label: "Design", ring: 3 },
  { value: "development", label: "Development", ring: 2 },
  { value: "sit", label: "SIT", ring: 2 },
  { value: "uat", label: "UAT", ring: 2 },
  { value: "go_live", label: "Go live", ring: 1 },
  { value: "hypercare", label: "Hypercare", ring: 1 },
  { value: "live", label: "Live", ring: 1 },
  { value: "on_hold", label: "On hold", ring: 3 },
] as const;

export type PhaseValue = (typeof PHASES)[number]["value"];

export function phaseLabel(value: string): string {
  return PHASES.find((p) => p.value === value)?.label ?? value;
}

export function phaseRing(value: string): 1 | 2 | 3 {
  return (PHASES.find((p) => p.value === value)?.ring ?? 3) as 1 | 2 | 3;
}

export const HEALTH: Record<Health, { label: string; short: string; css: string }> = {
  on_track: { label: "On track", short: "On track", css: "ok" },
  at_risk: { label: "At risk", short: "At risk", css: "warn" },
  blocked: { label: "Blocked", short: "Blocked", css: "bad" },
};

export const HEALTH_ORDER: Health[] = ["blocked", "at_risk", "on_track"];

export const MILESTONE_TYPES: Record<MilestoneType, { label: string }> = {
  target: { label: "Target" },
  sit: { label: "SIT" },
  uat: { label: "UAT" },
  go_live: { label: "Go live" },
  system: { label: "System date" },
  other: { label: "Other" },
};

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; verb: string }> = {
  update: { label: "Update", verb: "Updated" },
  meeting: { label: "Meeting", verb: "Met" },
  email: { label: "Email", verb: "Emailed" },
  whatsapp: { label: "WhatsApp", verb: "Messaged" },
  call: { label: "Call", verb: "Called" },
  decision: { label: "Decision", verb: "Decided" },
  issue: { label: "Issue", verb: "Raised" },
  delivery: { label: "Delivery", verb: "Delivered" },
};

export const ACTIVITY_SOURCES: Record<ActivitySource, string> = {
  app: "App",
  quick_log: "Quick log",
  paste: "Paste",
  api: "API",
  claude_code: "Claude Code",
  cron: "Scheduled",
  system: "System",
};

export const TASK_STATUS: Record<TaskStatus, { label: string }> = {
  todo: { label: "To do" },
  in_progress: { label: "In progress" },
  waiting: { label: "Waiting on" },
  done: { label: "Done" },
  cancelled: { label: "Cancelled" },
};

export const TASK_PRIORITY: Record<TaskPriority, { label: string; weight: number }> = {
  low: { label: "Low", weight: 0 },
  normal: { label: "Normal", weight: 1 },
  high: { label: "High", weight: 2 },
  urgent: { label: "Urgent", weight: 3 },
};

/** Accent hues assigned to clients in order of creation when none is chosen. */
export const CLIENT_HUES = [174, 262, 330, 200, 42, 292, 150, 16, 220, 95];

export const SETTINGS_KEYS = {
  ownerName: "owner_name",
  demoSeededAt: "demo_seeded_at",
  writingStyle: "writing_style",
} as const;
