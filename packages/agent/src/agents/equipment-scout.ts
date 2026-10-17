import {
  type FactoryGraph,
  type GraphDiff,
  type Provenance,
  applyDiffs,
  validateGraph,
} from "@repo/sim";
import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";
import {
  type DesignChange,
  Diff,
  NEW_EQUIPMENT_LINES,
  describePlant,
  withId,
} from "./plant-designer";

const MAX_SUGGESTIONS = 3;

/** How one station or support spent the shift, as shares of its time. */
export interface DigestLine {
  id: string;
  /** Processing parts. */
  working?: number;
  /** Holding a part downstream had no room for. */
  blocked?: number;
  /** Up with nothing to do: starved of parts. */
  idle?: number;
  /** Failed, under repair or being serviced. */
  down?: number;
  /** Stopped by support equipment it needs. */
  stopped?: number;
  /** Breakdowns over the shift. */
  failures?: number;
}

/** What the run showed, boiled down to what the scout needs to read. */
export interface RunDigest {
  /** Parts shipped per shift on standard rules, averaged over the days. */
  shipped: number;
  /** The worst and best day. */
  range?: { min: number; max: number };
  days: number;
  bottleneck?: string;
  stations: DigestLine[];
  supports: DigestLine[];
  /** With agents: their decisions, and how many fell back to standard rules. */
  decisions?: { total: number; fallbacks: number };
}

export type ScoutKind = "new-station" | "new-support" | "spares";

/** New equipment, or spare parts on the shelf, that the run says would help. */
export interface ScoutedChange extends DesignChange {
  kind: ScoutKind;
  /** The problem it answers, with the run's numbers. */
  problem: string;
  /** Pages the estimates came from; empty when they are the model's own. */
  sources: { url: string; title?: string }[];
}

const Source = z.object({ url: z.string().url(), title: z.string().nullish() });

const Answer = z.object({
  suggestions: z
    .array(
      z.object({
        kind: z.enum(["new-station", "new-support", "spares"]),
        title: z.string().min(1),
        problem: z.string().min(1),
        detail: z.string().default(""),
        diffs: z.array(z.unknown()).default([]),
        sources: z.array(Source).catch([]).default([]),
      }),
    )
    .default([]),
});

const percent = (share?: number) =>
  share === undefined ? undefined : `${Math.round(share * 100)}%`;

function describeDigest(digest: RunDigest, graph: FactoryGraph): string[] {
  const name = (id: string) =>
    graph.nodes.find((node) => node.id === id)?.name ?? id;
  const line = ({ id, failures, ...shares }: DigestLine) =>
    `- "${id}" (${name(id)}): ${[
      ...Object.entries(shares).flatMap(([key, share]) =>
        share === undefined ? [] : [`${key} ${percent(share)}`],
      ),
      failures === undefined ? "" : `${failures} breakdowns`,
    ]
      .filter(Boolean)
      .join(", ")}`;
  return [
    `Over ${digest.days} simulated days on standard rules it shipped ${Math.round(digest.shipped)} parts a shift on average${digest.range ? ` (${digest.range.min} on the worst day, ${digest.range.max} on the best)` : ""}.`,
    digest.bottleneck ? `The bottleneck was "${digest.bottleneck}".` : "",
    "Where each station's time went:",
    ...digest.stations.map(line),
    ...(digest.supports.length > 0
      ? ["Support equipment:", ...digest.supports.map(line)]
      : []),
    digest.decisions
      ? `The floor agents made ${digest.decisions.total} decisions; ${digest.decisions.fallbacks} fell back to standard rules.`
      : "",
  ];
}

/** Whether a suggestion's diffs are the kind it claims to be. */
function fits(kind: ScoutKind, diffs: GraphDiff[], graph: FactoryGraph) {
  const added = diffs.filter(
    ({ type }) => type === "insert-station" || type === "add-support",
  );
  if (kind === "spares") {
    // Spares on the shelf only shorten repairs of what is already there.
    return diffs.every((diff) => {
      if (diff.type !== "set-param" || diff.param !== "mttr") return false;
      const node = graph.nodes.find(({ id }) => id === diff.node) as
        { mttr?: { value: number } } | undefined;
      return node?.mttr !== undefined && diff.value < node.mttr.value;
    });
  }
  const wanted = kind === "new-station" ? "insert-station" : "add-support";
  return (
    added.length === 1 &&
    added[0]!.type === wanted &&
    // What it improves can only be what the plant already has.
    diffs.every(
      (diff) =>
        diff.type === wanted ||
        (diff.type === "set-param" &&
          graph.nodes.some(({ id }) => id === diff.node)),
    )
  );
}

