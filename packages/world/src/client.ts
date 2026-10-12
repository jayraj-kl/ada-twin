import type { GenerateWorldRequest, Operation, World } from "./types";

const DEFAULT_API_BASE = "https://api.worldlabs.ai";

export class WorldLabsError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "WorldLabsError";
  }
}

export interface WorldLabsClientOptions {
  apiKey: string;
  baseUrl?: string;
}

export interface WaitOptions {
  timeoutMs?: number;
  intervalMs?: number;
  onProgress?: (operation: Operation) => void;
}

export type WorldLabsClient = ReturnType<typeof createWorldLabsClient>;

async function errorDetail(response: Response): Promise<string> {
  const body = (await response.text()).trim();
  try {
    const payload = JSON.parse(body);
    if (typeof payload?.detail === "string") return payload.detail;
    if (typeof payload?.error?.message === "string") {
      return payload.error.message;
    }
    return JSON.stringify(payload?.detail ?? payload).slice(0, 1000);
  } catch {
    return body.slice(0, 1000) || `HTTP ${response.status}`;
  }
}

export function createWorldLabsClient({
  apiKey,
  baseUrl = DEFAULT_API_BASE,
}: WorldLabsClientOptions) {
  const root = `${baseUrl.replace(/\/+$/, "")}/marble/v1`;

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${root}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "WLT-Api-Key": apiKey,
      },
    });
    if (!response.ok) {
      throw new WorldLabsError(await errorDetail(response), response.status);
    }
    return (await response.json()) as T;
  }

  /** Starts generation and returns immediately with a pending operation. */
  function generateWorld(body: GenerateWorldRequest): Promise<Operation> {
    return request("/worlds:generate", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  function getOperation(operationId: string): Promise<Operation> {
    return request(`/operations/${encodeURIComponent(operationId)}`);
  }

  function getWorld(worldId: string): Promise<World> {
    return request(`/worlds/${encodeURIComponent(worldId)}`);
  }

  /**
   * Uploads a local image to World Labs and returns its media asset id, for
   * prompts whose images are not reachable at a public URL.
   */
  async function uploadImage(
    fileName: string,
    bytes: Uint8Array<ArrayBuffer>,
    contentType = "image/jpeg",
  ): Promise<string> {
    const { media_asset, upload_info } = await request<{
      media_asset: { media_asset_id: string };
      upload_info: {
        upload_url: string;
        upload_method: string;
        required_headers?: Record<string, string> | null;
      };
    }>("/media-assets:prepare_upload", {
      method: "POST",
      body: JSON.stringify({
        file_name: fileName,
        kind: "image",
        extension: fileName.split(".").pop(),
      }),
    });

    const response = await fetch(upload_info.upload_url, {
      method: upload_info.upload_method,
      headers: { "Content-Type": contentType, ...upload_info.required_headers },
      body: bytes,
    });
    if (!response.ok) {
      throw new WorldLabsError(
        `Uploading ${fileName} failed: ${await errorDetail(response)}`,
        response.status,
      );
    }
    return media_asset.media_asset_id;
  }

  /** Polls until the operation is done; throws if it failed or timed out. */
  async function waitForOperation(
    operationId: string,
    {
      timeoutMs = 10 * 60_000,
      intervalMs = 5_000,
      onProgress,
    }: WaitOptions = {},
  ): Promise<Operation> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const operation = await getOperation(operationId);
      onProgress?.(operation);
      if (operation.done) {
        if (operation.error) {
          throw new WorldLabsError(
            operation.error.message ?? "World Labs generation failed",
          );
        }
        return operation;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new WorldLabsError("Timed out waiting for World Labs generation");
  }

  return {
    generateWorld,
    getOperation,
    getWorld,
    uploadImage,
    waitForOperation,
  };
}
