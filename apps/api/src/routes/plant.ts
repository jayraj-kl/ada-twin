import {
  type ImagePart,
  type ImageTurn,
  type InlineImage,
  type RankedChange,
  createGeminiModel,
  createImageEditor,
  explainChanges,
  illustrate,
  outsideRedesign,
} from "@repo/agent";
import type { Scenario } from "@repo/sim";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { projectPath, readJson, storageConfigured, writeFile, writeJson } from "../storage";
import { goal } from "./run";

// Two 2K JPEGs as base64 (the photo and the last edit) fit with room to spare.
const MAX_BODY = 20 * 1024 * 1024;
// Base64 characters in one image, about 7 MB of bytes: Vertex's inline limit.
const MAX_IMAGE = 9_500_000;
const MAX_CHANGES = 30;
const MAX_IMAGES = 4;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export const plant = new Hono();

plant.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  return c.json(
    { error: error instanceof Error ? error.message : String(error) },
    502,
  );
});

const fail = (message: string): never => {
  throw new HTTPException(400, { message });
};

const text = (value: unknown, max: number) =>
  typeof value === "string" ? value.slice(0, max) : "";

function parseImage(value: unknown): InlineImage {
  const { mimeType, data } = (value ?? {}) as Partial<InlineImage>;
  if (!IMAGE_TYPES.includes(mimeType ?? "")) {
    fail("Expected a JPEG, PNG or WebP image");
  }
  if (typeof data !== "string" || data.length === 0 || data.length > MAX_IMAGE) {
    fail("Expected the image as base64, under 7 MB");
  }
  return { mimeType: mimeType!, data: data! };
}

/** The model's earlier turn, exactly as it was sent: only its own fields. */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IMAGE_ID = /^[\w.:-]{1,200}$/;

/** Where the page keeps a drawing: its project and the image's id. */
function parseImageRef(value: unknown) {
  if (value === undefined || value === null) return null;
  const { projectId, id } = value as { projectId?: unknown; id?: unknown };
  if (
    typeof projectId !== "string" ||
    !UUID.test(projectId) ||
    typeof id !== "string" ||
    !IMAGE_ID.test(id)
  ) {
    return fail("Expected an image as { projectId, id }");
  }
  return { projectId, id };
}

/** The ids to keep each drawing under, in the project's files. */
function parseStore(value: unknown) {
  if (value === undefined || value === null) return null;
  const { projectId, ids } = value as { projectId?: unknown; ids?: unknown };
  if (
    typeof projectId !== "string" ||
    !UUID.test(projectId) ||
    !Array.isArray(ids) ||
    ids.some((id) => typeof id !== "string" || !IMAGE_ID.test(id))
  ) {
    return fail("Expected { projectId, ids } to store the drawings under");
  }
  return { projectId, ids: ids as string[] };
}

const imagePath = ({ projectId, id }: { projectId: string; id: string }) =>
  projectPath(projectId, "images", id);
const turnPath = (ref: { projectId: string; id: string }) =>
  `${imagePath(ref)}.turn.json`;

function parseTurn(value: unknown): ImageTurn | undefined {
  if (value === undefined || value === null) return undefined;
  const parts = (value as { parts?: unknown }).parts;
  if (!Array.isArray(parts) || parts.length === 0 || parts.length > 8) {
    return fail("Expected the earlier edit as the model's turn");
  }
  return {
    role: "model",
    parts: parts.map((raw: Record<string, unknown>): ImagePart => ({
      ...(typeof raw?.text === "string" ? { text: raw.text.slice(0, 4000) } : {}),
      ...(raw?.inlineData ? { inlineData: parseImage(raw.inlineData) } : {}),
      ...(typeof raw?.thoughtSignature === "string"
        ? { thoughtSignature: raw.thoughtSignature }
        : {}),
    })),
  };
}

function lines(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value
        .filter((line): line is string => typeof line === "string")
        .map((line) => line.slice(0, 500))
        .slice(-max)
    : [];
}

/**
 * Writes the applied-changes report from the measured ranking. Takes
 * { scenario, before, after, bottleneck?, changes } and answers
 * { summary, paragraphs }.
 */
