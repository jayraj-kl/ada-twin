import { type NodePgDatabase, drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./db/schema";

// Cloud Run can start many instances against one small database.
const MAX_CONNECTIONS = 5;

export const db: NodePgDatabase<typeof schema> = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    max: MAX_CONNECTIONS,
  },
  schema,
});
