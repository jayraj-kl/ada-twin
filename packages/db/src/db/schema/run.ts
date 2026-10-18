import type { AgentSpec, DecisionRecord } from "@repo/agent";
import type {
  Adjustment,
  FactoryGraph,
  Kpis,
  Playbook,
  Scenario,
} from "@repo/sim";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { project } from "./project";

export const runStatusEnum = pgEnum("run_status", [
  "running",
  "finished",
  "failed",
]);

/** One run of the shift, kept for the replay and the report. */
export const run = pgTable("run", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  status: runStatusEnum("status").notNull().default("running"),
  lastError: text("last_error"),

  seed: integer("seed").notNull(),
  // Simulated seconds the run covers.
  horizon: integer("horizon").notNull(),
  maintenanceCrews: integer("maintenance_crews").notNull(),
  tickMinutes: integer("tick_minutes").notNull(),

  // What the run was made on, copied so it still reads true after the
  // project is edited. The graph is the twin before the scenario's adjustments.
  graph: jsonb("graph").$type<FactoryGraph>().notNull(),
  scenario: jsonb("scenario").$type<Scenario>().notNull(),
  agents: jsonb("agents").$type<AgentSpec[]>().notNull(),
  adjustments: jsonb("adjustments").$type<Adjustment[]>().notNull().default([]),

  baseline: jsonb("baseline").$type<Kpis>(),
  // Standard rules on each day averaged; the first is `baseline`.
  days: jsonb("days").$type<Kpis[]>(),
  kpis: jsonb("kpis").$type<Kpis>(),
  decisions: jsonb("decisions").$type<DecisionRecord[]>().notNull().default([]),
  // The crew's way of working as fixed rules, written after the shift.
  playbook: jsonb("playbook").$type<Playbook | null>(),
  // Cloud Storage path of the full event log, which is too large for a row.
  eventsPath: text("events_path"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
