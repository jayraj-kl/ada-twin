// Checks the website, the API, the database and file storage once, and folds
// the result into the history the status page (/status) draws. Run every five
// minutes by .github/workflows/status.yml, which keeps the history as
// status.json on the status-data branch:
//
//   node .github/status/check.mjs status.json
import { readFile, writeFile } from "node:fs/promises";

const WEB_URL = process.env.WEB_URL ?? "https://ada-twin.web.app";
const API_URL =
  process.env.API_URL ?? "https://ada-twin-api-hrxqvnhhsq-bq.a.run.app";

// The API scales to zero, so the first request can wait for a cold start.
const TIMEOUT_MS = 20_000;
// Answered, but slower than this, counts as degraded.
const SLOW_MS = 5_000;
// A failure is checked again after this long before it counts, so one
// dropped request from the runner is not an outage.
const RETRY_AFTER_MS = 15_000;
const RECENT_MS = 24 * 60 * 60 * 1000;
const DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const COMPONENTS = [
  { id: "web", name: "Website" },
  { id: "api", name: "API" },
  { id: "database", name: "Database" },
  { id: "storage", name: "File storage" },
];

async function timed(url) {
  const started = performance.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Cache-Control": "no-cache" },
    });
    const body = await response.text();
    return { ok: response.ok, body, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, body: "", ms: Math.round(performance.now() - started) };
  }
}

const grade = (ok, ms) => (!ok ? "down" : ms > SLOW_MS ? "degraded" : "up");

/** Each component's state now: { status: up|degraded|down|unknown, ms }. */
async function probe() {
  const [web, api, health] = await Promise.all([
    timed(`${WEB_URL}/`),
    timed(`${API_URL}/`),
    timed(`${API_URL}/health`),
  ]);
  let checks;
  try {
    checks = JSON.parse(health.body).checks;
  } catch {
    // No answer from /health: covered below.
  }
  const results = {
    web: { status: grade(web.ok, web.ms), ms: web.ms },
    api: { status: grade(api.ok, api.ms), ms: api.ms },
  };
  for (const id of ["database", "storage"]) {
    const check = checks?.[id];
    // When the API cannot answer, the database and storage behind it are
    // not known to be down: the API is what is.
    results[id] = check
      ? { status: grade(check.ok, check.ms), ms: check.ms }
      : { status: "unknown" };
  }
  return results;
}

/** Adds one round of results to the history, dropping what is too old. */
function fold(history, at, results) {
  const now = Date.parse(at);
  const oldest = new Date(now - (DAYS - 1) * DAY_MS).toISOString().slice(0, 10);
  const day = at.slice(0, 10);

  const days = Object.fromEntries(
    Object.entries(history?.days ?? {}).filter(([date]) => date >= oldest),
  );
  const today = (days[day] ??= {});
  for (const [id, result] of Object.entries(results)) {
    if (result.status === "unknown") continue;
    const counts = (today[id] ??= { up: 0, degraded: 0, down: 0 });
    counts[result.status] += 1;
  }

  const incidents = (history?.incidents ?? []).filter(
    (incident) => !incident.end || incident.end.slice(0, 10) >= oldest,
  );
  for (const [id, result] of Object.entries(results)) {
    const open = incidents.find((incident) => incident.component === id && !incident.end);
    if (result.status === "down" && !open) {
      incidents.push({ component: id, start: at, end: null });
    } else if ((result.status === "up" || result.status === "degraded") && open) {
      open.end = at;
    }
  }

  return {
    version: 1,
    updatedAt: at,
    everyMinutes: 5,
    components: COMPONENTS,
    latest: { at, results },
    recent: [...(history?.recent ?? []), { at, results }].filter(
      (round) => now - Date.parse(round.at) <= RECENT_MS,
    ),
    days,
    incidents,
  };
}

const file = process.argv[2] ?? "status.json";
const history = await readFile(file, "utf8")
  .then((text) => JSON.parse(text))
  .catch(() => null);

let results = await probe();
if (Object.values(results).some((result) => result.status === "down")) {
  await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  const again = await probe();
  // Down only when it failed both times.
  for (const [id, result] of Object.entries(results)) {
    if (result.status === "down") results[id] = again[id];
  }
}

const at = new Date().toISOString();
await writeFile(file, `${JSON.stringify(fold(history, at, results))}\n`);
console.log(
  `${at} ${Object.entries(results)
    .map(([id, result]) => `${id}=${result.status}${result.ms === undefined ? "" : `(${result.ms}ms)`}`)
    .join(" ")}`,
);
