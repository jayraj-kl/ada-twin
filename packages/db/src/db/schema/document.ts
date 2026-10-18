import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { project } from "./project";

/**
 * A file the user uploaded: a 360° panorama of the floor, or a manual,
 * datasheet or record for one machine.
 */
export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  // "panorama" or "document".
  kind: text("kind").notNull().default("document"),
  // For a document, the machine's id inside the project's `machines`.
  machineId: text("machine_id"),
  // What the user calls it, such as the room a panorama shows.
  label: text("label"),
  size: integer("size").notNull().default(0),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  // Cloud Storage path of the file.
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
