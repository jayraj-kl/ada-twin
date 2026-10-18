import { useSyncExternalStore } from "react";
import { API } from "./models";
import { ServerError, server } from "./server";

/**
 * The project fields saved on the server, by the name pages store them under
 * (the `*_KEY` constants in twin/flow.ts and twin/project.ts). They are the
 * project's own columns; STATE_KEYS are saved beside them as page state, and
 * any other key (such as whether a drawer is open) stays in this browser.
 */
export const SERVER_KEYS = {
  "twin-process": "process",
  "twin-machines": "machines",
  "twin-flow": "flow",
  "twin-scenario": "scenario",
  "twin-agents": "crew",
  "twin-accepted": "accepted",
} as const;
export type ServerField = (typeof SERVER_KEYS)[keyof typeof SERVER_KEYS];

/** Page state saved with the project, by the same storage names. */
export const STATE_KEYS = new Set([
  "twin-flow-chat",
  "twin-scenario-chat",
  "twin-design-chat",
  "twin-plant-chat",
  "twin-redesign-history",
  "twin-costs",
  "twin-cost-currency",
  "twin-applied",
  "twin-scouted",
  "twin-days",
  "twin-plant-count",
]);

/** A project as the API answers it. */
export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  reached: number;
  sample: boolean;
  origin?: string;
}

export type LoadStatus = "loading" | "ready" | "missing" | "failed";
export type SaveStatus = "saved" | "saving" | "failed";

// Changes are sent this long after the last one, so typing is one request.
const SAVE_DELAY_MS = 800;
const RETRY_FIRST_MS = 2000;
const RETRY_MOST_MS = 30_000;
// Browsers refuse keepalive requests with larger bodies.
const KEEPALIVE_MAX_BYTES = 60_000;

