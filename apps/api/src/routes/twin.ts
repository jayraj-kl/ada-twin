import {
  type Machine,
  type CostedChange,
  createGeminiModel,
  type CurrentFlow,
  type FlowMessage,
  type PlantContext,
  describeScenario,
  draftFlow,
  estimateCosts,
  fillParameters,
  locateMachines,
  needsInfo,
  reviseFlow,
  suggestScenarios,
} from "@repo/agent";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { selectDocument } from "@repo/db/queries/select";
import type { Scenario } from "@repo/sim";
import { readFile } from "../storage";

function model() {
  try {
    return createGeminiModel();
  } catch (error) {
    throw new HTTPException(503, {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

function parseMachine(value: unknown): Machine {
  const machine = (value ?? {}) as Record<string, unknown>;
  const text = (key: string) =>
    typeof machine[key] === "string" && machine[key].trim()
      ? machine[key].trim()
      : undefined;
  const id = text("id");
  const name = text("name");
  if (!id || !name) {
    throw new HTTPException(400, {
      message: "Each machine needs an id and a name",
    });
  }
  const count = Number(machine.count);
  return {
    id,
    name,
    type: text("type"),
    manufacturer: text("manufacturer"),
    model: text("model"),
    notes: text("notes"),
    count: Number.isInteger(count) && count > 0 ? count : 1,
    auxiliary: machine.auxiliary === true,
  };
}

export const twin = new Hono();

twin.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  // Anything else here is the model failing or answering unusably.
  return c.json(
    { error: error instanceof Error ? error.message : String(error) },
    502,
  );
});

/** The panorama and machine list both photo-reading routes take. */
async function readFloor(c: Context) {
  const body = (await c.req.json().catch(() => null)) as {
    panoramaUrl?: unknown;
    machines?: unknown;
    description?: unknown;
  } | null;
  if (
    typeof body?.panoramaUrl !== "string" ||
    !URL.canParse(body.panoramaUrl) ||
    !Array.isArray(body.machines)
  ) {
    throw new HTTPException(400, {
      message: "Expected { panoramaUrl: string, machines: Machine[] }",
    });
  }
  const machines = body.machines.map(parseMachine);
  const ask = model();

  const image = await fetch(body.panoramaUrl);
  if (!image.ok) {
    throw new HTTPException(400, {
      message: `Could not fetch the panorama (HTTP ${image.status})`,
    });
  }
  return {
    ask,
    machines,
    description:
      typeof body.description === "string" ? body.description : undefined,
    panorama: {
      bytes: new Uint8Array(await image.arrayBuffer()),
      mimeType: image.headers.get("content-type") ?? "image/png",
    },
  };
}

// Finds each listed machine in the panorama. LOCATE_SPLIT=off sends the
// whole panorama instead of cutting it into views, to compare the two.
twin.post("/locate", async (c) => {
  const { ask, panorama, machines } = await readFloor(c);
  return c.json({
    placements: await locateMachines(ask, panorama, machines, {
      split: process.env.LOCATE_SPLIT !== "off",
    }),
  });
});

// Drafts how material moves between the listed machines.
twin.post("/flow", async (c) => {
  const { ask, panorama, machines, description } = await readFloor(c);
  return c.json(await draftFlow(ask, panorama, machines, description));
});

const KINDS = new Set(["source", "buffer", "sink"]);
const isLink = (link: unknown): link is { from: string; to: string } =>
  typeof (link as { from?: unknown })?.from === "string" &&
  typeof (link as { to?: unknown })?.to === "string";

/** The flow as the page has it; malformed entries are dropped, not refused. */
function parseCurrentFlow(value: unknown): CurrentFlow {
  const flow = (value ?? {}) as Record<string, unknown>;
  const list = (key: string) =>
    Array.isArray(flow[key]) ? (flow[key] as unknown[]) : [];
  return {
    nodes: list("nodes").flatMap((raw) => {
      const node = raw as Record<string, unknown>;
      if (
        typeof node?.id !== "string" ||
        typeof node.name !== "string" ||
        !KINDS.has(node.kind as string)
      ) {
        return [];
      }
      const value = Number(node.value);
      return [
        {
          id: node.id,
          name: node.name,
          kind: node.kind as CurrentFlow["nodes"][number]["kind"],
          ...(value > 0 ? { value } : {}),
        },
      ];
    }),
    edges: list("edges").filter(isLink),
    needs: list("needs").filter(isLink),
  };
}

/** The conversation, keeping the last turns so the prompt stays short. */
function parseMessages(value: unknown): FlowMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (raw): raw is FlowMessage =>
        (raw?.role === "user" || raw?.role === "assistant") &&
        typeof raw.text === "string",
    )
    .map(({ role, text }) => ({ role, text: text.slice(0, 2000) }))
    .slice(-12);
}

// Changes the flow the way the user asks, keeping the rest of it.
// Takes the /flow body plus { current: Flow, messages: FlowMessage[] }.
twin.post("/flow/revise", async (c) => {
  // Checked before readFloor fetches the panorama; Hono keeps the parsed body.
  const body = (await c.req.json().catch(() => null)) as {
    current?: unknown;
    messages?: unknown;
  } | null;
  const messages = parseMessages(body?.messages);
  if (messages.at(-1)?.role !== "user") {
    throw new HTTPException(400, {
      message: "Expected messages ending with the user's request",
    });
  }
  const { ask, panorama, machines, description } = await readFloor(c);
  return c.json(
    await reviseFlow(
      ask,
      panorama,
      machines,
      parseCurrentFlow(body?.current),
      messages,
      description,
    ),
  );
});

