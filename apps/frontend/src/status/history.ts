/**
 * What the status page shows, and the history it draws: status.json, which
 * .github/status/check.mjs records every five minutes on the status-data
 * branch.
 */

export type ComponentId = "web" | "api" | "database" | "storage";

export const COMPONENTS: { id: ComponentId; name: string; description: string }[] = [
  { id: "web", name: "Website", description: "ada-twin.web.app" },
  { id: "api", name: "API", description: "Projects, digital twins, shift runs and the agents" },
  { id: "database", name: "Database", description: "Saved projects and runs" },
  { id: "storage", name: "File storage", description: "Drawings, run logs and uploads" },
];

export type CheckStatus = "up" | "degraded" | "down" | "unknown";

export interface CheckResult {
  status: CheckStatus;
  ms?: number;
}

export type Results = Record<ComponentId, CheckResult>;

export interface DayCounts {
  up: number;
  degraded: number;
  down: number;
}

export interface History {
  version: 1;
  updatedAt: string;
  everyMinutes: number;
  latest: { at: string; results: Results };
  /** Every round of the last 24 hours. */
  recent: { at: string; results: Results }[];
  /** Rounds per UTC day, for the last 90 days. */
  days: Record<string, Partial<Record<ComponentId, DayCounts>>>;
  /** A component down from start until end; open while end is null. */
  incidents: { component: ComponentId; start: string; end: string | null }[];
}

const HISTORY_URL =
  import.meta.env.VITE_STATUS_HISTORY_URL ??
  "https://raw.githubusercontent.com/jayraj-kl/ada-twin/status-data/status.json";

/** The recorded history, or null before the checker has first run. */
export async function fetchHistory(): Promise<History | null> {
  // GitHub serves the file through a cache of about five minutes.
  const response = await fetch(`${HISTORY_URL}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`The history answered HTTP ${response.status}`);
  return (await response.json()) as History;
}
