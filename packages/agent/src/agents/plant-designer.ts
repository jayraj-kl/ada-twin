import {
  type FactoryGraph,
  type GraphDiff,
  type Kpis,
  applyDiffs,
  validateGraph,
} from "@repo/sim";
import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";

/** One turn of the conversation about the redesign. */
export interface DesignMessage {
  role: "user" | "assistant";
  text: string;
}

/** A change the model proposes, in the shape the report measures. */
export interface DesignChange {
  id: string;
  title: string;
  detail: string;
  diffs: GraphDiff[];
  /** Maintenance crews added on top of the scenario's. */
  extraCrews: number;
}

export interface DesignAnswer {
  /** What was proposed, or a question back when the request was unclear. */
  reply: string;
  changes: DesignChange[];
}

const PARAMS = [
  "cycleTime",
  "cycleTimeVariation",
  "mtbf",
  "mttr",
  "scrapRate",
  "interArrival",
] as const;

const count = z.number().int().min(1).max(20);
const duration = z.number().positive();
const share = z.number().min(0).max(1);
/** A diff as the model writes it; new nodes get their ids afterwards. */
export const Diff = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("insert-station"),
    from: z.string(),
    to: z.string(),
    name: z.string().min(1),
    units: count.catch(1).default(1),
    cycleTime: duration,
    cycleTimeVariation: share.optional().catch(undefined),
    scrapRate: share.optional().catch(undefined),
    mtbf: duration.optional().catch(undefined),
    mttr: duration.optional().catch(undefined),
  }),
  z.object({
    type: z.literal("add-support"),
    name: z.string().min(1),
    units: count.catch(1).default(1),
    neededBy: z.array(z.string()).min(1),
    mtbf: duration.optional().catch(undefined),
    mttr: duration.optional().catch(undefined),
  }),
  z.object({ type: z.literal("add-units"), station: z.string(), count }),
  z.object({ type: z.literal("add-spare"), support: z.string(), count }),
  z.object({
    type: z.literal("insert-buffer"),
    from: z.string(),
    to: z.string(),
    name: z.string().min(1),
    capacity: z.number().int().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("resize-buffer"),
    buffer: z.string(),
    capacity: z.number().int().min(1).max(10_000),
  }),
  z.object({
    type: z.literal("set-param"),
    node: z.string(),
    param: z.enum(PARAMS),
    value: z.number().nonnegative(),
  }),
]);

const Answer = z.object({
  reply: z.string().default(""),
  changes: z
    .array(
      z.object({
        title: z.string().min(1),
        detail: z.string().default(""),
        diffs: z.array(z.unknown()).default([]),
        extraCrews: z.number().int().min(0).max(5).catch(0).default(0),
      }),
    )
    .default([]),
});

const seconds = (value: number) =>
  value >= 3600
    ? `${(value / 3600).toFixed(1)} h`
    : value >= 60
      ? `${Math.round(value / 60)} min`
      : `${Math.round(value)} s`;

