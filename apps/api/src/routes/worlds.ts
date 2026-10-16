import {
  WorldLabsError,
  buildWorldPrompt,
  createWorldLabsClient,
  extractWorldAssets,
  type SourceImage,
  type WorldModel,
} from "@repo/world";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

interface CreateWorldBody {
  displayName?: string;
  textPrompt?: string;
  images?: SourceImage[];
  model?: WorldModel;
}

function client() {
  const apiKey = process.env.WORLD_LABS_API_KEY;
  if (!apiKey) {
    throw new HTTPException(500, { message: "WORLD_LABS_API_KEY is not set" });
  }
  return createWorldLabsClient({
    apiKey,
    baseUrl: process.env.WORLD_LABS_API_BASE || undefined,
  });
}

function parseBody(body: unknown): CreateWorldBody {
  const { displayName, textPrompt, images, model } = (body ?? {}) as Record<
    string,
    unknown
  >;
  const validImages =
    images === undefined ||
    (Array.isArray(images) &&
      images.every(
        (image) =>
          typeof image?.url === "string" &&
          URL.canParse(image.url) &&
          (image.azimuth === undefined || typeof image.azimuth === "number"),
      ));
  if (
    !validImages ||
    (displayName !== undefined && typeof displayName !== "string") ||
    (textPrompt !== undefined && typeof textPrompt !== "string") ||
    (model !== undefined && typeof model !== "string")
  ) {
    throw new HTTPException(400, {
      message:
        "Expected { displayName?: string, textPrompt?: string, model?: string, images?: { url: string, azimuth?: number }[] }",
    });
  }
  return body as CreateWorldBody;
}

export const worlds = new Hono();

worlds.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  if (error instanceof WorldLabsError) {
    // Bad prompts, missing credits and unknown ids are the caller's to fix;
    // anything else is an upstream failure.
    const statuses = { 400: 400, 422: 400, 402: 402, 404: 404 } as const;
    const status = statuses[error.status as keyof typeof statuses] ?? 502;
    return c.json({ error: error.message }, status);
  }
  throw error;
});

// Kicks off generation. It takes ~5 minutes, so the caller polls the operation.
worlds.post("/", async (c) => {
  const body = parseBody(await c.req.json().catch(() => null));
  if (!body.images?.length && !body.textPrompt?.trim()) {
    throw new HTTPException(400, {
      message: "Provide at least one image or a textPrompt",
    });
  }

  const operation = await client().generateWorld({
    world_prompt: buildWorldPrompt(body),
    display_name: body.displayName?.slice(0, 64),
    model: body.model,
  });
  return c.json({ operationId: operation.operation_id }, 202);
});

worlds.get("/operations/:operationId", async (c) => {
  const operation = await client().getOperation(c.req.param("operationId"));
  const base = {
    operationId: operation.operation_id,
    progress: operation.metadata?.progress ?? null,
  };

  if (!operation.done) return c.json({ ...base, status: "generating" });
  if (operation.error || !operation.response) {
    return c.json({
      ...base,
      status: "failed",
      error: operation.error?.message ?? "World Labs generation failed",
    });
  }
  return c.json({
    ...base,
    status: "ready",
    world: extractWorldAssets(operation.response),
  });
});
