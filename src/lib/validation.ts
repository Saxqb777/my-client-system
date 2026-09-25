import { z } from "zod";
import {
  activitySourceEnum,
  activityTypeEnum,
  healthEnum,
  milestoneStatusEnum,
  milestoneTypeEnum,
  personSideEnum,
  taskPriorityEnum,
  taskStatusEnum,
} from "@/lib/db/schema";
import { PHASES } from "@/lib/core/constants";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-15");

const optionalDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), isoDate.nullable());
const optionalText = z.preprocess((v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v), z.string().trim().max(4000).nullable());

export const phaseValues = PHASES.map((p) => p.value) as [string, ...string[]];

export const healthSchema = z.enum(healthEnum.enumValues);
export const phaseSchema = z.string().trim().min(1).max(40);

export const clientInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  code: z
    .string()
    .trim()
    .min(2, "Code needs at least 2 characters")
    .max(16)
    .regex(/^[A-Za-z0-9]+$/, "Letters and numbers only")
    .transform((s) => s.toUpperCase()),
  fullName: optionalText,
  system: optionalText,
  aliases: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  ),
  owner: z.string().trim().min(1).max(60).default("Saaqib"),
  phase: phaseSchema.default("discovery"),
  health: healthSchema.default("on_track"),
  nextStep: optionalText,
  phaseStartDate: optionalDate,
  phaseTargetDate: optionalDate,
  color: optionalText,
  notes: optionalText,
  momFormat: optionalText,
});
export type ClientInput = z.infer<typeof clientInputSchema>;
export const clientPatchSchema = clientInputSchema.partial();
export type ClientPatch = z.infer<typeof clientPatchSchema>;

export const personInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  role: optionalText,
  side: z.enum(personSideEnum.enumValues).default("client"),
  email: optionalText,
  phone: optionalText,
  isPrimary: z.coerce.boolean().default(false),
  notes: optionalText,
});
export type PersonInput = z.infer<typeof personInputSchema>;

export const activityInputSchema = z.object({
  clientId: z.string().uuid().nullable().default(null),
  type: z.enum(activityTypeEnum.enumValues).default("update"),
  title: z.string().trim().min(1, "Write what happened").max(300),
  body: optionalText,
  occurredAt: z.preprocess((v) => (v ? new Date(v as string) : new Date()), z.date()),
  source: z.enum(activitySourceEnum.enumValues).default("app"),
  tags: z.array(z.string().trim().min(1)).default([]),
});
export type ActivityInput = z.infer<typeof activityInputSchema>;

export const milestoneInputSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  type: z.enum(milestoneTypeEnum.enumValues).default("other"),
  date: isoDate,
  notes: optionalText,
});
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

export const milestonePatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  type: z.enum(milestoneTypeEnum.enumValues).optional(),
  date: isoDate.optional(),
  reason: optionalText.optional(),
  status: z.enum(milestoneStatusEnum.enumValues).optional(),
  notes: optionalText.optional(),
});
export type MilestonePatch = z.infer<typeof milestonePatchSchema>;

export const taskInputSchema = z.object({
  clientId: z.string().uuid().nullable().default(null),
  title: z.string().trim().min(1).max(300),
  details: optionalText,
  status: z.enum(taskStatusEnum.enumValues).default("todo"),
  priority: z.enum(taskPriorityEnum.enumValues).default("normal"),
  dueDate: optionalDate,
  waitingOn: optionalText,
});
export type TaskInput = z.infer<typeof taskInputSchema>;
export const taskPatchSchema = taskInputSchema.partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

const isoDateTime = z.preprocess((v) => (typeof v === "string" || v instanceof Date ? new Date(v) : v), z.date());

export const meetingInputSchema = z.object({
  clientId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the meeting a title").max(160),
  heldAt: isoDateTime,
  attendees: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  location: optionalText,
  rawNotes: optionalText,
});
export type MeetingInput = z.infer<typeof meetingInputSchema>;

export const meetingPatchSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(),
  heldAt: isoDateTime.optional(),
  attendees: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
  location: optionalText.optional(),
  rawNotes: optionalText.optional(),
  status: z.enum(["planned", "held", "minuted", "cancelled"]).optional(),
});
export type MeetingPatch = z.infer<typeof meetingPatchSchema>;