/** The plant as lines the model can read, with each node's numbers. */
export function describePlant(graph: FactoryGraph, kpis?: Kpis): string[] {
  const time = (id: string) => {
    const station = kpis?.stations[id];
    return station
      ? `; last shift busy ${Math.round(station.utilisation * 100)}%, blocked ${Math.round(station.blocked * 100)}%, down ${Math.round(station.down * 100)}%`
      : "";
  };
  return [
    ...graph.nodes.map((node) => {
      switch (node.kind) {
        case "source":
          return `- source "${node.id}" (${node.name}): a part every ${seconds(node.interArrival.value)} (interArrival ${node.interArrival.value} s)`;
        case "sink":
          return `- sink "${node.id}" (${node.name})`;
        case "buffer":
          return `- buffer "${node.id}" (${node.name}): holds ${node.capacity.value} parts`;
        case "support":
          return `- support equipment "${node.id}" (${node.name}): ${node.units.value} units${node.spares ? `, ${node.spares.value} of them standby spares` : ""}${node.mtbf ? `, mtbf ${node.mtbf.value} s` : ""}${node.mttr ? `, mttr ${node.mttr.value} s` : ""}${kpis?.supports?.[node.id] ? `; last shift down ${Math.round(kpis.supports[node.id]!.down * 100)}%` : ""}`;
        default:
          return `- station "${node.id}" (${node.name}): ${node.units.value} units, cycleTime ${node.cycleTime.value} s${node.cycleTimeVariation ? `, cycleTimeVariation ${node.cycleTimeVariation.value}` : ""}${node.mtbf ? `, mtbf ${node.mtbf.value} s` : ""}${node.mttr ? `, mttr ${node.mttr.value} s` : ""}${node.scrapRate ? `, scrapRate ${node.scrapRate.value}` : ""}${time(node.id)}`;
      }
    }),
    "Parts move along these links:",
    ...graph.edges.map(({ from, to }) => `- "${from}" -> "${to}"`),
    ...((graph.dependencies ?? []).length > 0
      ? [
          "Support equipment and what stops when it is down:",
          ...(graph.dependencies ?? []).map(
            ({ support, neededBy }) =>
              `- "${support}" is needed by "${neededBy}"`,
          ),
        ]
      : []),
  ];
}

/**
 * Turns what the user asks for in plain words ("a spare feed pump", "a rack
 * of 20 before the boiler") into changes to the plant. Only changes the
 * simulation can make are kept: each is applied to the plant as it stands,
 * after the ones before it, and dropped if it does not fit.
 */
export async function designChanges(
  ask: AskModel,
  options: {
    /** The plant as the redesign has it so far. */
    graph: FactoryGraph;
    /** How that plant did, to judge what would help. */
    kpis?: Kpis;
    /** What the run aims for, in words. */
    goal?: string;
    messages: DesignMessage[];
  },
): Promise<DesignAnswer> {
  const { graph, kpis, goal, messages } = options;
  const request = messages.at(-1);
  if (!request || request.role !== "user" || !request.text.trim()) {
    throw new Error("The last message has to be the user's request");
  }
  const reply = await ask({
    task: "design-changes",
    instruction:
      "You help redesign a factory in its digital twin. You turn what the user asks for into concrete changes the simulation can measure. You add a kind of equipment the plant does not have only when the user asks for it, or asks what is missing.",
    prompt: [
      "The plant:",
      ...describePlant(graph, kpis),
      kpis
        ? `Last shift it shipped ${kpis.completed} parts${kpis.bottleneck ? `; the bottleneck was "${kpis.bottleneck}"` : ""}.`
        : "",
      goal ? `The goal: ${goal}` : "",
      "",
      ...(messages.length > 1
        ? [
            "The conversation so far:",
            ...messages
              .slice(0, -1)
              .map(
                ({ role, text }) =>
                  `${role === "user" ? "User" : "You"}: ${text}`,
              ),
            "",
          ]
        : []),
      `The user now asks:\n"""\n${request.text.trim()}\n"""`,
      "",
      "Propose the changes that do what they ask. Each change is a list of diffs:",
      '- {"type": "add-units", "station": id, "count": n}: more identical machines working in parallel at a station.',
      '- {"type": "add-spare", "support": id, "count": n}: standby units for support equipment, which take over while a unit is down (a spare pump, a second boiler on standby).',
      '- {"type": "insert-buffer", "from": id, "to": id, "name": string, "capacity": parts}: a new buffer (rack, queue, tank) on an existing link.',
      '- {"type": "resize-buffer", "buffer": id, "capacity": parts}: a different size for an existing buffer.',
      ...NEW_EQUIPMENT_LINES,
      `- {"type": "set-param", "node": id, "param": one of ${PARAMS.join(", ")}, "value": number}: seconds for times, a share from 0 to 1 for cycleTimeVariation and scrapRate. interArrival is for sources only; support equipment has only mtbf and mttr. Work out the new value from the current one, e.g. 10% faster is 0.9 times the cycleTime.`,
      "- extraCrews: maintenance crews to add, 0 unless asked.",
      "Use only ids listed above. New equipment gets its id later: refer to it by nothing but its name.",
      "If the request is unclear, propose nothing and ask one short question in reply.",
      "",
      'Answer with JSON: {"reply": string, "changes": [{"title": string, "detail": string, "diffs": [diff], "extraCrews": number}]}.',
      'title is a short imperative such as "Add a spare feed pump"; detail is one sentence on why it should help. reply is one or two plain sentences to the user.',
    ]
      .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
      .join("\n"),
  });

  const answer = Answer.parse(parseJsonReply(reply.text));
  const changes: DesignChange[] = [];
  const dropped: string[] = [];
  let plant = graph;
  for (const [index, proposed] of answer.changes.entries()) {
    const diffs: GraphDiff[] = [];
    for (const raw of proposed.diffs) {
      const parsed = Diff.safeParse(raw);
      if (parsed.success) diffs.push(withId(parsed.data, plant, diffs));
    }
    if (diffs.length === 0 && proposed.extraCrews === 0) {
      dropped.push(proposed.title);
      continue;
    }
    try {
      const next = applyDiffs(plant, diffs);
      if (validateGraph(next).length > 0) throw new Error("invalid");
      plant = next;
    } catch {
      dropped.push(proposed.title);
      continue;
    }
    changes.push({
      id: `ai-${Date.now().toString(36)}-${index}`,
      title: proposed.title.trim(),
      detail: proposed.detail.trim(),
      diffs,
      extraCrews: proposed.extraCrews,
    });
  }

  const note =
    dropped.length > 0
      ? ` I could not make ${dropped.map((title) => `"${title}"`).join(", ")} fit the plant, so I left ${dropped.length === 1 ? "it" : "them"} out.`
      : "";
  return {
    reply:
      (answer.reply.trim() ||
        (changes.length > 0
          ? "Here is what I would change."
          : "I could not turn that into a change.")) + note,
    changes,
  };
}

