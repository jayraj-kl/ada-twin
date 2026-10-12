import type { WorldPrompt } from "./types";

const PROMPT_IMAGE_LIMIT = 8;

export interface SourceImage {
  url: string;
  azimuth?: number;
}

export interface WorldPromptInput {
  images?: SourceImage[];
  textPrompt?: string;
}

/**
 * Picks `limit` items spread across the whole list, so a long capture
 * sequence contributes coverage of the full route rather than its start.
 */
function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (limit <= 0) return [];
  if (items.length <= limit) return [...items];
  if (limit === 1) return [items[Math.floor(items.length / 2)]!];

  const step = (items.length - 1) / (limit - 1);
  return Array.from(
    { length: limit },
    (_, slot) => items[Math.round(slot * step)]!,
  );
}

export function buildWorldPrompt({
  images = [],
  textPrompt,
}: WorldPromptInput): WorldPrompt {
  const text = textPrompt?.trim() || undefined;

  if (images.length === 0) {
    if (!text) {
      throw new Error("A world needs at least one image or a text prompt");
    }
    return { type: "text", text_prompt: text };
  }

  if (images.length === 1) {
    return {
      type: "image",
      image_prompt: { source: "uri", uri: images[0]!.url },
      ...(text && { text_prompt: text }),
    };
  }

  return {
    type: "multi-image",
    reconstruct_images: true,
    multi_image_prompt: sampleEvenly(images, PROMPT_IMAGE_LIMIT).map(
      (image) => ({
        content: { source: "uri" as const, uri: image.url },
        ...(image.azimuth !== undefined && { azimuth: image.azimuth }),
      }),
    ),
    ...(text && { text_prompt: text }),
  };
}
