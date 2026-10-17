import {
  type AgentSpec,
  PERSONAS,
  ROLES,
  createAgentPolicy,
  createGeminiModel,
  type DesignMessage,
  designChanges,
} from "@repo/agent";
import {
  type FactoryGraph,
  type Kpis,
  type Policy,
  type Scenario,
  type SimEvent,
  applyScenario,
  defaultPolicy,
  simulate,
  simulateDays,
  validateGraph,
} from "@repo/sim";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";

const MAX_AGENTS = 6;
// Standard-rules days averaged per run; each takes well under a second.
const MAX_DAYS = 60;
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
  /** Days the standard-rules baseline is averaged over. */
  days: number;
}

function parseBody(body: unknown): RunBody {
  const { graph, scenario, agents, seed, tickMinutes, days } = (body ??
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
    days: Math.min(MAX_DAYS, Math.max(1, Math.round(Number(days)) || 1)),
  };
}

export function goal({ targets, shiftHours }: Scenario): string {
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
 * Runs the shift on standard rules over `days` seeds, starting at the run's
 * own, then once more on that first seed with the agents deciding. Answers
 * as newline-delimited JSON so the page can show the shift as it happens:
 * `start`, then `events` (the floor so far) and `decision` lines as the
 * agents decide, then `done` with every event (or `error`).
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
      const days = await simulateDays(applied.graph, config, body.days);
      await send({
        type: "start",
        horizon: applied.horizon,
        maintenanceCrews: applied.maintenanceCrews,
        adjustments: applied.adjustments,
        baseline: days[0]!,
        days,
      });

      let decide: Policy["decide"] = defaultPolicy.decide;
      if (body.agents.length > 0) {
        const agents = createAgentPolicy({
          agents: body.agents,
          goal: goal(body.scenario),
          onDecision: (record) => void send({ type: "decision", record }),
        });
        decide = (request) => {
          // Nobody is watching any more, so stop paying for decisions.
          if (aborted) throw new Error("The run was cancelled");
          return agents.decide(request);
        };
      }
      // The shift only takes real time while it waits on a decision, so the
      // events so far go out just before each one: the page shows the floor
      // as the agents see it.
      let unsent: SimEvent[] = [];
      const policy: Policy = {
        decide(request) {
          if (unsent.length > 0) {
            void send({ type: "events", events: unsent });
            unsent = [];
          }
          return decide(request);
        },
      };
      const operated = await simulate(
        applied.graph,
        {
          ...config,
          onEvent: (event) => {
            if (REPLAYED.includes(event.type)) unsent.push(event);
          },
        },
        policy,
      );
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

function parseMessages(value: unknown): DesignMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (raw): raw is DesignMessage =>
        (raw?.role === "user" || raw?.role === "assistant") &&
        typeof raw.text === "string",
    )
    .map(({ role, text }) => ({ role, text: text.slice(0, 2000) }))
    .slice(-12);
}

/**
 * Turns a request in plain words into changes to the plant, for the results
 * step's redesign. Takes { graph, kpis?, scenario?, messages } and answers
 * { reply, changes }, each change in the shape the report measures.
 */
run.post("/redesign", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    graph?: FactoryGraph;
    kpis?: Kpis;
    scenario?: Scenario;
    messages?: unknown;
  } | null;
  const graph = body?.graph;
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    throw new HTTPException(400, { message: "Expected a graph with nodes and edges" });
  }
  const problems = validateGraph(graph);
  if (problems.length > 0) {
    throw new HTTPException(400, { message: `The plant cannot run: ${problems.join("; ")}` });
  }
  const messages = parseMessages(body?.messages);
  if (messages.at(-1)?.role !== "user") {
    throw new HTTPException(400, {
      message: "Expected messages ending with the user's request",
    });
  }
  let ask;
  try {
    ask = createGeminiModel();
  } catch (error) {
    throw new HTTPException(503, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return c.json(
    await designChanges(ask, {
      graph,
      kpis: body?.kpis?.stations ? body.kpis : undefined,
      goal: body?.scenario?.shiftHours ? goal(body.scenario) : undefined,
      messages,
    }),
  );
});
