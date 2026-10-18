import { and, eq } from "drizzle-orm";
import { db } from "../../index";
import { document, project } from "../schema";

/** Deletes a project and, by cascade, its documents, runs and page state. */
export const deleteProject = async (projectId: string) => {
  const rows = await db
    .delete(project)
    .where(eq(project.id, projectId))
    .returning({ id: project.id });
  return rows.length > 0;
};

/** Deletes one of a project's documents; answers its row, or null. */
export const deleteDocument = async (projectId: string, documentId: string) => {
  const rows = await db
    .delete(document)
    .where(and(eq(document.projectId, projectId), eq(document.id, documentId)))
    .returning();
  return rows[0] ?? null;
};
