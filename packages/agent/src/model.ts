import { AsyncLocalStorage } from "node:async_hooks";
import { type GenerateContentResponse, GoogleGenAI } from "@google/genai";
import { createLogger, since } from "@repo/logger";

export const log = createLogger("agent");

// Vertex AI needs a concrete model ID; aliases like `gemini-flash-latest`
// exist only on the AI Studio Gemini API.
export const DEFAULT_MODEL = "gemini-3.5-flash";
/** The models one request asked for, from the app's model picker. */
export interface ModelChoice {
  text?: string;
  image?: string;
}

const choice = new AsyncLocalStorage<ModelChoice>();

/**
 * Runs `work` with `picked` as the models every Gemini call inside it uses,
 * however deep, unless a call names its own.
 */
export function withModelChoice<T>(picked: ModelChoice, work: () => T): T {
  return choice.run(picked, work);
}

/** The text model to use now: the request's pick, else the environment's. */
export const textModelId = () =>
  choice.getStore()?.text || process.env.GEMINI_MODEL || DEFAULT_MODEL;

/** The image model the request picked, if it picked one. */
export const pickedImageModel = () => choice.getStore()?.image;

// Vertex AI's global endpoint serves every Gemini model, including ones not
// yet offered in single regions.
const DEFAULT_LOCATION = "global";

/**
 * Where Gemini runs on Vertex AI. Auth is Application Default Credentials:
 * `gcloud auth application-default login` locally, the service account on
 * Cloud Run.
 */
export function vertexSettings(): { project: string; location: string } {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) {
    throw new Error(
      "GOOGLE_CLOUD_PROJECT is not set (put it in apps/api/.env)",
    );
  }
  return {
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION ?? DEFAULT_LOCATION,
  };
}

/**
 * Vertex AI answers 429 when Gemini's shared capacity is busy, which is
 * common on new projects. Waiting and asking again usually works:
 * 2s, 4s, 8s, 16s, 32s, about a minute in all.
 */
export const RATE_LIMIT_RETRIES = 5;
export const RATE_LIMIT_FIRST_DELAY_SECONDS = 2;

export function isRateLimited(error: unknown): boolean {
  if ((error as { status?: unknown })?.status === 429) return true;
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("RESOURCE_EXHAUSTED") || message.includes('"code":429')
  );
}

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
  /** What the call is for, such as "draft-flow", for the logs. */
  task?: string;
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

export function createGeminiModel(options: { model?: string } = {}): AskModel {
  const client = new GoogleGenAI({
    vertexai: true,
    ...vertexSettings(),
    httpOptions: {
      retryOptions: {
        attempts: RATE_LIMIT_RETRIES + 1,
        initialDelay: RATE_LIMIT_FIRST_DELAY_SECONDS,
        // Only a busy model is worth asking again; other errors are answers.
        httpStatusCodes: [429],
      },
    },
  });
  const model = options.model ?? textModelId();

  return async ({ instruction, prompt, files = [], search, task }) => {
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
    const started = performance.now();
    const call = {
      task: task ?? "ask",
      model,
      files: files.length || undefined,
      search,
    };
    // A dropped connection on these long calls is worth one retry;
    // an answer from Gemini, good or bad, is not.
    const response = await generate()
      .catch((error: unknown) => {
        if (!(error instanceof TypeError)) throw error;
        log.warn("gemini connection dropped, asking again", { ...call, error });
        return generate();
      })
      .catch((error: unknown) => {
        log.error("gemini call failed", { ...call, ms: since(started), error });
        throw error;
      });
    log.info("gemini call", {
      ...call,
      ms: since(started),
      ...usage(response),
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

/** Token counts and why the model stopped, for the logs. */
export function usage(response: GenerateContentResponse) {
  const { promptTokenCount, candidatesTokenCount, thoughtsTokenCount } =
    response.usageMetadata ?? {};
  const finish = response.candidates?.[0]?.finishReason;
  return {
    tokensIn: promptTokenCount,
    tokensOut: candidatesTokenCount,
    tokensThinking: thoughtsTokenCount,
    finish: finish && finish !== "STOP" ? finish : undefined,
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