/** The lines of the prompt that explain how to add new equipment. */
export const NEW_EQUIPMENT_LINES = [
  '- {"type": "insert-station", "from": id, "to": id, "name": string, "units": n, "cycleTime": s, "mtbf"?: s, "mttr"?: s, "scrapRate"?: share, "cycleTimeVariation"?: share}: a new kind of machine on an existing link, which every part then passes through. Give realistic numbers for that kind of machine.',
  '- {"type": "add-support", "name": string, "units": n, "neededBy": [id], "mtbf"?: s, "mttr"?: s}: new support equipment parts never pass through (a water softener, a backup compressor); what needs it stops while it is down.',
  "New equipment only pays off through what it changes: list set-param diffs on the existing machines it improves in the same change (a softener makes the boiler fail less: a higher mtbf).",
];

type ParsedDiff = z.infer<typeof Diff>;

/** The diff with an id for the node it adds, if it adds one. */
export function withId(
  diff: ParsedDiff,
  graph: FactoryGraph,
  earlier: GraphDiff[],
): GraphDiff {
  if (diff.type === "insert-buffer") {
    return { ...diff, id: freeId(graph, earlier, `buffer-${diff.name}`) };
  }
  if (diff.type === "insert-station" || diff.type === "add-support") {
    return { ...diff, id: freeId(graph, earlier, `new-${diff.name}`) };
  }
  return diff;
}

/** An id for a new node that no node, nor an earlier diff, already has. */
function freeId(graph: FactoryGraph, diffs: GraphDiff[], name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "new";
  const taken = new Set([
    ...graph.nodes.map(({ id }) => id),
    ...diffs.flatMap((diff) => ("id" in diff ? [diff.id] : [])),
  ]);
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  return id;
}
