import { GoogleGenAI, Modality } from "@google/genai";
import {
  RATE_LIMIT_FIRST_DELAY_SECONDS,
  RATE_LIMIT_RETRIES,
  vertexSettings,
} from "./model";

// Nano Banana 2.1: cheap at 2K and tuned for back-and-forth editing. Like
// Nano Banana Pro (`gemini-3-pro-image`) it is served from `global` only.
export const DEFAULT_IMAGE_MODEL = "gemini-nano-banana-2.1";

export interface InlineImage {
  mimeType: string;
  /** Base64. */
  data: string;
}

/** One part of a turn, as Gemini returns it; the signature goes back as is. */
export interface ImagePart {
  text?: string;
  inlineData?: InlineImage;
  thoughtSignature?: string;
}

export interface ImageTurn {
  role: "user" | "model";
  parts: ImagePart[];
}

export interface ImageEditRequest {
  instruction: string;
  /** The conversation, oldest first, ending with the user's turn. */
  contents: ImageTurn[];
  aspectRatio?: string;
  imageSize?: "1K" | "2K" | "4K";
}

export interface ImageEditReply {
  /** Null when the model answered in words only, or refused. */
  image: InlineImage | null;
  text: string;
  /** The model's turn, to send back unchanged when the image is revised. */
  turn: ImageTurn;
}

/**
 * Edits an image from a conversation about it. The API keeps no session, so
 * the caller holds the conversation and sends it back each time.
 */
export type EditImage = (request: ImageEditRequest) => Promise<ImageEditReply>;

export function createImageEditor(options: { model?: string } = {}): EditImage {
  const client = new GoogleGenAI({
    vertexai: true,
    ...vertexSettings(),
    httpOptions: {
      retryOptions: {
        attempts: RATE_LIMIT_RETRIES + 1,
        initialDelay: RATE_LIMIT_FIRST_DELAY_SECONDS,
        httpStatusCodes: [429],
      },
    },
  });
  const model =
    options.model ?? process.env.IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL;

  return async ({ instruction, contents, aspectRatio, imageSize }) => {
    // No temperature, topP or seed: the image models reject them.
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: instruction,
        responseModalities: [Modality.TEXT, Modality.IMAGE],
        imageConfig: {
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(imageSize ? { imageSize } : {}),
          outputMimeType: "image/jpeg",
          outputCompressionQuality: 90,
        },
      },
    });
    const candidate = response.candidates?.[0];
    // Thoughts, and the draft images among them, are left out: only the
    // answer and its signatures need to go back.
    const parts: ImagePart[] = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought && (part.text || part.inlineData?.data))
      .map((part) => ({
        ...(part.text ? { text: part.text } : {}),
        ...(part.inlineData?.data
          ? {
              inlineData: {
                mimeType: part.inlineData.mimeType ?? "image/jpeg",
                data: part.inlineData.data,
              },
            }
          : {}),
        ...(part.thoughtSignature
          ? { thoughtSignature: part.thoughtSignature }
          : {}),
      }));
    const image = parts.find((part) => part.inlineData)?.inlineData ?? null;
    const text = parts
      .map((part) => part.text ?? "")
      .join(" ")
      .trim();
    const blocked =
      response.promptFeedback?.blockReason ??
      (candidate?.finishReason && candidate.finishReason !== "STOP"
        ? candidate.finishReason
        : undefined);
    return {
      image,
      text:
        text ||
        (image
          ? ""
          : blocked
            ? `The model made no image (${blocked}).`
            : "The model made no image."),
      turn: { role: "model", parts },
    };
  };
}
