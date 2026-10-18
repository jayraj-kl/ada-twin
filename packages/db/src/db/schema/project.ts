import type { AgentSpec } from "@repo/agent";
import type { GraphDiff, Param, Scenario } from "@repo/sim";
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { world } from "./world";

/**
 * A machine as the twin step saves it. The page owns this shape, so fields
 * the database does not use are kept as they come.
 */
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
  /** Support equipment that stops what needs it when it fails. */
  auxiliary?: boolean;
  /** Standby units among `count`, for support equipment. */
  spares?: number;
  color?: string;
  [field: string]: unknown;
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
  /** From support equipment to what cannot run without it. */
  needs?: { from: string; to: string }[];
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
  /** Parts per shift it gained when accepted; missing for changes asked for in the chat. */
  gain?: number;
  origin?: "suggested" | "asked";
}

export const project = pgTable("project", {
  // Projects are anonymous: knowing the id is what gives access.
  id: uuid("id").primaryKey().defaultRandom(),
  // Null until sign-in exists; then the user the project belongs to.
  ownerId: text("owner_id"),
  name: text("name").notNull(),
  // The furthest step reached, as an index into the page's steps.
  reached: integer("reached").notNull().default(0),
  // A copy of the bundled sample plant, seeded from its files.
  sample: boolean("sample").notNull().default(false),
  // For a sample, the project it was opened from.
  origin: text("origin"),
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
