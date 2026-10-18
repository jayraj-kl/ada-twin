import type { FactoryGraph, StationNode } from "./graph";

export interface Capacity {
  /** Units the plant can finish in the shift, set by its bottleneck. */
  perShift: number;
  /** The station that sets it. */
  bottleneck: string;
  /**
   * Units in the plant at that pace if nothing ever queued (Little's law over
   * the stations' cycle times); real work in progress runs above it.
   */
  minimumWip: number;
}

/**
 * What the plant can make in a shift of `hours`, worked out from the graph
 * alone: each station's units, cycle time and uptime (MTBF over MTBF + MTTR),
 * divided by the share of all work that reaches it. Undefined when no work
 * reaches a station, as in a plant with no flow drawn yet.
 */
export function shiftCapacity(
  graph: FactoryGraph,
  hours: number,
): Capacity | undefined {
  const seconds = hours * 3600;
  const outgoing = new Map<string, { to: string; share: number }[]>();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from)!.push({ to: edge.to, share: edge.share ?? 1 });
  }

  // The share of all released work that passes each node, split at forks as
  // the kernel routes it. Loops are cut off after a bounded number of passes.
  const reach = new Map<string, number>();
  const sources = graph.nodes.filter((node) => node.kind === "source");
  let frontier = new Map<string, number>(
    sources.map((source) => [source.id, 1 / sources.length]),
  );
  for (let pass = 0; pass < graph.nodes.length + 1 && frontier.size; pass++) {
    const next = new Map<string, number>();
    for (const [id, amount] of frontier) {
      reach.set(id, (reach.get(id) ?? 0) + amount);
      const routes = outgoing.get(id) ?? [];
      const total = routes.reduce((sum, route) => sum + route.share, 0);
      for (const route of routes) {
        if (total <= 0) continue;
        next.set(route.to, (next.get(route.to) ?? 0) + (amount * route.share) / total);
      }
    }
    frontier = next;
  }

  let best: Capacity | undefined;
  let flowSeconds = 0;
  for (const node of graph.nodes) {
    if (node.kind !== "station") continue;
    const share = reach.get(node.id) ?? 0;
    if (share <= 0) continue;
    const station = node as StationNode;
    const cycle = station.cycleTime.value;
    if (!(cycle > 0)) continue;
    flowSeconds += share * cycle;
    const mtbf = station.mtbf?.value;
    const mttr = station.mttr?.value;
    const uptime = mtbf && mttr && mtbf > 0 ? mtbf / (mtbf + mttr) : 1;
    const perShift =
      (Math.max(1, station.units.value) * seconds * uptime) / cycle / share;
    if (!best || perShift < best.perShift) {
      best = { perShift, bottleneck: station.id, minimumWip: 0 };
    }
  }
  if (!best) return undefined;
  best.minimumWip = (best.perShift / seconds) * flowSeconds;
  return best;
}
