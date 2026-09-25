import { z } from "zod";

/**
 * Shape of the project export Saaqib collects from each project chat with the data collection prompt.
 * Lenient on purpose: unknown values arrive as null and get mapped sensibly by the importer.
 */

const str = z.string().trim().nullable().optional();
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const projectExportSchema = z.object({
  client: z.object({
    name: z.string().trim().min(1),
    code: z.string().trim().min(1),
    organisation: str,
    system: str,
    aliases: z.array(z.string()).default([]),
    owner: str,
    phase: str,
    health: z.enum(["on_track", "at_risk", "blocked"]).nullable().optional(),
    health_reason: str,
    next_step: str,
    phase_start_date: dateStr,
    phase_target_date: dateStr,
    phase_target_original_date: dateStr,
    notes: str,
  }),
  people: z
    .array(
      z.object({
        name: str,
        role: str,
        side: z.enum(["client", "vendor", "internal"]).nullable().optional(),
        email: str,
        phone: str,
        is_primary: z.boolean().nullable().optional(),
        notes: str,
      }),
    )
    .default([]),
  milestones: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        type: z.string().nullable().optional(),
        date: dateStr,
        original_date: dateStr,
        status: z.string().nullable().optional(),
        reason_for_change: str,
      }),
    )
    .default([]),
  activities: z
    .array(
      z.object({
        date: dateStr,
        type: z.string().nullable().optional(),
        title: z.string().trim().min(1),
        detail: str,
      }),
    )
    .default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        status: z.string().nullable().optional(),
        priority: z.string().nullable().optional(),
        due_date: dateStr,
        waiting_on: str,
        waiting_since: dateStr,
      }),
    )
    .default([]),
  meetings: z
    .array(
      z.object({
        date: dateStr,
        title: z.string().trim().min(1),
        attendees: z.array(z.string()).default([]),
        summary: str,
        decisions: z.array(z.string()).default([]),
        action_items: z
          .array(
            z.object({
              text: z.string(),
              owner: str,
              due: dateStr,
              done: z.boolean().nullable().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  documents: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        type: z.string().nullable().optional(),
        status: str,
        date: dateStr,
        where: str,
      }),
    )
    .default([]),
  risks: z
    .array(z.object({ risk: z.string(), impact: str, mitigation: str, owner: str }))
    .default([]),
  open_questions: z.array(z.string()).default([]),
  this_week: z
    .object({
      done: z.array(z.string()).default([]),
      planned_next_week: z.array(z.string()).default([]),
      blockers_or_delays: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
});

export type ProjectExport = z.infer<typeof projectExportSchema>;