interface Entry {
  load: LoadStatus;
  save: SaveStatus;
  summary?: ProjectSummary;
  fields: Partial<Record<ServerField, unknown>>;
  state: Record<string, unknown>;
  /** Changed since the last save that went through. */
  pending: Partial<Record<ServerField, unknown>>;
  pendingState: Record<string, unknown>;
  timer?: ReturnType<typeof setTimeout>;
  retryMs: number;
  saving?: Promise<void>;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const summaryListeners = new Set<(summary: ProjectSummary) => void>();

function entry(id: string): Entry {
  let found = entries.get(id);
  if (!found) {
    found = {
      load: "loading",
      save: "saved",
      fields: {},
      state: {},
      pending: {},
      pendingState: {},
      retryMs: RETRY_FIRST_MS,
    };
    entries.set(id, found);
  }
  return found;
}

function changed() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls `listener` whenever the server answers a project's summary. */
export function onSummary(listener: (summary: ProjectSummary) => void) {
  summaryListeners.add(listener);
  return () => summaryListeners.delete(listener);
}

const loading = new Map<string, Promise<void>>();

/** Loads a project from the server once; later calls reuse it. */
export function loadProject(id: string): Promise<void> {
  const found = entry(id);
  if (found.load === "ready") return Promise.resolve();
  let pending = loading.get(id);
  if (!pending) {
    found.load = "loading";
    pending = server<{
      project: ProjectSummary;
      fields: Record<ServerField, unknown>;
      state: Record<string, unknown>;
    }>(`/projects/${id}`)
      .then(({ project, fields, state }) => {
        found.summary = project;
        // Anything changed before the load answered wins over what it brought.
        found.fields = { ...fields, ...found.pending };
        found.state = { ...state, ...found.pendingState };
        found.load = "ready";
        for (const listener of summaryListeners) listener(project);
      })
      .catch((error: unknown) => {
        found.load =
          error instanceof ServerError && error.status === 404
            ? "missing"
            : "failed";
      })
      .finally(() => {
        loading.delete(id);
        changed();
      });
    loading.set(id, pending);
  }
  return pending;
}

/** Forgets a project, as after it is deleted. */
export function forgetProject(id: string) {
  const found = entries.get(id);
  if (found?.timer) clearTimeout(found.timer);
  entries.delete(id);
  for (const listener of listeners) listener();
}

export function getField(id: string, field: ServerField): unknown {
  return entries.get(id)?.fields[field];
}

/** Changes a field now and saves it to the server shortly after. */
export function setField(id: string, field: ServerField, value: unknown) {
  const found = entry(id);
  // Pages save what they loaded as they settle; that is not a change.
  if (JSON.stringify(found.fields[field]) === JSON.stringify(value)) return;
  found.fields = { ...found.fields, [field]: value };
  found.pending = { ...found.pending, [field]: value };
  found.save = "saving";
  schedule(id, found, SAVE_DELAY_MS);
  changed();
}

export function getState(id: string, key: string): unknown {
  return entries.get(id)?.state[key];
}

/** Changes a page-state value now and saves it with the project shortly after. */
export function setState(id: string, key: string, value: unknown) {
  const found = entry(id);
  if (JSON.stringify(found.state[key]) === JSON.stringify(value)) return;
  found.state = { ...found.state, [key]: value };
  found.pendingState = { ...found.pendingState, [key]: value };
  found.save = "saving";
  schedule(id, found, SAVE_DELAY_MS);
  changed();
}

const hasPending = (found: Entry) =>
  Object.keys(found.pending).length > 0 ||
  Object.keys(found.pendingState).length > 0;

function schedule(id: string, found: Entry, delay: number) {
  if (found.timer) clearTimeout(found.timer);
  found.timer = setTimeout(() => void flush(id), delay);
}

/** Sends what changed now; `keepalive` lets it finish as the page closes. */
export async function flush(id: string, keepalive = false): Promise<void> {
  const found = entries.get(id);
  if (!found || !hasPending(found)) return;
  if (found.timer) clearTimeout(found.timer);
  found.timer = undefined;
  // One save at a time, so they reach the server in order.
  if (found.saving) {
    await found.saving;
    return flush(id, keepalive);
  }
  const sending = found.pending;
  const sendingState = found.pendingState;
  found.pending = {};
  found.pendingState = {};
  const body = JSON.stringify(
    Object.keys(sendingState).length > 0
      ? { ...sending, state: sendingState }
      : sending,
  );
  found.saving = fetch(`${API}/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: keepalive && body.length < KEEPALIVE_MAX_BYTES,
  })
    .then(async (response) => {
      if (!response.ok) {
        const answer = await response.json().catch(() => null);
        throw new ServerError(
          answer?.error ?? `The API answered HTTP ${response.status}`,
          response.status,
        );
      }
      const { updatedAt } = (await response.json()) as { updatedAt: number };
      found.retryMs = RETRY_FIRST_MS;
      if (found.summary) {
        found.summary = { ...found.summary, updatedAt };
        for (const listener of summaryListeners) listener(found.summary);
      }
      found.save = hasPending(found) ? "saving" : "saved";
    })
    .catch(() => {
      // Put it back under anything changed since, and try again later.
      found.pending = { ...sending, ...found.pending };
      found.pendingState = { ...sendingState, ...found.pendingState };
      found.save = "failed";
      schedule(id, found, found.retryMs);
      found.retryMs = Math.min(found.retryMs * 2, RETRY_MOST_MS);
    })
    .finally(() => {
      found.saving = undefined;
      changed();
    });
  return found.saving;
}

// Whatever is still waiting goes out as the tab is hidden or closed.
if (typeof window !== "undefined") {
  const flushAll = () => {
    for (const id of entries.keys()) void flush(id, true);
  };
  window.addEventListener("pagehide", flushAll);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
}

/** How far a project has loaded. */
export function useLoadStatus(id: string): LoadStatus {
  return useSyncExternalStore(subscribe, () => entries.get(id)?.load ?? "loading");
}

/** Whether a project's changes have reached the server. */
export function useSaveStatus(id: string): SaveStatus {
  return useSyncExternalStore(subscribe, () => entries.get(id)?.save ?? "saved");
}

/** A field of a loaded project, re-rendering when it changes. */
export function useField(id: string, field: ServerField | null): unknown {
  return useSyncExternalStore(subscribe, () =>
    field === null ? undefined : entries.get(id)?.fields[field],
  );
}

/** A page-state value of a loaded project, re-rendering when it changes. */
export function useStateValue(id: string, key: string | null): unknown {
  return useSyncExternalStore(subscribe, () =>
    key === null ? undefined : entries.get(id)?.state[key],
  );
}
