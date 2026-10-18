import { useEffect, useSyncExternalStore } from "react";
import {
  type ProjectWorld,
  getProjectWorld,
  projectWorldDir,
  resetProjectWorld,
  startProjectWorld,
} from "./api";
import { WORLD_DIR } from "./project";

// World Labs takes about five minutes; asking more often than this only
// costs requests.
const POLL_MS = 15_000;

interface Entry {
  /** Undefined until the first answer; null while the demo world is used. */
  world: ProjectWorld | null | undefined;
  timer?: ReturnType<typeof setTimeout>;
  watchers: number;
}

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

function entry(projectId: string) {
  let found = entries.get(projectId);
  if (!found) {
    found = { world: undefined, watchers: 0 };
    entries.set(projectId, found);
  }
  return found;
}

/** Asks the API for the world, and again later while it is being built. */
async function refresh(projectId: string) {
  const found = entry(projectId);
  clearTimeout(found.timer);
  try {
    found.world = await getProjectWorld(projectId);
  } catch {
    // Unreachable: keep what was known (or the demo world) and try again.
    found.world ??= null;
  }
  changed();
  if (found.world?.status === "generating" && found.watchers > 0) {
    found.timer = setTimeout(() => void refresh(projectId), POLL_MS);
  }
}

export async function startWorld(projectId: string, documentId: string) {
  const found = entry(projectId);
  found.world = await startProjectWorld(projectId, documentId);
  changed();
  clearTimeout(found.timer);
  found.timer = setTimeout(() => void refresh(projectId), POLL_MS);
}

export async function switchToDemoWorld(projectId: string) {
  await resetProjectWorld(projectId);
  const found = entry(projectId);
  clearTimeout(found.timer);
  found.world = null;
  changed();
}

/**
 * The project's 3D world: its own once World Labs has built it, otherwise
 * the bundled demo world. `worldDir` and `panoramaUrl` point at whichever is
 * in use; while a world is being built the demo stays in use.
 */
export function useProjectWorld(projectId: string) {
  useEffect(() => {
    const found = entry(projectId);
    found.watchers += 1;
    void refresh(projectId);
    return () => {
      found.watchers -= 1;
      if (found.watchers === 0) clearTimeout(found.timer);
    };
  }, [projectId]);
  const world = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entries.get(projectId)?.world,
  );
  const own = world?.status === "ready";
  const worldDir = own ? projectWorldDir(projectId) : WORLD_DIR;
  return {
    world,
    own,
    worldDir,
    // Absolute, since the API fetches it to find machines in the photo.
    panoramaUrl: own
      ? `${worldDir}/pano.png`
      : `${window.location.origin}${WORLD_DIR}/pano.png`,
  };
}
