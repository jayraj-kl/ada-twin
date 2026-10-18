import { API } from "./models";

/** An answer from the API that was not a success, with its status. */
export class ServerError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Calls the API with a JSON body and answers its JSON, or throws ServerError. */
export async function server<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown } = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const response = await fetch(`${API}${path}`, {
    ...rest,
    headers:
      body === undefined
        ? headers
        : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch((error: unknown) => {
    throw new ServerError(
      error instanceof Error ? error.message : String(error),
      0,
    );
  });
  if (response.status === 204) return undefined as T;
  const answer = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ServerError(
      answer?.error ?? `The API answered HTTP ${response.status}`,
      response.status,
    );
  }
  return answer as T;
}
