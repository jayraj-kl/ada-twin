import { isOffered, modelCatalog, withModelChoice } from "@repo/agent";
import { Hono, type MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/** The models the app's picker offers, and the defaults. */
export const models = new Hono();

models.get("/", (c) => c.json(modelCatalog()));

/**
 * Uses the models the page picked, sent as X-Text-Model and X-Image-Model,
 * for every Gemini call this request makes. Only models the picker offers
 * are taken; without a header, the default is used.
 */
export const modelPicker: MiddlewareHandler = async (c, next) => {
  const text = c.req.header("x-text-model")?.trim() || undefined;
  const image = c.req.header("x-image-model")?.trim() || undefined;
  for (const [kind, id] of [
    ["text", text],
    ["image", image],
  ] as const) {
    if (id && !isOffered(kind, id)) {
      throw new HTTPException(400, {
        message: `"${id}" is not a ${kind} model this API offers`,
      });
    }
  }
  await withModelChoice({ text, image }, () => next());
};
