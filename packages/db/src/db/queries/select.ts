import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../index";
import { document, project, projectState, run, world } from "../schema";

export const selectWorldById = async (worldId: string) => {
  const rows = await db.select().from(world).where(eq(world.id, worldId));
  return rows[0] ?? null;
};

export const selectProjectById = async (projectId: string) => {
  const rows = await db.select().from(project).where(eq(project.id, projectId));
  return rows[0] ?? null;
};

/** Each listed project that exists, without its contents. */
export const selectProjectsByIds = async (projectIds: string[]) => {
  if (projectIds.length === 0) return [];
  return await db
    .select({
      id: project.id,
      name: project.name,
      reached: project.reached,
      sample: project.sample,
      origin: project.origin,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })
    .from(project)
    .where(inArray(project.id, projectIds))
    .orderBy(desc(project.updatedAt));
};

/** A project's page state, as one record of key to value. */
export const selectProjectState = async (projectId: string) => {
  const rows = await db
    .select({ key: projectState.key, value: projectState.value })
    .from(projectState)
    .where(eq(projectState.projectId, projectId));
  return Object.fromEntries(rows.map(({ key, value }) => [key, value]));
};

export const selectDocumentsByProjectId = async (projectId: string) => {
  return await db
    .select()
    .from(document)
    .where(eq(document.projectId, projectId));
};

/** One of a project's documents, or null. */
export const selectDocument = async (projectId: string, documentId: string) => {
  const rows = await db
    .select()
    .from(document)
    .where(and(eq(document.projectId, projectId), eq(document.id, documentId)));
  return rows[0] ?? null;
};

/** A project's most recent finished run, whole, or null. */
export const selectLatestRun = async (projectId: string) => {
  const rows = await db
    .select()
    .from(run)
    .where(and(eq(run.projectId, projectId), eq(run.status, "finished")))
    .orderBy(desc(run.createdAt))
    .limit(1);
  return rows[0] ?? null;
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