/**
 * Reads a run and suggests what the plant does not have yet: a new kind of
 * machine on the line, new support equipment, or spare parts on the shelf
 * for a machine whose repairs take long. It searches the web for realistic
 * numbers. Each suggestion is checked against the plant and dropped if it
 * does not fit; the caller still has to measure whether it helps.
 */
export async function scoutEquipment(
  ask: AskModel,
  options: {
    graph: FactoryGraph;
    digest: RunDigest;
    /** What the run aims for, in words. */
    goal?: string;
    /** Titles of changes already suggested or kept, so they are not repeated. */
    known?: string[];
  },
): Promise<{ suggestions: ScoutedChange[]; dropped: string[] }> {
  const { graph, digest, goal, known = [] } = options;
  const reply = await ask({
    task: "scout-equipment",
    search: true,
    instruction:
      "You are a plant engineer reviewing a factory's simulated shift. You look for equipment the plant does not have yet, and spare parts it should keep on the shelf, that would fix what the numbers show. You use realistic figures for real equipment and say where they come from.",
    prompt: [
      "The plant:",
      ...describePlant(graph),
      "",
      ...describeDigest(digest, graph),
      goal ? `The goal: ${goal}` : "",
      known.length > 0
        ? `Already suggested, so do not repeat: ${known.map((title) => `"${title}"`).join(", ")}.`
        : "",
      "",
      `Suggest at most ${MAX_SUGGESTIONS} things to add, the most useful first, each one of these kinds:`,
      '- "new-station": a kind of machine the plant does not have, on an existing link.',
      '- "new-support": support equipment the plant does not have.',
      '- "spares": spare parts kept on the shelf for an existing machine, so a repair no longer waits for parts. Its only diff is a set-param lowering that machine\'s mttr; estimate by how much from what usually holds repairs up for that kind of machine.',
      "Each is a list of diffs:",
      ...NEW_EQUIPMENT_LINES,
      '- {"type": "set-param", "node": id, "param": "cycleTime" | "cycleTimeVariation" | "mtbf" | "mttr" | "scrapRate", "value": number}: what the addition changes about an existing machine. Seconds for times, a share from 0 to 1 for the rest; work it out from the current value.',
      "Use only ids listed above for existing machines, and refer to new equipment by its name alone.",
      'problem names the station or support it fixes and quotes the numbers above that show it, such as "the boiler was down 18% of the shift with 6 breakdowns".',
      "Suggest nothing that does not answer a problem the numbers show; an empty list is a fine answer.",
      "",
      'Answer with JSON only: {"suggestions": [{"kind": string, "title": string, "problem": string, "detail": string, "diffs": [diff], "sources": [{"url": string, "title": string}]}]}.',
      'title is a short imperative such as "Add a water softener"; detail is one or two sentences on why it should help and what the figures assume; sources are the pages the figures came from.',
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  });

  const answer = Answer.parse(parseJsonReply(reply.text));
  const suggestions: ScoutedChange[] = [];
  const dropped: string[] = [];
  for (const [index, proposed] of answer.suggestions.entries()) {
    // Every one is checked, so one that does not fit leaves room for the next.
    if (suggestions.length === MAX_SUGGESTIONS) break;
    const sources =
      proposed.sources.length > 0 ? proposed.sources : reply.sources;
    const provenance: Provenance = sources[0]
      ? { kind: "web", url: sources[0].url, confidence: "typical" }
      : { kind: "assumed" };
    const diffs: GraphDiff[] = [];
    for (const raw of proposed.diffs) {
      const parsed = Diff.safeParse(raw);
      if (!parsed.success) continue;
      const diff = withId(parsed.data, graph, diffs);
      diffs.push(
        diff.type === "insert-station" || diff.type === "add-support"
          ? { ...diff, provenance }
          : diff,
      );
    }
    // Each is measured on its own, so each must fit the plant as it is.
    let valid = diffs.length > 0 && fits(proposed.kind, diffs, graph);
    if (valid) {
      try {
        valid = validateGraph(applyDiffs(graph, diffs)).length === 0;
      } catch {
        valid = false;
      }
    }
    if (!valid) {
      dropped.push(proposed.title);
      continue;
    }
    suggestions.push({
      id: `scout-${Date.now().toString(36)}-${index}`,
      kind: proposed.kind,
      title: proposed.title.trim(),
      problem: proposed.problem.trim(),
      detail: proposed.detail.trim(),
      diffs,
      extraCrews: 0,
      sources: sources.map(({ url, title }) => ({
        url,
        ...(title ? { title } : {}),
      })),
    });
  }
  return { suggestions, dropped };
}
