import { useSyncExternalStore } from "react";
import type { StepSlug } from "@/lib/projects";
import { readJson, writeJson } from "@/lib/storage";

// The steps whose tour has been seen, for every project in this browser.
const KEY = "ada-twin:tour-seen";

const listeners = new Set<() => void>();
let seen: StepSlug[] | undefined;
// The step whose tour is showing, or null when none is.
let open: StepSlug | null = null;

const readSeen = () => (seen ??= readJson<StepSlug[]>(KEY) ?? []);
const notify = () => {
  for (const listener of listeners) listener();
};
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const hasSeenTour = (step: StepSlug) => readSeen().includes(step);

export function startTour(step: StepSlug) {
  open = step;
  notify();
}

/**
 * Closes the tour. Once seen, it will not open on its own for that step
 * again; a page with nothing yet to point at shows it again later.
 */
export function endTour(markSeen = true) {
  if (markSeen && open && !readSeen().includes(open)) {
    seen = [...readSeen(), open];
    writeJson(KEY, seen);
  }
  open = null;
  notify();
}

export function useOpenTour(): StepSlug | null {
  return useSyncExternalStore(subscribe, () => open);
}
