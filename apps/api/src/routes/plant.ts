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
 * notes?, message, count } and answers { check, results }: `count` images
 * to choose from, each { image, text, turn } or { error }, and whether the
 * request goes beyond the applied redesign.
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
    const previous = parseTurn(body?.previous);
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
    return c.json({
      check: check?.status === "fulfilled" ? check.value : null,
      results: results.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : {
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            },
      ),
    });
  },
);
