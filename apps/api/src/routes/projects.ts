import { randomUUID } from "node:crypto";
import { deleteDocument, deleteProject } from "@repo/db/queries/delete";
import { insertDocument, insertProject } from "@repo/db/queries/insert";
import {
  selectDocument,
  selectDocumentsByProjectId,
  selectLatestRun,
  selectProjectById,
  selectProjectState,
  selectProjectsByIds,
} from "@repo/db/queries/select";
import {
  updateDocument,
  updateProject,
  upsertProjectState,
} from "@repo/db/queries/update";
import type { ProjectType } from "@repo/db/type";
import { since } from "@repo/logger";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { log } from "../logging";
import {
  deleteFile,
  deleteProjectFiles,
  projectPath,
  readFile,
  readJson,
  storageConfigured,
  writeFile,
} from "../storage";

// A project's saved state: machines with their parameters, the flow, chats.
const MAX_BODY_BYTES = 2 * 1024 * 1024;
// An uploaded panorama (the capture step allows up to 20 MB) or document.
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const DOCUMENT_KINDS = ["panorama", "document"] as const;
// Image ids the plant step makes: <record>:<view>:<stamp>-<index>.
const IMAGE_ID = /^[\w.:-]{1,200}$/;
// One browser's list of projects, asked for in one go.
const MAX_LISTED = 100;
const NAME_LENGTH = 120;

/** The project fields the page saves, as columns of the project row. */
const CORE_FIELDS = [
  "process",
  "machines",
  "flow",
  "scenario",
  "crew",
  "accepted",
] as const;
type CoreField = (typeof CORE_FIELDS)[number];

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const fail = (status: 400 | 404 | 503, message: string): never => {
  throw new HTTPException(status, { message });
};

function needDatabase() {
  if (!process.env.DATABASE_URL) {
    fail(503, "DATABASE_URL is not set (put it in apps/api/.env)");
  }
}

function projectId(raw: string) {
  if (!UUID.test(raw)) fail(404, "No such project");
  return raw;
}

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail(400, "Expected a JSON object");

/** The core fields present in `body`, each checked for its rough shape. */
function coreFields(body: Record<string, unknown>) {
  const fields: Partial<Record<CoreField, unknown>> = {};
  for (const field of CORE_FIELDS) {
    if (!(field in body)) continue;
    const value = body[field];
    const fits =
      field === "process"
        ? value === null || typeof value === "string"
        : field === "machines" || field === "accepted"
          ? Array.isArray(value)
          : field === "flow"
            ? value !== null && typeof value === "object"
            : value === null || typeof value === "object";
    if (!fits) fail(400, `"${field}" has the wrong shape`);
    fields[field] = value;
  }
  return fields as Partial<Pick<ProjectType, CoreField>>;
}

function name(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    fail(400, "A project needs a name");
  }
  return (value as string).trim().slice(0, NAME_LENGTH);
}

/** A project as the page lists it. */
const summary = (row: {
  id: string;
  name: string;
  reached: number;
  sample: boolean;
  origin: string | null;
  createdAt: Date;
  updatedAt: Date;
}) => ({
  id: row.id,
  name: row.name,
  reached: row.reached,
  sample: row.sample,
  origin: row.origin ?? undefined,
  createdAt: row.createdAt.getTime(),
  updatedAt: row.updatedAt.getTime(),
});

/**
 * Projects, saved in Postgres. They are anonymous: knowing a project's id is
 * what gives access to it, so a browser keeps the ids of its own projects.
 */
export const projects = new Hono();

projects.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  log.error("project request failed", { error });
  return c.json({ error: "The project could not be saved or loaded" }, 500);
});

const jsonLimit = bodyLimit({ maxSize: MAX_BODY_BYTES });
const uploadLimit = bodyLimit({
  maxSize: MAX_UPLOAD_BYTES,
  onError: (c) => c.json({ error: "The file is larger than 25 MB" }, 413),
});

projects.use(async (_c, next) => {
  needDatabase();
  await next();
});

