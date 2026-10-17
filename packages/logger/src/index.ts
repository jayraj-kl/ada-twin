import { AsyncLocalStorage } from "node:async_hooks";

/**
 * One line per event, to stdout. On Cloud Run (or with LOG_FORMAT=json) each
 * line is JSON that Cloud Logging reads as a structured entry: `severity`,
 * `message` and the fields. Locally it is a short coloured line instead.
 *
 *   LOG_LEVEL   debug | info | warn | error   (default info)
 *   LOG_FORMAT  pretty | json                 (default json in production)
 */
export type Level = "debug" | "info" | "warn" | "error";
export type Fields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
  /** The same logger with `fields` on every line. */
  child(fields: Fields): Logger;
}

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SEVERITY: Record<Level, string> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

function threshold(): number {
  const wanted = process.env.LOG_LEVEL?.toLowerCase() as Level | undefined;
  return RANK[wanted ?? "info"] ?? RANK.info;
}

function json(): boolean {
  const format = process.env.LOG_FORMAT?.toLowerCase();
  if (format) return format === "json";
  return process.env.NODE_ENV === "production" || Boolean(process.env.K_SERVICE);
}

// Fields every line logged while handling one request carries, such as its
// id, without passing a logger through every call.
const context = new AsyncLocalStorage<Fields>();

/** Runs `work` with `fields` on every line it logs, however deep. */
export function withLogContext<T>(fields: Fields, work: () => T): T {
  return context.run({ ...context.getStore(), ...fields }, work);
}

/** Adds `fields` to the lines logged from here on in the current context. */
export function addLogContext(fields: Fields): void {
  const store = context.getStore();
  if (store) Object.assign(store, fields);
}

/** An Error as plain fields, so it survives JSON and keeps its stack. */
export function serializeError(error: unknown): Fields {
  if (!(error instanceof Error)) return { message: String(error) };
  const extra = error as Error & { status?: unknown; code?: unknown };
  return {
    name: error.name,
    message: error.message,
    ...(extra.status !== undefined ? { status: extra.status } : {}),
    ...(extra.code !== undefined ? { code: extra.code } : {}),
    stack: error.stack,
    ...(error.cause !== undefined ? { cause: serializeError(error.cause) } : {}),
  };
}

const prepare = (fields: Fields): Fields =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Error ? serializeError(value) : value]),
  );

const colour = (code: number, text: string) =>
  process.stdout.isTTY && !process.env.NO_COLOR ? `\x1b[${code}m${text}\x1b[0m` : text;
const LEVEL_COLOUR: Record<Level, number> = { debug: 90, info: 32, warn: 33, error: 31 };

function pretty(value: unknown): string {
  if (typeof value === "string") return /[\s"=]/.test(value) ? JSON.stringify(value) : value;
  if (typeof value === "number" && !Number.isInteger(value)) return String(Math.round(value * 100) / 100);
  return JSON.stringify(value);
}

function writePretty(level: Level, message: string, fields: Fields) {
  const { logger, service, requestId, error, ...rest } = fields;
  const time = new Date().toISOString().slice(11, 23);
  const parts = [
    colour(90, time),
    colour(LEVEL_COLOUR[level], level.toUpperCase().padEnd(5)),
    colour(35, String(logger).padEnd(5)),
    service ? colour(36, String(service).padEnd(6)) : "",
    message,
    ...Object.entries(rest).map(([key, value]) => colour(90, `${key}=`) + pretty(value)),
    requestId ? colour(90, `req=${String(requestId)}`) : "",
  ].filter(Boolean);
  let line = parts.join(" ");
  const failure = error as Fields | undefined;
  if (failure) {
    line += ` ${colour(31, String(failure.message ?? failure))}`;
    if (typeof failure.stack === "string") {
      line += `\n${colour(90, failure.stack.split("\n").slice(1).join("\n"))}`;
    }
  }
  (level === "error" || level === "warn" ? process.stderr : process.stdout).write(`${line}\n`);
}

function writeJson(level: Level, message: string, fields: Fields) {
  const { trace, ...rest } = fields;
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const line = {
    severity: SEVERITY[level],
    message,
    time: new Date().toISOString(),
    ...rest,
    // Groups the lines of one request under its trace in Cloud Logging.
    ...(trace && project
      ? { "logging.googleapis.com/trace": `projects/${project}/traces/${String(trace)}` }
      : {}),
  };
  let text: string;
  try {
    text = JSON.stringify(line);
  } catch {
    text = JSON.stringify({ severity: line.severity, message, time: line.time });
  }
  process.stdout.write(`${text}\n`);
}

/**
 * A logger for one part of the system, such as "api" or "agent". Lines
 * logged while a request is handled also carry its context: the API puts the
 * request's id and the service it called (twin, run, plant...) there.
 */
export function createLogger(name: string, base: Fields = {}): Logger {
  const write = (level: Level, message: string, fields: Fields = {}) => {
    if (RANK[level] < threshold()) return;
    const all = prepare({ logger: name, ...context.getStore(), ...base, ...fields });
    if (json()) writeJson(level, message, all);
    else writePretty(level, message, all);
  };
  return {
    debug: (message, fields) => write("debug", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
    error: (message, fields) => write("error", message, fields),
    child: (fields) => createLogger(name, { ...base, ...fields }),
  };
}

/** Milliseconds since `start`, from `performance.now()`, rounded. */
export const since = (start: number) => Math.round(performance.now() - start);
