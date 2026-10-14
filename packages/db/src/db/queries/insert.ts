import { db } from "../../index";
import { document, project, run, world } from "../schema";
import type { DocumentType, ProjectType, RunType, WorldType } from "../type";

export const insertWorld = async (data: WorldType) => {
  const inserted = await db
    .insert(world)
    .values(data)
    .returning({ insertedId: world.id });
  return inserted[0]!.insertedId;
};

export const insertProject = async (data: ProjectType) => {
  const inserted = await db
    .insert(project)
    .values(data)
    .returning({ insertedId: project.id });
  return inserted[0]!.insertedId;
};

export const insertDocument = async (data: DocumentType) => {
  const inserted = await db
    .insert(document)
    .values(data)
    .returning({ insertedId: document.id });
  return inserted[0]!.insertedId;
};

export const insertRun = async (data: RunType) => {
  const inserted = await db
    .insert(run)
    .values(data)
    .returning({ insertedId: run.id });
  return inserted[0]!.insertedId;
};