/** Creates a project: { name, sample?, origin?, seed? }, seed being core fields. */
projects.post("/", jsonLimit, async (c) => {
  const body = asObject(await c.req.json().catch(() => null));
  const seed = body.seed === undefined ? {} : coreFields(asObject(body.seed));
  const started = performance.now();
  const id = await insertProject({
    name: name(body.name),
    sample: body.sample === true,
    origin: typeof body.origin === "string" ? body.origin : null,
    ...seed,
  });
  const row = await selectProjectById(id);
  log.info("project created", { project: id, sample: row!.sample, ms: since(started) });
  return c.json({ project: summary(row!) }, 201);
});

/** The listed projects that exist, newest first: ?ids=a,b,c */
projects.get("/", async (c) => {
  const ids = (c.req.query("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => UUID.test(id))
    .slice(0, MAX_LISTED);
  const rows = await selectProjectsByIds(ids);
  return c.json({ projects: rows.map(summary) });
});

/** A whole project: its summary, core fields and page state. */
projects.get("/:id", async (c) => {
  const id = projectId(c.req.param("id"));
  const row = await selectProjectById(id);
  if (!row) fail(404, "No such project");
  const state = await selectProjectState(id);
  return c.json({
    project: summary(row!),
    fields: Object.fromEntries(CORE_FIELDS.map((field) => [field, row![field]])),
    state,
  });
});

/**
 * Saves what changed: any of { name, reached, origin, process, machines,
 * flow, scenario, crew, accepted, state }. Each field replaces what was saved, so
 * the last save of a field wins; `reached` only ever moves forward.
 */
projects.patch("/:id", jsonLimit, async (c) => {
  const id = projectId(c.req.param("id"));
  const body = asObject(await c.req.json().catch(() => null));
  const known = new Set<string>([
    ...CORE_FIELDS,
    "name",
    "reached",
    "origin",
    "state",
  ]);
  const unknown = Object.keys(body).filter((key) => !known.has(key));
  if (unknown.length > 0) fail(400, `Unknown fields: ${unknown.join(", ")}`);

  const existing = await selectProjectById(id);
  if (!existing) fail(404, "No such project");
  const patch: Partial<ProjectType> = coreFields(body);
  if ("name" in body) patch.name = name(body.name);
  if ("reached" in body) {
    const reached = Number(body.reached);
    if (!Number.isInteger(reached) || reached < 0) {
      fail(400, '"reached" has the wrong shape');
    }
    patch.reached = Math.max(existing!.reached, reached);
  }
  if ("origin" in body) {
    if (body.origin !== null && typeof body.origin !== "string") {
      fail(400, '"origin" has the wrong shape');
    }
    patch.origin = body.origin as string | null;
  }
  if ("state" in body) await upsertProjectState(id, asObject(body.state));
  const updatedAt = await updateProject(id, patch);
  if (!updatedAt) fail(404, "No such project");
  return c.json({ updatedAt: updatedAt!.getTime() });
});

projects.delete("/:id", async (c) => {
  const id = projectId(c.req.param("id"));
  if (!(await deleteProject(id))) fail(404, "No such project");
  // The row is gone either way; files left behind only cost space.
  if (storageConfigured()) {
    await deleteProjectFiles(id).catch((error: unknown) =>
      log.warn("project files not deleted", { project: id, error }),
    );
  }
  log.info("project deleted", { project: id });
  return c.body(null, 204);
});

// --- files ------------------------------------------------------------------

/** A file from the bucket as a response the browser may cache. */
function fileResponse(
  file: { data: Buffer; contentType: string },
  cache: "immutable" | "private",
) {
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control":
        cache === "immutable"
          ? "private, max-age=31536000, immutable"
          : "private, no-cache",
    },
  });
}

/** An image the plant step drew; its id never names another image. */
projects.get("/:id/images/:imageId", async (c) => {
  const id = projectId(c.req.param("id"));
  const imageId = c.req.param("imageId");
  if (!IMAGE_ID.test(imageId)) fail(404, "No such image");
  const file = await readFile(projectPath(id, "images", imageId));
  if (!file) fail(404, "No such image");
  return fileResponse(file!, "immutable");
});

const documentSummary = (row: {
  id: string;
  kind: string;
  machineId: string | null;
  label: string | null;
  name: string;
  mimeType: string;
  size: number;
  createdAt: Date;
}) => ({
  id: row.id,
  kind: row.kind,
  machineId: row.machineId ?? undefined,
  label: row.label ?? undefined,
  name: row.name,
  mimeType: row.mimeType,
  size: row.size,
  createdAt: row.createdAt.getTime(),
});

