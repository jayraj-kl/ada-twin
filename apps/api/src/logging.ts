import { randomUUID } from "node:crypto";
import { addLogContext, createLogger, serializeError, since, withLogContext } from "@repo/logger";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

export const log = createLogger("api");

/**
 * Logs one line per request once it is answered: the service it called (the
 * first part of the path: twin, run, plant, worlds), the route, the status
 * and how long it took. Every line logged while it is handled, the agent's
 * Gemini calls included, carries the same request id, which also goes back
 * in the X-Request-Id header.
 */
export const requestLogger: MiddlewareHandler = async (c, next) => {
  const started = performance.now();
  const requestId = c.req.header("x-request-id") || randomUUID().slice(0, 8);
  // Cloud Run sends "TRACE_ID/SPAN_ID;o=1".
  const trace = c.req.header("x-cloud-trace-context")?.split("/")[0];
  const service = c.req.path.split("/")[1] || "root";
  c.header("X-Request-Id", requestId);

  await withLogContext({ requestId, service, trace }, async () => {
    log.debug("request", { method: c.req.method, path: c.req.path });
    await next();
    // The route as declared, such as /worlds/operations/:operationId, when
    // it says more than the path.
    const route = c.req.routePath;
    if (route !== "/*" && route !== c.req.path) addLogContext({ route });

    const status = c.res.status;
    const fields = {
      status,
      ms: since(started),
      bytesIn: Number(c.req.header("content-length")) || undefined,
      origin: c.req.header("origin"),
    };
    const error = c.error;
    const message = `${c.req.method} ${c.req.path}`;
    if (error && !(error instanceof HTTPException) && status >= 500) {
      // Something broke: keep the stack.
      log.error(message, { ...fields, error: serializeError(error) });
    } else if (status >= 400) {
      // Answered on purpose, such as bad input or a missing setting: the
      // reason is enough.
      log.warn(message, { ...fields, reason: error?.message });
    } else {
      log.info(message, fields);
    }
  });
};

/** For errors no route answered itself. */
export function unhandled(error: Error) {
  return Response.json(
    { error: error.message },
    { status: error instanceof HTTPException ? error.status : 500 },
  );
}
