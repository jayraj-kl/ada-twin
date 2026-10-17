import { DEFAULT_IMAGE_MODEL } from "./image-editor";
import { DEFAULT_MODEL } from "./model";

/** A model the app's picker offers. */
export interface ModelOption {
  id: string;
  label: string;
  /** One line on when to pick it. */
  note: string;
  /** A word for its chip: "Newest", "Cheapest"... */
  badge?: string;
}

export interface ImageModelOption extends ModelOption {
  /** US dollars per image at the size the app asks for (2K, or 1K at most). */
  pricePerImage: number;
}

/**
 * Text models: Gemini on Vertex AI, generally available and not retiring
 * soon, from Google's model versions table (checked 2026-10-17):
 * https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versions
 */
const TEXT: ModelOption[] = [
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    note: "Fast, and what AdaTwin's prompts were written against",
  },
  {
    id: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    note: "The newest Flash, released September 2026",
    badge: "Newest Flash",
  },
  {
    id: "gemini-4-argon",
    label: "Gemini 4 Argon",
    note: "Google's newest model, released October 2026",
    badge: "Newest",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    note: "Cheapest and quickest; less careful with long answers",
    badge: "Cheapest",
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    note: "The earlier Flash-Lite",
  },
];

/**
 * Nano Banana models that edit photos, with Vertex AI's price per image
 * (docs/research/final-step-nano-banana.md, section 3.1).
 */
const IMAGE: ImageModelOption[] = [
  {
    id: "gemini-nano-banana-2.1",
    label: "Nano Banana 2.1",
    note: "Cheap at 2K and made for editing back and forth",
    pricePerImage: 0.05,
  },
  {
    id: "gemini-3-pro-image",
    label: "Nano Banana Pro",
    note: "Draws the most faithfully; about three times the price",
    badge: "Best",
    pricePerImage: 0.134,
  },
  {
    id: "gemini-3.1-flash-image",
    label: "Nano Banana 2",
    note: "The earlier Flash image model",
    pricePerImage: 0.101,
  },
  {
    id: "gemini-3.1-flash-lite-image",
    label: "Nano Banana 2 Lite",
    note: "Cheapest; draws at 1K only",
    badge: "Cheapest",
    pricePerImage: 0.034,
  },
];

/** A model named in .env that the list does not know, offered as it is. */
const fromEnv = (id: string) => ({
  id,
  label: id,
  note: "Set in the API's .env",
});

/**
 * What the picker offers, and which is used when nothing is picked: the
 * environment's model if set, else the app's default.
 */
export function modelCatalog() {
  const text = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const image = process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL;
  return {
    text: {
      default: text,
      options: TEXT.some(({ id }) => id === text)
        ? TEXT
        : [fromEnv(text), ...TEXT],
    },
    image: {
      default: image,
      options: IMAGE.some(({ id }) => id === image)
        ? IMAGE
        : [{ ...fromEnv(image), pricePerImage: 0.05 }, ...IMAGE],
    },
  };
}

/** Whether `id` is one of the models the picker offers for `kind`. */
export function isOffered(kind: "text" | "image", id: string): boolean {
  return modelCatalog()[kind].options.some((option) => option.id === id);
}
