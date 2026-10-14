import { GoogleGenAI } from "@google/genai";

const DEFAULT_MODEL = "gemini-flash-latest";

export interface ModelFile {
  bytes: Uint8Array;
  mimeType: string;
}

export interface ModelRequest {
  instruction?: string;
  prompt: string;
  /** Images or PDFs the model should read. */
  files?: ModelFile[];
  /** Let the model search the web and ground its answer in what it finds. */
  search?: boolean;
}

export interface ModelReply {
  text: string;
  /** Pages the model consulted, when `search` was on. */
  sources: { url: string; title?: string }[];
}

/**
 * One-shot question to a model that answers in JSON. The twin-building steps
 * take this instead of a Gemini client so tests can script the answers.
 */
export type AskModel = (request: ModelRequest) => Promise<ModelReply>;

export function createGeminiModel(
  options: { apiKey?: string; model?: string } = {},
): AskModel {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set (put it in apps/api/.env)");
  }
  const client = new GoogleGenAI({ apiKey });
  const model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  return async ({ instruction, prompt, files = [], search }) => {
    const generate = () =>
      client.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              ...files.map((file) => ({
                inlineData: {
                  mimeType: file.mimeType,
                  data: Buffer.from(file.bytes).toString("base64"),
                },
              })),
              { text: prompt },
            ],
          },
        ],
        config: {
          systemInstruction: instruction,
          // Gemini cannot combine forced-JSON output with web search, so with
          // search on the JSON is asked for in the prompt and parsed leniently.
          ...(search
            ? { tools: [{ googleSearch: {} }] }
            : { responseMimeType: "application/json" }),
        },
      });
    // A dropped connection on these long calls is worth one retry;
    // an answer from Gemini, good or bad, is not.
    const response = await generate().catch((error: unknown) => {
      if (error instanceof TypeError) return generate();
      throw error;
    });
    const chunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
    return {
      text: response.text ?? "",
      sources: chunks.flatMap((chunk) =>
        chunk.web?.uri
          ? [{ url: chunk.web.uri, title: chunk.web.title ?? undefined }]
          : [],
      ),
    };
  };
}

/** Pulls the JSON value out of a reply that may wrap it in prose or fences. */
export function parseJsonReply(text: string): unknown {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start === -1 || end <= start) {
    throw new Error(`The model did not answer in JSON: ${text.slice(0, 200)}`);
  }
  return JSON.parse(text.slice(start, end + 1));
}
