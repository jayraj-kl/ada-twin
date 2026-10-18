import { createContext, useContext, useSyncExternalStore } from "react";
import {
  type ProjectSummary,
  SERVER_KEYS,
  forgetProject,
  onSummary,
} from "./project-store";
import { server } from "./server";
import { readJson, removeKey, writeJson } from "./storage";

// Projects are saved on the server and anonymous: this browser keeps the ids
// of its own projects, with their names and times as last seen, so the list
// shows at once and then refreshes. Projects from before the server, under
// the old "ada-twin:projects" key, are no longer listed; their data is left
// where it is.
const LIST_KEY = "ada-twin:server-projects";

export const STEPS = [
  { slug: "capture", label: "Capture", blurb: "Upload 360° panoramas of your floor" },
  { slug: "twin", label: "Twin", blurb: "List machines and draw the material flow" },
  { slug: "scenario", label: "Scenario", blurb: "Set the conditions to test against" },
  { slug: "agents", label: "Agents", blurb: "Put a crew of AI agents on the floor" },
  {
    slug: "results",
    label: "Results",
    blurb: "Run the shift, see what to fix, and redesign the plant",
  },
  {
    slug: "plant",
    label: "New plant",
    blurb: "The applied changes, most critical first, drawn into your photos",
  },
] as const;

export type StepSlug = (typeof STEPS)[number]["slug"];

export function stepIndex(slug: StepSlug) {
  return STEPS.findIndex((step) => step.slug === slug);
}

export type Project = ProjectSummary;

const listeners = new Set<() => void>();
let cached: Project[] | undefined;

function read(): Project[] {
  if (cached === undefined) cached = readJson<Project[]>(LIST_KEY) ?? [];
  return cached;
}

function write(next: Project[]) {
  cached = next;
  writeJson(LIST_KEY, next);
  for (const listener of listeners) listener();
}

/** Adds a project to this browser's list, or updates what it shows. */
function remember(project: Project) {
  const projects = read();
  write(
    projects.some(({ id }) => id === project.id)
      ? projects.map((known) => (known.id === project.id ? project : known))
      : [project, ...projects],
  );
}

// A project opened from a link joins the list; a save moves its time on.
onSummary(remember);

let refreshing: Promise<void> | undefined;

/** Asks the server for the listed projects, dropping any it does not know. */
export function refreshProjects(): Promise<void> {
  refreshing ??= server<{ projects: Project[] }>(
    `/projects?ids=${read()
      .map(({ id }) => id)
      .join(",")}`,
  )
    .then(({ projects }) => write(projects))
    .catch(() => {
      // Offline or no database: keep showing the list as last seen.
    })
    .finally(() => {
      refreshing = undefined;
    });
  return refreshing;
}

export function useProjects() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    if (listeners.size === 1) void refreshProjects();
    return () => listeners.delete(listener);
  }, read);
}

export function getProject(id: string) {
  return read().find((project) => project.id === id) ?? null;
}

/** The server fields for page values given by their storage names. */
function seedFields(seed: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(seed).flatMap(([key, value]) => {
      const field = SERVER_KEYS[key as keyof typeof SERVER_KEYS];
      return field ? [[field, value]] : [];
    }),
  );
}

export async function createProject(
  name: string,
  extra?: Pick<Project, "sample" | "origin"> & {
    seed?: Record<string, unknown>;
  },
): Promise<Project> {
  const { project } = await server<{ project: Project }>("/projects", {
    method: "POST",
    body: {
      name,
      sample: extra?.sample,
      origin: extra?.origin,
      seed: extra?.seed && seedFields(extra.seed),
    },
  });
  remember(project);
  return project;
}

/** Changes a project's listing at once, and on the server behind it. */
function change(id: string, patch: Partial<Pick<Project, "name" | "reached">>) {
  const project = getProject(id);
  if (project) remember({ ...project, ...patch, updatedAt: Date.now() });
  void server(`/projects/${id}`, { method: "PATCH", body: patch }).catch(() => {
    // The next refresh shows what the server kept.
  });
}

export function renameProject(id: string, name: string) {
  change(id, { name });
}

/** Notes that the project was opened at a step, moving its progress on. */
export function visitStep(id: string, slug: StepSlug) {
  const index = stepIndex(slug);
  const project = getProject(id);
  if (!project || project.reached >= index) return;
  change(id, { reached: index });
}

/** Takes a project off this browser's list, as when the server lost it. */
export function dropProject(id: string) {
  write(read().filter((project) => project.id !== id));
}

export function deleteProject(id: string) {
  dropProject(id);
  forgetProject(id);
  void server(`/projects/${id}`, { method: "DELETE" }).catch(() => {
    // Already gone, or unreachable: it is off the list either way.
  });
  // What this browser kept for it: page state not on the server yet.
  try {
    const prefix = projectKey(id, "");
    const doomed: string[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) doomed.push(key);
    }
    doomed.forEach(removeKey);
  } catch {
    // Leftover entries only cost space.
  }
}

/** Where one project keeps one of its values in this browser. */
export function projectKey(id: string, key: string) {
  return `ada-twin:project:${id}:${key}`;
}

/**
 * A sample's project, made on first use from the sample's files and reused
 * after; each sample plant has its own, known by its name. Like any project,
 * it is saved on the server.
 */
export async function openSampleProject(
  name: string,
  origin: string | undefined,
  seed: Record<string, unknown>,
): Promise<Project> {
  const existing = read().find(
    (project) => project.sample && project.name === name,
  );
  if (existing) {
    if (existing.origin !== origin) {
      remember({ ...existing, origin });
      void server(`/projects/${existing.id}`, {
        method: "PATCH",
        body: { origin: origin ?? null },
      }).catch(() => undefined);
    }
    return existing;
  }
  return createProject(name, { sample: true, origin, seed });
}

export const ProjectContext = createContext<string | null>(null);

export function useProjectId() {
  const id = useContext(ProjectContext);
  if (!id) throw new Error("useProjectId is used outside a project");
  return id;
}

/** A path inside the current project. */
export function useProjectPath() {
  const id = useProjectId();
  return (slug: StepSlug) => `/p/${id}/${slug}`;
}

export function timeAgo(then: number) {
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
  ];
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let chosen = units[0]!;
  for (const unit of units) if (seconds >= unit[0]) chosen = unit;
  return format.format(-Math.round(seconds / chosen[0]), chosen[1] as Intl.RelativeTimeFormatUnit);
}
