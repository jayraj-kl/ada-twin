import { pingDatabase } from "@repo/db/queries/health";
import { since } from "@repo/logger";
import { Hono } from "hono";
import { log } from "../logging";
import { pingStorage } from "../storage";

/**
 * Whether the API's own dependencies answer, for the status page's checker.
 * It touches nothing that costs money: no Gemini, no World Labs.
 */
export const health = new Hono();

// A dependency slower than this counts as down rather than holding the
// checker for its whole timeout.
const TIMEOUT_MS = 8000;

interface Check {
  ok: boolean;
  ms: number;
}

/** Times one ping. Why it failed goes to the log, not to the public answer. */
async function check(name: string, ping: () => Promise<void>): Promise<Check> {
  const started = performance.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
      }),
    ]);
    return { ok: true, ms: since(started) };
  } catch (error) {
    // Drizzle wraps the driver's error; a refused connection has only a code.
    const cause = ((error as { cause?: unknown }).cause ?? error) as {
      message?: string;
      code?: string;
    };
    log.warn(`health: ${name} failed`, {
      reason: cause.message || cause.code || String(cause),
    });
    return { ok: false, ms: since(started) };
  } finally {
    clearTimeout(timer);
  }
}

/** { ok, checks: { database, storage } }, with 503 when any check failed. */
health.get("/", async (c) => {
  const [database, storage] = await Promise.all([
    check("database", pingDatabase),
    check("storage", pingStorage),
  ]);
  const ok = database.ok && storage.ok;
  c.header("Cache-Control", "no-store");
  return c.json({ ok, checks: { database, storage } }, ok ? 200 : 503);
});
