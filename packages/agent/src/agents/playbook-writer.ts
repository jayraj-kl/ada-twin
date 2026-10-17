import type { FactoryGraph, Playbook } from "@repo/sim";
import { z } from "zod";
import { type AskModel, parseJsonReply } from "../model";
import type { DecisionRecord } from "./floor-operator";

const Reply = z.object({
  repairOrder: z.array(z.string()).nullish(),
  release: z
    .array(
      z.object({
        source: z.string(),
        slowAboveWip: z.number().nullish(),
        fastBelowWip: z.number().nullish(),
      }),
    )
    .nullish(),
  service: z
    .array(z.object({ machine: z.string(), everyHours: z.number() }))
    .nullish(),
  notes: z.string().nullish(),
});

const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
};

/**
 * Writes down how a crew ran one shift as a few fixed rules, so the same way
 * of working can be replayed over many days without asking the crew again.
 * Anything the reply gets wrong, such as a machine that does not exist, is
 * left out, and what is left out falls back to the standard rules.
 */
export async function writePlaybook(
  ask: AskModel,
  { graph, goal, decisions }: {
    graph: FactoryGraph;
    goal: string;
    decisions: DecisionRecord[];
  },
): Promise<Playbook> {
  const machines = graph.nodes.filter(
    (node) => node.kind === "station" || node.kind === "support",
  );
  const sources = graph.nodes.filter((node) => node.kind === "source");
  const reply = await ask({
    task: "write-playbook",
    instruction:
      "You turn the decisions a factory crew made during one shift into a few fixed rules that reproduce how they worked. Describe what they did, not what you would have done.",
    prompt: [
      `The crew's goal: ${goal}`,
      "",
      "Machines (id: name):",
      ...machines.map(
        (node) =>
          `- ${node.id}: ${node.name}${node.kind === "support" ? " (support equipment)" : ""}`,
      ),
      "Sources (id: name):",
      ...sources.map((node) => `- ${node.id}: ${node.name}`),
      "",
      "Their decisions, in order:",
      ...decisions.map(
        (record) =>
          `- ${clock(record.time)} ${record.agent.role}: chose "${record.options[record.choice] ?? "?"}" from [${record.options.join(" | ")}]${record.fallback ? " (fell back to the standard rule)" : ` because "${record.reason}"`}`,
      ),
      "",
      'Answer with only JSON: {"repairOrder": [machine id, ...], "release": [{"source": id, "slowAboveWip": number | null, "fastBelowWip": number | null}], "service": [{"machine": id, "everyHours": number}], "notes": string}.',
      "repairOrder lists the machines whose repairs the crew put first, most urgent first; leave out machines they showed no preference for.",
      "release gives, per source, the work-in-progress level above which they slowed release below 100% and the level below which they sped it up above 100%. Use null for a direction they never used, and leave a source out if they never changed its pace.",
      "service gives, per machine they serviced before it broke, roughly how many working hours they let it run between services; leave out machines they never serviced.",
      "notes says in two or three plain sentences how the crew ran the floor.",
    ].join("\n"),
  });

  const parsed = Reply.parse(parseJsonReply(reply.text));
  const machineIds = new Set(machines.map(({ id }) => id));
  const sourceIds = new Set(sources.map(({ id }) => id));
  const playbook: Playbook = {
    repairOrder: [
      ...new Set((parsed.repairOrder ?? []).filter((id) => machineIds.has(id))),
    ],
    release: {},
    serviceEveryHours: {},
    notes: parsed.notes?.trim() || undefined,
  };
  for (const rule of parsed.release ?? []) {
    if (!sourceIds.has(rule.source)) continue;
    const slow = rule.slowAboveWip ?? undefined;
    const fast = rule.fastBelowWip ?? undefined;
    // Thresholds that cross would slow and speed up at once.
    if (slow !== undefined && fast !== undefined && slow < fast) continue;
    if ((slow ?? 0) < 0 || (fast ?? 0) < 0) continue;
    if (slow === undefined && fast === undefined) continue;
    playbook.release[rule.source] = {
      ...(slow !== undefined && { slowAboveWip: slow }),
      ...(fast !== undefined && { fastBelowWip: fast }),
    };
  }
  for (const rule of parsed.service ?? []) {
    if (machineIds.has(rule.machine) && rule.everyHours > 0) {
      playbook.serviceEveryHours[rule.machine] = rule.everyHours;
    }
  }
  return playbook;
}
