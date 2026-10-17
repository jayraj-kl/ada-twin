import { createContext, useContext, useSyncExternalStore } from "react";
import { deleteImages } from "@/plant/images";
import { readJson, removeKey, writeJson } from "./storage";

// Projects live in this browser until they are stored on the server; this
// module is the one place that has to change when they are.
const LIST_KEY = "ada-twin:projects";

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

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** The furthest step reached, as an index into STEPS. */
  reached: number;
  /** A copy of the bundled sample plant, not the user's own. */
  sample?: boolean;
  /** For a sample, the project it was opened from. */
  origin?: string;
}

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

export function useProjects() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
}

export function getProject(id: string) {
  return read().find((project) => project.id === id) ?? null;
}

export function createProject(
  name: string,
  extra?: Pick<Project, "sample" | "origin">,
): Project {
  const now = Date.now();
  const project: Project = {
    id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name,
    createdAt: now,
    updatedAt: now,
    reached: 0,
    ...extra,
  };
  write([project, ...read()]);
  return project;
}

function change(id: string, update: (project: Project) => Project) {
  const projects = read();
  if (!projects.some((project) => project.id === id)) return;
  write(projects.map((project) => (project.id === id ? update(project) : project)));
}

export function renameProject(id: string, name: string) {
  change(id, (project) => ({ ...project, name, updatedAt: Date.now() }));
}

/** Notes that the project was opened at a step, moving its progress on. */
export function visitStep(id: string, slug: StepSlug) {
  const index = stepIndex(slug);
  const project = getProject(id);
  if (!project || project.reached >= index) return;
  change(id, (current) => ({ ...current, reached: index, updatedAt: Date.now() }));
}

export function touchProject(id: string) {
  change(id, (project) => ({ ...project, updatedAt: Date.now() }));
}

export function deleteProject(id: string) {
  write(read().filter((project) => project.id !== id));
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
  void deleteImages(`${id}:`).catch(() => undefined);
}

/** Where one project keeps one of its values. */
export function projectKey(id: string, key: string) {
  return `ada-twin:project:${id}:${key}`;
}

/** The one sample project, made on first use and reused after. */
export function openSampleProject(
  name: string,
  origin: string | undefined,
  seed: Record<string, unknown>,
) {
  const existing = read().find((project) => project.sample);
  if (existing) {
    if (existing.origin !== origin) change(existing.id, (project) => ({ ...project, origin }));
    return existing;
  }
  const project = createProject(name, { sample: true, origin });
  for (const [key, value] of Object.entries(seed)) {
    writeJson(projectKey(project.id, key), value);
  }
  return project;
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