// Fills one machine's parameters: its documents, then the web, then
// assumptions. Multipart: `machine` (JSON) plus any number of `documents`.
twin.post("/parameters", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const raw = form?.get("machine");
  if (!form || typeof raw !== "string") {
    throw new HTTPException(400, {
      message: "Expected multipart form data with a `machine` JSON field",
    });
  }
  let machine: Machine;
  try {
    machine = parseMachine(JSON.parse(raw));
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    throw new HTTPException(400, { message: "`machine` is not valid JSON" });
  }
  const files = form
    .getAll("documents")
    .filter((entry): entry is File => entry instanceof File);
  // Documents uploaded earlier and kept with the project, by id.
  const projectId = form.get("projectId");
  const keptIds = form
    .getAll("documentIds")
    .filter((entry): entry is string => typeof entry === "string");
  const kept =
    typeof projectId === "string" && keptIds.length > 0
      ? await Promise.all(
          keptIds.slice(0, 10).map(async (id) => {
            const row = await selectDocument(projectId, id).catch(() => null);
            const file = row && (await readFile(row.path));
            if (!row || !file) {
              throw new HTTPException(404, {
                message: `A document of this machine is no longer kept (${id})`,
              });
            }
            return {
              name: row.name,
              bytes: new Uint8Array(file.data),
              mimeType: row.mimeType,
            };
          }),
        )
      : [];
  if (needsInfo(machine, files.length + kept.length)) {
    throw new HTTPException(422, {
      message: `Nothing to look "${machine.name}" up by: add its manufacturer and model, or a document`,
    });
  }

  const documents = [
    ...kept,
    ...(await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        bytes: new Uint8Array(await file.arrayBuffer()),
        mimeType: file.type || "application/pdf",
      })),
    )),
  ];
  return c.json(await fillParameters(model(), machine, documents));
});

const MAX_COSTED = 10;

twin.post("/costs", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    changes?: unknown;
    currency?: unknown;
  } | null;
  if (
    !Array.isArray(body?.changes) ||
    body.changes.length === 0 ||
    body.changes.length > MAX_COSTED
  ) {
    throw new HTTPException(400, {
      message: `Expected 1 to ${MAX_COSTED} changes to price`,
    });
  }
  const changes: CostedChange[] = body.changes.map((raw: unknown) => {
    const change = (raw ?? {}) as Record<string, unknown>;
    if (typeof change.id !== "string" || typeof change.title !== "string") {
      throw new HTTPException(400, {
        message: "Each change needs an id and a title",
      });
    }
    return {
      id: change.id,
      title: change.title,
      detail: typeof change.detail === "string" ? change.detail : "",
      machine: change.machine ? parseMachine(change.machine) : undefined,
    };
  });
  const currency =
    typeof body.currency === "string" && /^[A-Z]{3}$/.test(body.currency)
      ? body.currency
      : "USD";
  return c.json({
    estimates: await estimateCosts(model(), changes, { currency }),
  });
});

/** What the plant can make and counts, as the scenario step sends it. */
function plantContext(
  body: { capacityPerShift?: unknown; unit?: unknown } | null,
): PlantContext {
  const capacity = Number(body?.capacityPerShift);
  const unit =
    typeof body?.unit === "string" ? body.unit.trim().slice(0, 30) : "";
  return {
    ...(Number.isFinite(capacity) && capacity > 0
      ? { capacityPerShift: capacity }
      : {}),
    ...(unit ? { unit } : {}),
  };
}

/**
 * A few scenarios worth testing the plant against, in words, for the scenario
 * step to offer. Takes { machines, process? } and answers { suggestions }.
 */
twin.post("/scenario/suggestions", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    machines?: unknown;
    process?: unknown;
    capacityPerShift?: unknown;
    unit?: unknown;
  } | null;
  const machines = (Array.isArray(body?.machines) ? body.machines : [])
    .filter(
      (machine): machine is { name: string; count?: unknown } =>
        typeof machine?.name === "string" && machine.name.trim() !== "",
    )
    .slice(0, 60)
    .map(({ name, count }) => ({
      name: name.trim().slice(0, 80),
      count: Number.isInteger(count) ? (count as number) : undefined,
    }));
  const process =
    typeof body?.process === "string" ? body.process.slice(0, 2000) : undefined;
  return c.json({
    suggestions: await suggestScenarios(model(), {
      machines,
      process,
      plant: plantContext(body),
    }),
  });
});

/**
 * Turns a scenario described in plain words into proposed changes to its
 * settings and a crew briefing. Takes { scenario, machines, messages } and
 * answers { reply, changes, briefing, notModelled }; nothing is applied here.
 */
twin.post("/scenario", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    scenario?: Scenario;
    machines?: unknown;
    messages?: unknown;
    capacityPerShift?: unknown;
    unit?: unknown;
  } | null;
  if (!body?.scenario || typeof body.scenario !== "object") {
    throw new HTTPException(400, { message: "Expected the current scenario" });
  }
  const messages = parseMessages(body.messages);
  if (messages.at(-1)?.role !== "user") {
    throw new HTTPException(400, {
      message: "Expected the conversation to end with the user's description",
    });
  }
  const machines = (Array.isArray(body.machines) ? body.machines : [])
    .filter(
      (machine): machine is { id: string; name: string } =>
        typeof machine?.id === "string" && typeof machine?.name === "string",
    )
    .map(({ id, name }) => ({ id, name }));
  return c.json(
    await describeScenario(model(), {
      scenario: body.scenario,
      machines,
      messages,
      plant: plantContext(body),
    }),
  );
});
