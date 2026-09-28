import { z } from "zod";

/**
 * Shape of a session update Saaqib exports from a project chat after a meeting or a working day.
 * A delta on top of the full project export: only what changed. Everything optional but the client code.
 */

const str = z.string().trim().nullable().optional();
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const updateExportSchema = z.object({
  client_code: z.string().trim().min(1),
  update_date: dateStr,
  client: z
    .object({
      phase: str,
      health: z.enum(["on_track", "at_risk", "blocked"]).nullable().optional(),
      health_reason: str,
      next_step: str,
      phase_start_date: dateStr,
      phase_target_date: dateStr,
      phase_target_original_date: dateStr,
    })
    .nullable()
    .optional(),
  activities: z.array(z.object({ date: dateStr, type: str, title: z.string().trim().min(1), detail: str })).default([]),
  meetings: z
    .array(
      z.object({
        date: dateStr,
        title: z.string().trim().min(1),
        attendees: z.array(z.string()).default([]),
        summary: str,
        decisions: z.array(z.string()).default([]),
        action_items: z.array(z.object({ text: z.string(), owner: str, due: dateStr, done: z.boolean().nullable().optional() })).default([]),
      }),
    )
    .default([]),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        status: str,
        priority: str,
        due_date: dateStr,
        waiting_on: str,
        waiting_since: dateStr,
      }),
    )
    .default([]),
  tasks_closed: z.array(z.object({ title: z.string().trim().min(1), closed_on: dateStr, outcome: str })).default([]),
  documents: z.array(z.object({ title: z.string().trim().min(1), type: str, status: str, date: dateStr, where: str })).default([]),
  risks: z.array(z.object({ risk: z.string(), impact: str, mitigation: str, owner: str })).default([]),
  open_questions: z.array(z.string()).default([]),
  module_progress: z
    .object({
      module: z.string().trim().min(1),
      sessions: z.array(z.string()).default([]),
      sessions_held: z.array(z.string()).default([]),
      percent_complete: z.number().nullable().optional(),
      ready_for_brd: z.boolean().nullable().optional(),
      covered: z.array(z.string()).default([]),
      partly_covered: z.array(z.string()).default([]),
      not_covered: z.array(z.string()).default([]),
      notes: str,
    })
    .nullable()
    .optional(),
});

export type UpdateExport = z.infer<typeof updateExportSchema>;
