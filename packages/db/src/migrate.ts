import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";

/**
 * Applies the migration files in `folder` that the database has not had yet,
 * tracked in the same table `drizzle-kit migrate` uses, so the two agree.
 */
export async function migrateDatabase(folder: string) {
  await migrate(db, { migrationsFolder: folder });
}
