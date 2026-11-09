import { sql } from "drizzle-orm";
import { db } from "../../index";

/** Asks the database for nothing, to show it answers. */
export const pingDatabase = async () => {
  await db.execute(sql`select 1`);
};
