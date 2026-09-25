import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Enums

export const healthEnum = pgEnum("health", ["on_track", "at_risk", "blocked"]);
export const personSideEnum = pgEnum("person_side", ["client", "vendor", "internal"]);
export const milestoneTypeEnum = pgEnum("milestone_type", [
  "target",
  "sit",
  "uat",
  "go_live",
  "system",
  "other",
]);
export const milestoneStatusEnum = pgEnum("milestone_status", [
  "upcoming",
  "done",
  "missed",
  "cancelled",
]);
export const activityTypeEnum = pgEnum("activity_type", [
  "update",
  "meeting",
  "email",
  "whatsapp",
  "call",
  "decision",
  "issue",
  "delivery",
]);
export const activitySourceEnum = pgEnum("activity_source", [
  "app",
  "quick_log",
  "paste",
  "api",
  "claude_code",
  "cron",
  "system",
  "import",
]);
export const taskStatusEnum = pgEnum("task_status", [
  "todo",
  "in_progress",
  "waiting",
  "done",
  "cancelled",
]);
export const taskPriorityEnum = pgEnum("task_priority", ["low", "normal", "high", "urgent"]);
export const documentTypeEnum = pgEnum("document_type", [
  "brd",
  "mom",
  "test_cases",
  "guide",
  "email",
  "other",
]);
export const reportStatusEnum = pgEnum("report_status", ["draft", "final"]);
export const insightKindEnum = pgEnum("insight_kind", ["next_step", "risk", "nudge"]);
export const insightStatusEnum = pgEnum("insight_status", ["open", "accepted", "dismissed"]);

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

// Shared column helpers

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date());

// JSON shapes

export type DateChange = {
  from: string;
  to: string;
  at: string;
  reason?: string;
};

export type ActionItem = {
  text: string;
  owner?: string;
  due?: string;
  taskId?: string;
};

export type ReportRow = {
  clientId: string;
  client: string;
  owner: string;
  done: string;
  risk: string;
  next: string;
  startDate: string;
  targetDate: string;
};

export type ReportSummary = {
  overall: { onTrack: number; atRisk: number; blocked: number };
  attention: string[];
};

// Tables

export const clients = pgTable(
  "clients",
  {
    id: id(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    fullName: text("full_name"),
    system: text("system"),
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    owner: text("owner").notNull().default("Saaqib"),
    phase: text("phase").notNull().default("discovery"),
    health: healthEnum("health").notNull().default("on_track"),
    nextStep: text("next_step"),
    phaseStartDate: date("phase_start_date", { mode: "string" }),
    phaseTargetDate: date("phase_target_date", { mode: "string" }),
    phaseTargetOriginal: date("phase_target_original", { mode: "string" }),
    color: text("color"),
    notes: text("notes"),
    sortOrder: integer("sort_order").notNull().default(0),
    demoStatus: boolean("demo_status").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("clients_archived_idx").on(t.archivedAt)],
);

export const people = pgTable(
  "people",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    side: personSideEnum("side").notNull().default("client"),
    email: text("email"),
    phone: text("phone"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("people_client_idx").on(t.clientId)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    heldAt: timestamp("held_at", { withTimezone: true }).notNull(),
    attendees: jsonb("attendees")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    rawNotes: text("raw_notes"),
    mom: text("mom"),
    actionItems: jsonb("action_items")
      .$type<ActionItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    documentId: uuid("document_id"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meetings_client_idx").on(t.clientId, t.heldAt)],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: milestoneTypeEnum("type").notNull().default("other"),
    date: date("date", { mode: "string" }).notNull(),
    originalDate: date("original_date", { mode: "string" }).notNull(),
    dateHistory: jsonb("date_history")
      .$type<DateChange[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: milestoneStatusEnum("status").notNull().default("upcoming"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("milestones_client_date_idx").on(t.clientId, t.date)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    type: activityTypeEnum("type").notNull().default("update"),
    title: text("title").notNull(),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    source: activitySourceEnum("source").notNull().default("app"),
    meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_client_time_idx").on(t.clientId, t.occurredAt),
    index("activities_time_idx").on(t.occurredAt),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    details: text("details"),
    status: taskStatusEnum("status").notNull().default("todo"),
    priority: taskPriorityEnum("priority").notNull().default("normal"),
    dueDate: date("due_date", { mode: "string" }),
    waitingOn: text("waiting_on"),
    waitingSince: date("waiting_since", { mode: "string" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sourceActivityId: uuid("source_activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    sourceMeetingId: uuid("source_meeting_id").references(() => meetings.id, {
      onDelete: "set null",
    }),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("tasks_status_due_idx").on(t.status, t.dueDate),
    index("tasks_client_idx").on(t.clientId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    type: documentTypeEnum("type").notNull().default("other"),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    searchVector: tsvector("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))`,
    ),
    isDemo: boolean("is_demo").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("documents_client_idx").on(t.clientId),
    index("documents_search_idx").using("gin", t.searchVector),
  ],
);

export const weeklyReports = pgTable(
  "weekly_reports",
  {
    id: id(),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    weekEnd: date("week_end", { mode: "string" }).notNull(),
    status: reportStatusEnum("status").notNull().default("draft"),
    summary: jsonb("summary").$type<ReportSummary>(),
    rows: jsonb("rows")
      .$type<ReportRow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    generatedBy: text("generated_by").notNull().default("manual"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("weekly_reports_week_idx").on(t.weekStart)],
);

export const insights = pgTable(
  "insights",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    kind: insightKindEnum("kind").notNull(),
    content: text("content").notNull(),
    status: insightStatusEnum("status").notNull().default("open"),
    createdAt: createdAt(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (t) => [index("insights_client_status_idx").on(t.clientId, t.status)],
);

export const aiFeedback = pgTable("ai_feedback", {
  id: id(),
  kind: text("kind").notNull(),
  input: text("input"),
  aiOutput: text("ai_output"),
  finalOutput: text("final_output"),
  createdAt: createdAt(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updatedAt(),
});

// Relations

export const clientsRelations = relations(clients, ({ many }) => ({
  people: many(people),
  milestones: many(milestones),
  activities: many(activities),
  tasks: many(tasks),
  meetings: many(meetings),
  documents: many(documents),
  insights: many(insights),
}));

export const peopleRelations = relations(people, ({ one }) => ({
  client: one(clients, { fields: [people.clientId], references: [clients.id] }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  client: one(clients, { fields: [milestones.clientId], references: [clients.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  client: one(clients, { fields: [activities.clientId], references: [clients.id] }),
  meeting: one(meetings, { fields: [activities.meetingId], references: [meetings.id] }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
}));

export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  client: one(clients, { fields: [meetings.clientId], references: [clients.id] }),
  activities: many(activities),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  client: one(clients, { fields: [documents.clientId], references: [clients.id] }),
}));

export const insightsRelations = relations(insights, ({ one }) => ({
  client: one(clients, { fields: [insights.clientId], references: [clients.id] }),
}));

// Row types

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Person = typeof people.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type WeeklyReport = typeof weeklyReports.$inferSelect;
export type Insight = typeof insights.$inferSelect;

export type Health = Client["health"];
export type MilestoneType = Milestone["type"];
export type ActivityType = Activity["type"];
export type ActivitySource = Activity["source"];
export type TaskStatus = Task["status"];
export type TaskPriority = Task["priority"];
