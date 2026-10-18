import { useEffect, useState, useSyncExternalStore } from "react";
import { readJson, writeJson } from "./storage";

export const API = import.meta.env.VITE_API_URL!;

// The picked models apply to every project in this browser.
const KEY = "ada-twin:models";

/** The models picked for text and for images; unset means the API's default. */
export interface ModelChoice {
  text?: string;
  image?: string;
}

export interface ModelOption {
  id: string;
  label: string;
  note: string;
  badge?: string;
}

export interface ModelCatalog {
  text: { default: string; options: ModelOption[] };
  image: {
    default: string;
    options: (ModelOption & { pricePerImage: number })[];
  };
}

const listeners = new Set<() => void>();
let cached: ModelChoice | undefined;

function read(): ModelChoice {
  cached ??= readJson<ModelChoice>(KEY) ?? {};
  return cached;
}

export function pickModel(kind: keyof ModelChoice, id: string | undefined) {
  cached = { ...read(), [kind]: id };
  writeJson(KEY, cached);
  for (const listener of listeners) listener();
}

export function useModelChoice(): ModelChoice {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, read);
}

const CONFIRMED_KEY = "ada-twin:models-confirmed";
let confirmed: boolean | undefined;
// When the user confirmed, so the top bar can show where the picker went.
let confirmedAt = 0;

const readConfirmed = () =>
  (confirmed ??= readJson<boolean>(CONFIRMED_KEY) === true);

/** Marks the models as chosen on purpose; the prompt then gives way to the top bar. */
export function confirmModels() {
  confirmed = true;
  confirmedAt = Date.now();
  writeJson(CONFIRMED_KEY, true);
  for (const listener of listeners) listener();
}

/** Whether the user has confirmed their models in this browser. */
export function useModelsConfirmed(): boolean {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, readConfirmed);
}

/** Whether the models were confirmed a moment ago. */
export const justConfirmed = () => Date.now() - confirmedAt < 4000;

/** The headers that tell the API which models to use for a request. */
export function modelHeaders(): Record<string, string> {
  const { text, image } = read();
  return {
    ...(text ? { "X-Text-Model": text } : {}),
    ...(image ? { "X-Image-Model": image } : {}),
  };
}

// One request per page load; a failure is tried again on the next ask.
let catalog: Promise<ModelCatalog> | null = null;

export function loadModelCatalog(): Promise<ModelCatalog> {
  catalog ??= fetch(`${API}/models`)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return (await response.json()) as ModelCatalog;
    })
    .catch((error: unknown) => {
      catalog = null;
      throw error;
    });
  return catalog;
}

/** The catalog, once loaded; `retry` asks again after a failure. */
export function useModelCatalog(enabled = true) {
  const [state, setState] = useState<{
    catalog: ModelCatalog | null;
    failed: boolean;
  }>({ catalog: null, failed: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadModelCatalog().then(
      (loaded) => !cancelled && setState({ catalog: loaded, failed: false }),
      () => !cancelled && setState({ catalog: null, failed: true }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);
  return { ...state, retry: () => setAttempt((count) => count + 1) };
}

/**
 * The models that will actually be used: the pick, if the API still offers
 * it, else the API's default.
 */
export function effectiveModels(choice: ModelChoice, catalog: ModelCatalog) {
  const pick = <T extends ModelOption>(
    id: string | undefined,
    { default: fallback, options }: { default: string; options: T[] },
  ) =>
    options.find((option) => option.id === id) ??
    options.find((option) => option.id === fallback) ??
    options[0]!;
  return {
    text: pick(choice.text, catalog.text),
    image: pick(choice.image, catalog.image),
  };
}
