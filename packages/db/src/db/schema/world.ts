import type { World } from "@repo/world";
import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const worldStatusEnum = pgEnum("world_status", [
  "generating",
  "ready",
  "failed",
]);

export const world = pgTable("world", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  model: text("model"),
  // World Labs' ids: the operation while generating, the world once ready.
  operationId: text("operation_id"),
  worldLabsId: text("world_labs_id").unique(),
  status: worldStatusEnum("status").notNull().default("generating"),
  lastError: text("last_error"),
  // Cloud Storage paths of our own copies of the assets.
  splatPath: text("splat_path"),
  colliderPath: text("collider_path"),
  panoPath: text("pano_path"),
  // The full World Labs record, not just the assets: it carries the scale.
  record: jsonb("record").$type<World>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});
