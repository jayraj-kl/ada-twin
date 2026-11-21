import type { Baseline, CostRateKey, DocumentKind, Param } from "@repo/sim";
import type { StoredRates } from "@/results/cost";
import type { Sample } from "./sample";
import type { KeptDocument, SavedMachine, StationParamKey } from "./project";
import { uploadDocument } from "./api";

import { t } from "@/lib/i18n";
// A demo world ships a pack of documents under /worlds/<slug>/docs: the plant's
// own (fictional) records and datasheets, and reference sheets of published
// figures. Opening the sample keeps them with the new project like any upload,
// and its machines open with the figures an agent read from them, each citing
// the passage it came from. docs/specs/demo-document-packs.md has the design.

/** Kept with the project once its pack is attached: which world, which files. */
export const DEMO_PACK_KEY = "twin-demo-pack";

export interface PackDocument {
  file: string;
  /** The machine it belongs to; none for the plant overview. */
  machine?: string;
  title: string;
  kind: DocumentKind;
  /** Made up for the fictional demo plant, as opposed to published figures. */
  demo: boolean;
  /** The plant's cost sheet, which the cost rates are read from. */
  costs?: boolean;
}

export interface PackManifest {
  world: string;
  title: string;
  plant: string;
  documents: PackDocument[];
}

/** The pack as kept with a project: each document with its stored id. */
export interface AttachedPack {
  world: string;
  plant: string;
  documents: (PackDocument & { id: string })[];
}

interface RecordedFigures {
  model: string;
  recordedAt: string;
  machines: Record<
    string,
    {
      params: Partial<Record<StationParamKey, Param>>;
      baselines: Partial<Record<StationParamKey, Baseline>>;
    }
  >;
  /** The plant's cost rates in rupees, read from its cost sheet. */
  costs?: Partial<
    Record<
      CostRateKey,
      { value: number; document: string; page?: number; quote: string }
    >
  >;
}

/** A world's cost rates as kept with a project, each citing its passage. */
export function recordedRates(slug: string): StoredRates | undefined {
  const costs = recordedFigures(slug)?.costs;
  if (!costs) return undefined;
  return Object.fromEntries(
    Object.entries(costs).map(([key, { value, document, page, quote }]) => [
      key,
      { value, source: { kind: "doc", document, page, quote } },
    ]),
  ) as StoredRates;
}

const RECORDED = import.meta.glob<RecordedFigures>("./sample-figures/*.json", {
  eager: true,
  import: "default",
});

/** The figures an agent read from a world's pack, when it has one. */
export function recordedFigures(slug: string): RecordedFigures | undefined {
  return RECORDED[`./sample-figures/${slug}.json`];
}

/** A sample's machines with the figures its pack supplies. */
export function withRecordedFigures(
  slug: string,
  machines: SavedMachine[],
): SavedMachine[] {
  const recorded = recordedFigures(slug);
  if (!recorded) return machines;
  return machines.map((machine) => {
    const figures = recorded.machines[machine.id];
    return figures
      ? {
          ...machine,
          params: { ...figures.params, ...machine.params },
          baselines: { ...figures.baselines, ...machine.baselines },
        }
      : machine;
  });
}

export const LABEL: Record<DocumentKind, string> = {
  overview: t("Overview"),
  "plant-record": t("Plant record"),
  datasheet: t("Datasheet"),
  reference: t("Reference"),
};

/** What a user can say an upload of theirs is. */
export const DOCUMENT_KIND_OPTIONS = (
  ["plant-record", "datasheet", "reference"] as const
).map((kind) => [kind, LABEL[kind]] as const);

/** A world's pack manifest, or null when the world ships none. */
export async function loadPack(sample: Sample): Promise<PackManifest | null> {
  const response = await fetch(`${sample.dir}/docs/pack.json`).catch(
    () => null,
  );
  if (!response?.ok) return null;
  return (await response.json().catch(() => null)) as PackManifest | null;
}

/**
 * Keeps a world's pack with a project, as uploads under each machine, and
 * gives each machine its kept documents. The figures themselves are seeded
 * with the project (`withRecordedFigures`); the documents back them up.
 */
export async function attachPack(
  projectId: string,
  sample: Sample,
  manifest: PackManifest,
  machines: SavedMachine[],
): Promise<{ pack: AttachedPack; machines: SavedMachine[] }> {
  const documents = await Promise.all(
    manifest.documents.map(async (document) => {
      const response = await fetch(`${sample.dir}/docs/${document.file}`);
      if (!response.ok)
        throw new Error(t("{0} is missing", { 0: document.file }));
      const file = new File([await response.blob()], document.file, {
        type: "application/pdf",
      });
      const stored = await uploadDocument(projectId, file, {
        kind: "document",
        machineId: document.machine,
        label: document.title,
      });
      return { ...document, id: stored.id };
    }),
  );
  const keptFor = (id: string): KeptDocument[] =>
    documents
      .filter(({ machine }) => machine === id)
      .map(({ id: documentId, file, kind, demo, title }) => ({
        id: documentId,
        name: file,
        kind,
        demo,
        title,
      }));
  return {
    pack: { world: manifest.world, plant: manifest.plant, documents },
    machines: machines.map((machine) => {
      const kept = keptFor(machine.id);
      const known = new Set((machine.kept ?? []).map(({ name }) => name));
      return kept.length > 0
        ? {
            ...machine,
            kept: [
              ...(machine.kept ?? []),
              ...kept.filter(({ name }) => !known.has(name)),
            ],
          }
        : machine;
    }),
  };
}
