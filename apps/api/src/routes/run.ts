import {
  type AgentSpec,
  PERSONAS,
  ROLES,
  createAgentPolicy,
} from "@repo/agent";
import {
  type FactoryGraph,
  type Policy,
  type Scenario,
  type SimEvent,
  applyScenario,
  defaultPolicy,
  simulate,
  validateGraph,
} from "@repo/sim";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";

const MAX_AGENTS = 6;
// What the run view replays; per-part start and finish events are left out.
const REPLAYED: SimEvent["type"][] = [
  "created",
  "completed",
  "scrap",
  "status",
  "failure",
  "repair-start",
  "repair-end",
  "preventive-start",
  "preventive-end",
];

interface RunBody {
  graph: FactoryGraph;
  scenario: Scenario;
  agents: AgentSpec[];
  seed: number;
  tickMinutes: number;
}

function parseBody(body: unknown): RunBody {
  const { graph, scenario, agents, seed, tickMinutes } = (body ??
    {}) as Partial<RunBody>;
  const fail = (message: string) => {
    throw new HTTPException(400, { message });
  };
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    fail("Expected a graph with nodes and edges");
  }
  const problems = validateGraph(graph!);
  if (problems.length > 0) fail(`The flow cannot run: ${problems.join("; ")}`);
  if (!(Number(scenario?.shiftHours) > 0) || scenario!.shiftHours > 24) {
    fail("The scenario needs a shift length between 0 and 24 hours");
  }
  if (!Array.isArray(agents) || agents.length > MAX_AGENTS) {
    fail(`Expected up to ${MAX_AGENTS} agents`);
  }
  for (const agent of agents!) {
    if (
      typeof agent?.id !== "string" ||
      typeof agent.name !== "string" ||
      !(agent.role in ROLES) ||
      !(agent.persona in PERSONAS)
    ) {
      fail("Each agent needs an id, a name, a role and a personality");
    }
  }
  return {
    graph: graph!,
    scenario: scenario!,
    agents: agents!,
    seed: Number.isFinite(Number(seed)) ? Number(seed) : 1,
    tickMinutes: Math.min(240, Math.max(5, Number(tickMinutes) || 30)),
  };
}

function goal({ targets, shiftHours }: Scenario): string {
  const wanted = [
    targets?.throughputPerShift &&
      `ship at least ${targets.throughputPerShift} parts in the ${shiftHours}-hour shift`,
    targets?.maxAverageWip &&
      `keep work in progress under ${targets.maxAverageWip} parts`,
    targets?.maxDownShare &&
      `keep every station down less than ${Math.round(targets.maxDownShare * 100)}% of the time`,
  ].filter(Boolean);
  return wanted.length > 0
    ? `${wanted.join(", ")}.`.replace(/^./, (first) => first.toUpperCase())
    : "Ship as many good parts as possible this shift.";
}

export const run = new Hono();

run.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  console.error("[run] request failed:", error);
  return c.json(
    { error: error instanceof Error ? error.message : String(error) },
    502,
  );
});

/**
 * Runs one shift twice on the same seed: on standard rules, then with the
 * agents deciding. Answers as newline-delimited JSON so each decision reaches
 * the page as it is made: `start`, any number of `decision`, then `done`
 * (or `error`).
 */
run.post("/", async (c) => {
  const body = parseBody(await c.req.json().catch(() => null));
  const applied = applyScenario(body.graph, body.scenario);
  const config = {
    seed: body.seed,
    horizon: applied.horizon,
    maintenanceCrews: applied.maintenanceCrews,
    tickInterval: body.tickMinutes * 60,
  };

  c.header("Content-Type", "application/x-ndjson");
  return stream(c, async (out) => {
    const send = (line: unknown) => out.writeln(JSON.stringify(line));
    let aborted = false;
    out.onAbort(() => {
      aborted = true;
    });

    try {
      const baseline = await simulate(applied.graph, {
        ...config,
        recordEvents: false,
      });
      await send({
        type: "start",
        horizon: applied.horizon,
        maintenanceCrews: applied.maintenanceCrews,
        adjustments: applied.adjustments,
        baseline: baseline.kpis,
      });

      let policy: Policy = defaultPolicy;
      if (body.agents.length > 0) {
        const agents = createAgentPolicy({
          agents: body.agents,
          goal: goal(body.scenario),
          onDecision: (record) => void send({ type: "decision", record }),
        });
        policy = {
          decide(request) {
            // Nobody is watching any more, so stop paying for decisions.
            if (aborted) throw new Error("The run was cancelled");
            return agents.decide(request);
          },
        };
      }
      const operated = await simulate(applied.graph, config, policy);
      await send({
        type: "done",
        kpis: operated.kpis,
        events: operated.events.filter(({ type }) => REPLAYED.includes(type)),
      });
    } catch (error) {
      if (aborted) return;
      console.error("[run] shift failed:", error);
      await send({
        type: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
});
