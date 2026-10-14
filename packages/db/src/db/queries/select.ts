import { desc, eq } from "drizzle-orm";
import { db } from "../../index";
import { document, project, run, world } from "../schema";

export const selectWorldById = async (worldId: string) => {
  const rows = await db.select().from(world).where(eq(world.id, worldId));
  return rows[0] ?? null;
};

export const selectProjectById = async (projectId: string) => {
  const rows = await db.select().from(project).where(eq(project.id, projectId));
  return rows[0] ?? null;
};

export const selectDocumentsByProjectId = async (projectId: string) => {
  return await db
    .select()
    .from(document)
    .where(eq(document.projectId, projectId));
};

export const selectRunById = async (runId: string) => {
  const rows = await db.select().from(run).where(eq(run.id, runId));
  return rows[0] ?? null;
};

/** A project's runs, newest first, without the copied graph and decisions. */
export const selectRunsByProjectId = async (projectId: string) => {
  return await db
    .select({
      id: run.id,
      status: run.status,
      seed: run.seed,
      scenario: run.scenario,
      baseline: run.baseline,
      kpis: run.kpis,
      createdAt: run.createdAt,
    })
    .from(run)
    .where(eq(run.projectId, projectId))
    .orderBy(desc(run.createdAt));
};
