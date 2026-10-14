import { eq } from "drizzle-orm";
import { db } from "../../index";
import { project, run, world } from "../schema";
import type { ProjectType, RunType, WorldType } from "../type";

export const updateWorld = async (
  worldId: string,
  patch: Partial<Omit<WorldType, "id" | "createdAt">>,
) => {
  await db.update(world).set(patch).where(eq(world.id, worldId));
};

export const updateProject = async (
  projectId: string,
  patch: Partial<Omit<ProjectType, "id" | "createdAt">>,
) => {
  await db.update(project).set(patch).where(eq(project.id, projectId));
};

export const updateRun = async (
  runId: string,
  patch: Partial<
    Pick<
      RunType,
      "status" | "lastError" | "baseline" | "kpis" | "decisions" | "eventsPath"
    >
  >,
) => {
  await db.update(run).set(patch).where(eq(run.id, runId));
};
