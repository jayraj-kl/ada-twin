import {
  PERSONAS,
  ROLES,
  createAgentPolicy,
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
  type Scenario,
  validateGraph,
} from "@repo/sim";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { stream } from "hono/streaming";
import { since } from "@repo/logger";
import { log } from "../logging";
import {
  type ShiftModels,
  type ShiftRequest,
  goal,
  streamShift,
} from "../shift/runner";
import { cloudRunStore } from "../shift/store";

export { goal };

const MAX_AGENTS = 6;
// Standard-rules days averaged per run; each takes well under a second.
const MAX_DAYS = 60;
// The picks a run with changes was made for, as the page names them.
const MAX_TRIAL_KEY = 1_000_000;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The agents decide and the playbook is written by Gemini. */
const GEMINI_MODELS: ShiftModels = {
  agents: (options) => createAgentPolicy(options),
  writePlaybook: (input) => writePlaybook(createGeminiModel(), input),
};

/**
 * The shift the page asks for: { graph, scenario, agents, seed, tickMinutes,
 * days, projectId?, trial?: { key } }. A run with `trial` is kept as the
 * project's run with changes for those picks, never as its latest run; a
 * `trial` without a usable key is refused rather than kept as the latest.
 */
function parseBody(body: unknown): ShiftRequest {
  const { graph, scenario, agents, seed, tickMinutes, days, projectId, trial } =
    (body ?? {}) as Partial<ShiftRequest> & { trial?: { key?: unknown } };
  const fail = (message: string): never => {
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
  if (
    trial !== undefined &&
    (typeof trial?.key !== "string" ||
      !trial.key ||
      trial.key.length > MAX_TRIAL_KEY)
  ) {
    fail("Expected trial: { key } naming the picked changes");
  }
  return {
    graph: graph!,
    scenario: scenario!,
    agents: agents!,
    seed: Number.isFinite(Number(seed)) ? Number(seed) : 1,
    tickMinutes: Math.min(240, Math.max(5, Number(tickMinutes) || 30)),
    days: Math.min(MAX_DAYS, Math.max(1, Math.round(Number(days)) || 1)),
    projectId:
      typeof projectId === "string" && UUID.test(projectId)
        ? projectId
        : undefined,
    purpose: trial
      ? { kind: "trial", key: trial.key as string }
      : { kind: "latest" },
  };
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
  const request = parseBody(await c.req.json().catch(() => null));
  c.header("Content-Type", "application/x-ndjson");
  return stream(c, async (out) => {
    let aborted = false;
    const started = performance.now();
    out.onAbort(() => {
      aborted = true;
      log.info("shift cancelled: the page stopped listening", {
        ms: since(started),
      });
    });
    await streamShift(
      request,
      { store: cloudRunStore(), models: GEMINI_MODELS },
      async (line) => {
        await out.writeln(JSON.stringify(line));
      },
      () => aborted,
    );
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