plant.post("/explain", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    scenario?: Scenario;
    before?: number;
    after?: number;
    bottleneck?: string;
    changes?: RankedChange[];
  } | null;
  const changes = Array.isArray(body?.changes)
    ? body.changes.slice(0, MAX_CHANGES)
    : fail("Expected the ranked changes");
  for (const change of changes) {
    if (
      typeof change?.id !== "string" ||
      typeof change.title !== "string" ||
      !Number.isFinite(change.marginal) ||
      !Number.isFinite(change.solo)
    ) {
      fail("Each change needs an id, a title and its measured gains");
    }
  }
  let ask;
  try {
    ask = createGeminiModel();
  } catch (error) {
    throw new HTTPException(503, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return c.json(
    await explainChanges(ask, {
      scenario: text(body?.scenario?.name, 200) || "the chosen scenario",
      goal: body?.scenario?.shiftHours ? goal(body.scenario) : undefined,
      before: Number(body?.before) || 0,
      after: Number(body?.after) || 0,
      bottleneck: text(body?.bottleneck, 200) || undefined,
      changes: changes.map((change) => ({
        ...change,
        title: change.title.slice(0, 200),
        detail: text(change.detail, 600),
        cost: text(change.cost, 200) || undefined,
      })),
    }),
  );
});

/**
 * Draws the redesign into a view of the plant's panorama with Nano Banana,
 * or revises an earlier drawing. Takes { view, subject, changes, previous?,
 * previousImage?, store?, notes?, message, count } and answers
 * { check, results }: `count` images to choose from, each
 * { image, text, turn, stored? } or { error }, and whether the request goes
 * beyond the applied redesign.
 *
 * With `store: { projectId, ids }`, each drawing is kept in the project's
 * files under its id, with the model's turn beside it; the answer then leaves
 * the turn out. `previousImage: { projectId, id }` revises a kept drawing
 * without the page sending its turn back.
 */
plant.post(
  "/illustrate",
  bodyLimit({
    maxSize: MAX_BODY,
    onError: (c) =>
      c.json({ error: "The images are too large to send" }, 413),
  }),
  async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    const message = text(body?.message, 2000).trim();
    if (!message) fail("Say what to draw");
    const view = parseImage(body?.view);
    const store = parseStore(body?.store);
    const previousRef = parseImageRef(body?.previousImage);
    if ((store || previousRef) && !storageConfigured()) {
      throw new HTTPException(503, {
        message: "GCS_BUCKET is not set, so drawings cannot be kept",
      });
    }
    let previous = parseTurn(body?.previous);
    if (!previous && previousRef) {
      previous = (await readJson<ImageTurn>(turnPath(previousRef))) ?? undefined;
      if (!previous) fail("The drawing to revise is no longer kept");
    }
    const changes = lines(body?.changes, MAX_CHANGES);
    const count = Math.min(
      MAX_IMAGES,
      Math.max(1, Math.round(Number(body?.count)) || 1),
    );
    let edit;
    let ask;
    try {
      edit = createImageEditor();
      ask = createGeminiModel();
    } catch (error) {
      throw new HTTPException(503, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
    const request = {
      view,
      subject: text(body?.subject, 300) || "part of the plant",
      changes,
      previous,
      notes: lines(body?.notes, 12),
      message,
    };
    const [check, ...results] = await Promise.allSettled([
      // Only revisions can go beyond the redesign; the first drawing is of it.
      previous ? outsideRedesign(ask, { changes, message }) : null,
      ...Array.from({ length: count }, () => illustrate(edit, request)),
    ]);
    if (results.every((result) => result.status === "rejected")) {
      throw (results[0] as PromiseRejectedResult).reason;
    }
    // Keeps each drawing; one that cannot be kept is still shown.
    const answers = await Promise.all(
      results.map(async (result, index) => {
        if (result.status === "rejected") {
          return {
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          };
        }
        const reply = result.value;
        const id = store?.ids[index];
        if (!store || !id || !reply.image) return reply;
        const ref = { projectId: store.projectId, id };
        try {
          await Promise.all([
            writeFile(
              imagePath(ref),
              Buffer.from(reply.image.data, "base64"),
              reply.image.mimeType,
            ),
            writeJson(turnPath(ref), reply.turn),
          ]);
          return { image: reply.image, text: reply.text, stored: true };
        } catch {
          return { ...reply, stored: false };
        }
      }),
    );
    return c.json({
      check: check?.status === "fulfilled" ? check.value : null,
      results: answers,
    });
  },
);
