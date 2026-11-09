import { API } from "@/lib/models";
import type { CheckResult, CheckStatus, Results } from "./history";

// Matches the scheduled checker: answered, but slower than this, is degraded.
const SLOW_MS = 5000;
const TIMEOUT_MS = 20_000;

async function timed(url: string) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { response, ms: Math.round(performance.now() - started) };
  } catch {
    return { response: null, ms: Math.round(performance.now() - started) };
  }
}

const grade = (ok: boolean, ms: number): CheckStatus =>
  !ok ? "down" : ms > SLOW_MS ? "degraded" : "up";

/** Checks every component from this browser, as the scheduled checker does. */
export async function checkNow(): Promise<Results> {
  const [web, api, health] = await Promise.all([
    timed(`/?status=${Date.now()}`),
    timed(`${API}/`),
    timed(`${API}/health`),
  ]);
  const checks = (await health.response?.json().catch(() => null))?.checks as
    | Record<"database" | "storage", { ok: boolean; ms: number }>
    | undefined;
  const behindApi = (id: "database" | "storage"): CheckResult => {
    const check = checks?.[id];
    return check ? { status: grade(check.ok, check.ms), ms: check.ms } : { status: "unknown" };
  };
  return {
    web: { status: grade(Boolean(web.response?.ok), web.ms), ms: web.ms },
    api: { status: grade(Boolean(api.response?.ok), api.ms), ms: api.ms },
    database: behindApi("database"),
    storage: behindApi("storage"),
  };
}
