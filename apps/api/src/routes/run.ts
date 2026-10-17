import {
  type AgentSpec,
  PERSONAS,
  ROLES,
  createAgentPolicy,
  type DecisionRecord,
  createGeminiModel,
  type DesignMessage,
  type DigestLine,
  type RunDigest,
  designChanges,
  scoutEquipment,
  writePlaybook,
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
import { since } from "@repo/logger";
import { log } from "../logging";

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

// The briefing comes from the page; this much is plenty for a few sentences.
const MAX_BRIEFING = 1000;

export function goal({ targets, shiftHours, briefing }: Scenario): string {
  const wanted = [
    targets?.throughputPerShift &&
      `ship at least ${targets.throughputPerShift} parts in the ${shiftHours}-hour shift`,
    targets?.maxAverageWip &&
      `keep work in progress under ${targets.maxAverageWip} parts`,
    targets?.maxDownShare &&
      `keep every station down less than ${Math.round(targets.maxDownShare * 100)}% of the time`,
  ].filter(Boolean);
  const aim =
    wanted.length > 0
      ? `${wanted.join(", ")}.`.replace(/^./, (first) => first.toUpperCase())
      : "Ship as many good parts as possible this shift.";
  const told =
    typeof briefing === "string" ? briefing.trim().slice(0, MAX_BRIEFING) : "";
  return told ? `${aim} Briefing: ${told}` : aim;
}

export const run = new Hono();

run.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
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
 * agents decide, then `done` with every event (or `error`). With agents, a
 * last `playbook` line carries their way of working as fixed rules, or null
 * with a `problem` if it could not be written.
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
    const started = performance.now();
    let aborted = false;
    out.onAbort(() => {
      aborted = true;
      log.info("shift cancelled: the page stopped listening", {
        ms: since(started),
      });
    });
    const tally = { decisions: 0, fallbacks: 0 };
    log.info("shift started", {
      scenario: body.scenario.name,
      shiftHours: body.scenario.shiftHours,
      stations: body.graph.nodes.length,
      agents: body.agents.map(({ name, role }) => `${name} (${role})`),
      days: body.days,
      seed: body.seed,
      goal: goal(body.scenario),
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
      const records: DecisionRecord[] = [];
      if (body.agents.length > 0) {
        const agents = createAgentPolicy({
          agents: body.agents,
          goal: goal(body.scenario),
          onDecision: (record) => {
            tally.decisions++;
            if (record.fallback) tally.fallbacks++;
            records.push(record);
            void send({ type: "decision", record });
          },
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
      log.info("shift finished", {
        completed: operated.kpis.completed,
        scrapped: operated.kpis.scrapped,
        bottleneck: operated.kpis.bottleneck,
        baselineCompleted: days[0]!.completed,
        ...tally,
        ms: since(started),
      });
      await send({
        type: "done",
        kpis: operated.kpis,
        events: operated.events.filter(({ type }) => REPLAYED.includes(type)),
      });

      // The crew's way of working as fixed rules, so the page can replay it
      // over many days. The shift is already shown, so failing here only
      // costs the averages, not the run.
      if (records.length > 0 && !aborted) {
        const writing = performance.now();
        try {
          const playbook = await writePlaybook(createGeminiModel(), {
            graph: body.graph,
            goal: goal(body.scenario),
            decisions: records,
          });
          log.info("playbook written", {
            repairOrder: playbook.repairOrder.length,
            release: Object.keys(playbook.release).length,
            service: Object.keys(playbook.serviceEveryHours).length,
            ms: since(writing),
          });
          await send({ type: "playbook", playbook });
        } catch (error) {
          if (aborted) return;
          log.warn("playbook failed", { error, ms: since(writing) });
          await send({
            type: "playbook",
            playbook: null,
            problem: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      if (aborted) return;
      log.error("shift failed", { error, ...tally, ms: since(started) });
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
    throw new HTTPException(400, {
      message: "Expected a graph with nodes and edges",
    });
  }
  const problems = validateGraph(graph);
  if (problems.length > 0) {
    throw new HTTPException(400, {
      message: `The plant cannot run: ${problems.join("; ")}`,
    });
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

const share = (value: unknown) =>
  value !== undefined && value !== null && Number.isFinite(Number(value))
    ? Math.min(1, Math.max(0, Number(value)))
    : undefined;

function parseDigest(value: unknown): RunDigest {
  const raw = (value ?? {}) as Record<string, unknown>;
  const lines = (list: unknown): DigestLine[] =>
    (Array.isArray(list) ? list : [])
      .filter((line) => typeof line?.id === "string")
      .slice(0, 60)
      .map((line: Record<string, unknown>) => ({
        id: line.id as string,
        working: share(line.working),
        blocked: share(line.blocked),
        idle: share(line.idle),
        down: share(line.down),
        stopped: share(line.stopped),
        failures: Number.isFinite(Number(line.failures))
          ? Math.max(0, Math.round(Number(line.failures)))
          : undefined,
      }));
  const range = raw.range as { min?: unknown; max?: unknown } | undefined;
  const decisions = raw.decisions as
    | { total?: unknown; fallbacks?: unknown }
    | undefined;
  return {
    shipped: Number(raw.shipped) || 0,
    days: Math.max(1, Math.round(Number(raw.days)) || 1),
    range:
      Number.isFinite(Number(range?.min)) && Number.isFinite(Number(range?.max))
        ? { min: Number(range!.min), max: Number(range!.max) }
        : undefined,
    bottleneck:
      typeof raw.bottleneck === "string" ? raw.bottleneck.slice(0, 200) : undefined,
    stations: lines(raw.stations),
    supports: lines(raw.supports),
    decisions: Number.isFinite(Number(decisions?.total))
      ? {
          total: Number(decisions!.total),
          fallbacks: Number(decisions!.fallbacks) || 0,
        }
      : undefined,
  };
}

/**
 * Suggests equipment the plant does not have, or spare parts to keep, from
 * a run. Takes { graph, digest, scenario?, known? } and answers
 * { suggestions, dropped }; the page measures each before showing it.
 */
run.post("/scout", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    graph?: FactoryGraph;
    digest?: unknown;
    scenario?: Scenario;
    known?: unknown;
  } | null;
  const graph = body?.graph;
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) {
    throw new HTTPException(400, { message: "Expected a graph with nodes and edges" });
  }
  const problems = validateGraph(graph);
  if (problems.length > 0) {
    throw new HTTPException(400, { message: `The plant cannot run: ${problems.join("; ")}` });
  }
  if (!body?.digest) {
    throw new HTTPException(400, { message: "Expected a digest of the run" });
  }
  let ask;
  try {
    ask = createGeminiModel();
  } catch (error) {
    throw new HTTPException(503, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
  const answer = await scoutEquipment(ask, {
    graph,
    digest: parseDigest(body.digest),
    goal: body.scenario?.shiftHours ? goal(body.scenario) : undefined,
    known: (Array.isArray(body.known) ? body.known : [])
      .filter((title): title is string => typeof title === "string")
      .map((title) => title.slice(0, 200))
      .slice(0, 40),
  });
  log.info("equipment scouted", {
    suggested: answer.suggestions.map(({ kind, title }) => `${kind}: ${title}`),
    dropped: answer.dropped,
  });
  return c.json(answer);
});
