// Brings the database up to date with the migration files, then exits.
// The deploy runs it as a Cloud Run job before rolling out a new revision:
//   node dist/migrate.js
import { fileURLToPath } from "node:url";
import { migrateDatabase } from "@repo/db/migrate";

// The image keeps the files beside dist/ (see deploy/api.Dockerfile).
const folder =
  process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../drizzle", import.meta.url));

try {
  await migrateDatabase(folder);
  console.log(`database is up to date (${folder})`);
  // The connection pool would keep the job running.
  process.exit(0);
} catch (error) {
  console.error("migration failed:", error);
  process.exit(1);
}
