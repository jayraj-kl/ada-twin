import type { FactoryGraph, Param, Provenance } from "./graph";

/** The numbers of a machine the plant does not have yet. */
export interface NewMachineParams {
  /** Mean seconds of running between failures; omit for one that never fails. */
  mtbf?: number;
  /** Mean seconds to repair once a crew starts. */
  mttr?: number;
  /** Where the numbers came from: researched estimates, usually. */
  provenance?: Provenance;
}

/** One concrete change to a factory, as a report recommendation proposes it. */
export type GraphDiff =
  | { type: "add-units"; station: string; count: number }
  | { type: "resize-buffer"; buffer: string; capacity: number }
  /** Standby units for support equipment, which cover for a unit that is down. */
  | { type: "add-spare"; support: string; count: number }
  /** A new buffer on the link from `from` to `to`, which it splits in two. */
  | {
      type: "insert-buffer";
      id: string;
      name: string;
      from: string;
      to: string;
      capacity: number;
    }
  /** A new kind of machine on the link from `from` to `to`, which it splits in two. */
  | ({
      type: "insert-station";
      id: string;
      name: string;
      from: string;
      to: string;
      units: number;
      /** Mean seconds to process one part. */
      cycleTime: number;
      cycleTimeVariation?: number;
      /** Share of finished parts scrapped, 0..1. */
      scrapRate?: number;
    } & NewMachineParams)
  /**
   * New support equipment, such as a water softener: parts never pass it,
   * and the stations and sources in `neededBy` stop while it is down. It
   * pays off only through the changes it comes with, such as fewer boiler
   * failures.
   */
  | ({
      type: "add-support";
      id: string;
      name: string;
      units: number;
      neededBy: string[];
    } & NewMachineParams)
  | {
      type: "set-param";
      node: string;
      param:
        | "cycleTime"
        | "cycleTimeVariation"
        | "mtbf"
        | "mttr"
        | "scrapRate"
        | "interArrival";
      value: number;
    };

/** Returns a changed copy; the graph passed in is left untouched. */
export function applyDiffs(
  graph: FactoryGraph,
  diffs: GraphDiff[],
): FactoryGraph {
  const next = structuredClone(graph);
  const find = (id: string) => {
    const node = next.nodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`No node "${id}" in the graph`);
    return node;
  };
  const set = (current: Param | undefined, value: number, unit: string) => ({
    value,
    unit: current?.unit ?? unit,
    // A proposed value is a decision, not something read from a document.
    provenance: { kind: "user" as const },
  });

  const fresh = (id: string) => {
    if (next.nodes.some((node) => node.id === id)) {
      throw new Error(`There is already a node "${id}"`);
    }
  };
  // New equipment's numbers keep where they came from; they are estimates,
  // not the user's decisions.
  const estimate = (
    value: number | undefined,
    unit: string,
    provenance: Provenance = { kind: "assumed" },
  ) => (value === undefined ? undefined : { value, unit, provenance });

  for (const diff of diffs) {
    if (diff.type === "insert-station") {
      fresh(diff.id);
      const link = next.edges.findIndex(
        ({ from, to }) => from === diff.from && to === diff.to,
      );
      if (link < 0) {
        throw new Error(`No link from "${diff.from}" to "${diff.to}"`);
      }
      if (!(diff.cycleTime > 0) || !(diff.units >= 1)) {
        throw new Error(
          `"${diff.name}" needs a cycle time and at least one unit`,
        );
      }
      const { share } = next.edges[link]!;
      next.nodes.push({
        id: diff.id,
        kind: "station",
        name: diff.name,
        units: set(undefined, diff.units, "units"),
        cycleTime: estimate(diff.cycleTime, "s", diff.provenance)!,
        cycleTimeVariation: estimate(
          diff.cycleTimeVariation,
          "share",
          diff.provenance,
        ),
        mtbf: estimate(diff.mtbf, "s", diff.provenance),
        mttr: estimate(diff.mttr, "s", diff.provenance),
        scrapRate: estimate(diff.scrapRate, "share", diff.provenance),
      });
      next.edges.splice(
        link,
        1,
        {
          from: diff.from,
          to: diff.id,
          ...(share === undefined ? {} : { share }),
        },
        { from: diff.id, to: diff.to },
      );
    } else if (diff.type === "add-support") {
      fresh(diff.id);
      if (!(diff.units >= 1)) {
        throw new Error(`"${diff.name}" needs at least one unit`);
      }
      for (const id of diff.neededBy) {
        const node = find(id);
        if (node.kind !== "station" && node.kind !== "source") {
          throw new Error(`"${id}" cannot need support equipment`);
        }
      }
      next.nodes.push({
        id: diff.id,
        kind: "support",
        name: diff.name,
        units: set(undefined, diff.units, "units"),
        mtbf: estimate(diff.mtbf, "s", diff.provenance),
        mttr: estimate(diff.mttr, "s", diff.provenance),
      });
      next.dependencies = [
        ...(next.dependencies ?? []),
        ...diff.neededBy.map((neededBy) => ({ support: diff.id, neededBy })),
      ];
    } else if (diff.type === "add-units") {
      const node = find(diff.station);
      if (node.kind !== "station") {
        throw new Error(`"${diff.station}" is not a station`);
      }
      node.units = set(node.units, node.units.value + diff.count, "units");
    } else if (diff.type === "add-spare") {
      const node = find(diff.support);
      if (node.kind !== "support") {
        throw new Error(`"${diff.support}" is not support equipment`);
      }
      node.units = set(node.units, node.units.value + diff.count, "units");
      node.spares = set(
        node.spares,
        (node.spares?.value ?? 0) + diff.count,
        "units",
      );
    } else if (diff.type === "insert-buffer") {
      if (next.nodes.some(({ id }) => id === diff.id)) {
        throw new Error(`There is already a node "${diff.id}"`);
      }
      const link = next.edges.findIndex(
        ({ from, to }) => from === diff.from && to === diff.to,
      );
      if (link < 0) {
        throw new Error(`No link from "${diff.from}" to "${diff.to}"`);
      }
      const { share } = next.edges[link]!;
      next.nodes.push({
        id: diff.id,
        kind: "buffer",
        name: diff.name,
        capacity: set(undefined, diff.capacity, "parts"),
      });
      next.edges.splice(
        link,
        1,
        {
          from: diff.from,
          to: diff.id,
          ...(share === undefined ? {} : { share }),
        },
        { from: diff.id, to: diff.to },
      );
    } else if (diff.type === "resize-buffer") {
      const node = find(diff.buffer);
      if (node.kind !== "buffer") {
        throw new Error(`"${diff.buffer}" is not a buffer`);
      }
      node.capacity = set(node.capacity, diff.capacity, "parts");
    } else {
      const node = find(diff.node);
      const fits =
        diff.param === "interArrival"
          ? node.kind === "source"
          : node.kind === "station" ||
            (node.kind === "support" &&
              (diff.param === "mtbf" || diff.param === "mttr"));
      if (!fits) {
        throw new Error(`"${diff.node}" has no ${diff.param}`);
      }
      const params = node as unknown as Record<string, Param | undefined>;
      params[diff.param] = set(
        params[diff.param],
        diff.value,
        diff.param === "scrapRate" || diff.param === "cycleTimeVariation"
          ? "share"
          : "s",
      );
    }
  }
  return next;
}
