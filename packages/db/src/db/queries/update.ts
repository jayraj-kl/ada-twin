import { and, eq, sql } from "drizzle-orm";
import { db } from "../../index";
import { document, project, projectState, run, world } from "../schema";
import type { ProjectType, RunType, WorldType } from "../type";

export const updateWorld = async (
  worldId: string,
  patch: Partial<Omit<WorldType, "id" | "createdAt">>,
) => {
  await db.update(world).set(patch).where(eq(world.id, worldId));
};

/** Changes a project; answers its new updatedAt, or null if it does not exist. */
export const updateProject = async (
  projectId: string,
  patch: Partial<Omit<ProjectType, "id" | "createdAt">>,
) => {
  const rows = await db
    .update(project)
    // Touching updatedAt even when only page state changed.
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(project.id, projectId))
    .returning({ updatedAt: project.updatedAt });
  return rows[0]?.updatedAt ?? null;
};

/** Saves page state values by key, replacing what each key held. */
export const upsertProjectState = async (
  projectId: string,
  entries: Record<string, unknown>,
) => {
  const values = Object.entries(entries).map(([key, value]) => ({
    projectId,
    key,
    value,
  }));
  if (values.length === 0) return;
  await db
    .insert(projectState)
    .values(values)
    .onConflictDoUpdate({
      target: [projectState.projectId, projectState.key],
      set: { value: sql`excluded.value`, updatedAt: new Date() },
    });
};

export const updateRun = async (
  runId: string,
  patch: Partial<
    Pick<
      RunType,
      | "status"
      | "lastError"
      | "baseline"
      | "days"
      | "kpis"
      | "decisions"
      | "eventsPath"
      | "playbook"
    >
  >,
) => {
  await db.update(run).set(patch).where(eq(run.id, runId));
};

/** Changes what the user calls one of a project's documents. */
export const updateDocument = async (
  projectId: string,
  documentId: string,
  patch: { label: string | null },
) => {
  const rows = await db
    .update(document)
    .set(patch)
    .where(and(eq(document.projectId, projectId), eq(document.id, documentId)))
    .returning({ id: document.id });
  return rows.length > 0;
};
