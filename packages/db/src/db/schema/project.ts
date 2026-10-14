import type { AgentSpec } from "@repo/agent";
import type { GraphDiff, Param, Scenario } from "@repo/sim";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { world } from "./world";

/** A machine as the twin step saves it. */
export interface SavedMachine {
  id: string;
  name: string;
  type?: string;
  manufacturer?: string;
  model?: string;
  count?: number;
  notes?: string;
  /** Where each unit sits in the world, in metres. */
  pins?: [number, number, number][];
  params?: Record<string, Param>;
}

/** The material flow; machines join it as station nodes by their id. */
export interface SavedFlow {
  extras: {
    id: string;
    kind: "source" | "buffer" | "sink";
    name: string;
    value?: number;
    suggested?: boolean;
  }[];
  links: { from: string; to: string }[];
  positions: Record<string, { x: number; y: number }>;
}

export interface SavedCrew {
  agents: AgentSpec[];
  /** Minutes between planner and supervisor check-ins. */
  tickMinutes: number;
}

/** A change to the plant the user accepted from the report. */
export interface AcceptedChange {
  id: string;
  title: string;
  detail: string;
  diffs: GraphDiff[];
  extraCrews: number;
  gain: number;
}

export const project = pgTable("project", {
  // Projects are anonymous: knowing the id is what gives access.
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // The user's own description of their process.
  process: text("process"),
  worldId: uuid("world_id").references(() => world.id, {
    onDelete: "set null",
  }),
  machines: jsonb("machines").$type<SavedMachine[]>().notNull().default([]),
  flow: jsonb("flow")
    .$type<SavedFlow>()
    .notNull()
    .default({ extras: [], links: [], positions: {} }),
  scenario: jsonb("scenario").$type<Scenario>(),
  crew: jsonb("crew").$type<SavedCrew>(),
  accepted: jsonb("accepted").$type<AcceptedChange[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
