import { document, project, run, world } from "./schema";

export type {
  AcceptedChange,
  SavedCrew,
  SavedFlow,
  SavedMachine,
} from "./schema";

export type WorldType = typeof world.$inferInsert;
export type WorldRow = typeof world.$inferSelect;

export type ProjectType = typeof project.$inferInsert;
export type ProjectRow = typeof project.$inferSelect;

export type DocumentType = typeof document.$inferInsert;
export type DocumentRow = typeof document.$inferSelect;

export type RunType = typeof run.$inferInsert;
export type RunRow = typeof run.$inferSelect;