/**
 * Uploads a panorama or a machine's document, as multipart form data:
 * `file`, `kind` ("panorama" or "document"), and `machineId` or `label`.
 */
projects.post("/:id/documents", uploadLimit, async (c) => {
  const id = projectId(c.req.param("id"));
  if (!(await selectProjectById(id))) fail(404, "No such project");
  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fail(400, "Expected a non-empty `file`");
  }
  const upload = file as File;
  const kind = String(form!.get("kind") ?? "document");
  if (!DOCUMENT_KINDS.includes(kind as (typeof DOCUMENT_KINDS)[number])) {
    fail(400, `"kind" must be one of ${DOCUMENT_KINDS.join(", ")}`);
  }
  const text = (key: string) => {
    const value = form!.get(key);
    return typeof value === "string" && value.trim()
      ? value.trim().slice(0, NAME_LENGTH)
      : null;
  };
  const documentId = randomUUID();
  // The id keeps names apart; the name is only kept to read the path easily.
  const safeName = upload.name.replace(/[^\w.-]+/g, "_").slice(-80) || "file";
  const path = projectPath(id, "documents", `${documentId}-${safeName}`);
  const mimeType = upload.type || "application/octet-stream";
  const started = performance.now();
  await writeFile(path, Buffer.from(await upload.arrayBuffer()), mimeType);
  await insertDocument({
    id: documentId,
    projectId: id,
    kind,
    machineId: text("machineId"),
    label: text("label"),
    name: upload.name.slice(0, NAME_LENGTH),
    mimeType,
    size: upload.size,
    path,
  });
  log.info("document stored", { project: id, kind, bytes: upload.size, ms: since(started) });
  const row = await selectDocument(id, documentId);
  return c.json({ document: documentSummary(row!) }, 201);
});

/** A project's uploads, oldest first. */
projects.get("/:id/documents", async (c) => {
  const id = projectId(c.req.param("id"));
  const rows = await selectDocumentsByProjectId(id);
  return c.json({
    documents: rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(documentSummary),
  });
});

projects.get("/:id/documents/:documentId", async (c) => {
  const id = projectId(c.req.param("id"));
  const documentId = projectId(c.req.param("documentId"));
  const row = await selectDocument(id, documentId);
  if (!row) fail(404, "No such document");
  const file = await readFile(row!.path);
  if (!file) fail(404, "No such document");
  return fileResponse(file!, "immutable");
});

/** Renames an upload: { label }, such as the room a panorama shows. */
projects.patch("/:id/documents/:documentId", jsonLimit, async (c) => {
  const id = projectId(c.req.param("id"));
  const documentId = projectId(c.req.param("documentId"));
  const body = asObject(await c.req.json().catch(() => null));
  const label =
    typeof body.label === "string" && body.label.trim()
      ? body.label.trim().slice(0, NAME_LENGTH)
      : null;
  if (!(await updateDocument(id, documentId, { label }))) {
    fail(404, "No such document");
  }
  return c.body(null, 204);
});

projects.delete("/:id/documents/:documentId", async (c) => {
  const id = projectId(c.req.param("id"));
  const documentId = projectId(c.req.param("documentId"));
  const row = await deleteDocument(id, documentId);
  if (!row) fail(404, "No such document");
  await deleteFile(row!.path);
  return c.body(null, 204);
});

/**
 * The project's most recent finished run, as the results step replays it,
 * with its event log read back from the bucket.
 */
projects.get("/:id/runs/latest", async (c) => {
  const id = projectId(c.req.param("id"));
  const row = await selectLatestRun(id);
  if (!row) return c.json({ run: null });
  const events = row.eventsPath ? await readJson<unknown[]>(row.eventsPath) : null;
  return c.json({
    run: {
      id: row.id,
      seed: row.seed,
      horizon: row.horizon,
      maintenanceCrews: row.maintenanceCrews,
      tickMinutes: row.tickMinutes,
      scenario: row.scenario,
      graph: row.graph,
      agents: row.agents,
      adjustments: row.adjustments,
      baseline: row.baseline,
      days: row.days ?? undefined,
      kpis: row.kpis,
      events: events ?? [],
      decisions: row.decisions,
      playbook: row.playbook ?? undefined,
    },
  });
});
