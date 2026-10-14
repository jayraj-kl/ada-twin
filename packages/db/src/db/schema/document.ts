import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { project } from "./project";

/** A manual, datasheet or record the user uploaded for one machine. */
export const document = pgTable("document", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  // The machine's id inside the project's `machines`.
  machineId: text("machine_id").notNull(),
  name: text("name").notNull(),
  mimeType: text("mime_type").notNull(),
  // Cloud Storage path of the file.
  path: text("path").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
