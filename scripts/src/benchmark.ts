// Benchmarks the prototype for the deck's performance slides and writes every
// number to bench-out/benchmark.json, each tagged with how it was obtained:
//   measured  - timed on this machine or against the live API
//   simulated - output of the twin's simulation
//   estimated - a cost the API looked up on the web
//
// One real agent shift runs on the live API (about 30 Gemini decisions plus
// one playbook, roughly a cent); everything else is free.
//
//   pnpm --filter @repo/scripts benchmark
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type GraphDiff,
  type Kpis,
  type Playbook,
  applyDiffs,
  applyScenario,
  averageKpis,
  playbookPolicy,
  simulateDays,
  spread,
} from "@repo/sim";
import { DEMO_AGENTS, DEMO_GRAPH, DEMO_SCENARIO } from "./lib/demo-factory";

const API =
  process.env.API_URL ?? "https://ada-twin-api-578444699555.africa-south1.run.app";
const DAYS = 30;
const SEED = 1;
const TICK_MINUTES = 30;
const OUT = fileURLToPath(new URL("../bench-out/", import.meta.url));

const round = (value: number, digits = 1) =>
  Math.round(value * 10 ** digits) / 10 ** digits;
const ms = (started: number) => Math.round(performance.now() - started);

const applied = applyScenario(DEMO_GRAPH, DEMO_SCENARIO);
const config = {
  seed: SEED,
  horizon: applied.horizon,
  maintenanceCrews: applied.maintenanceCrews,
  tickInterval: TICK_MINUTES * 60,
};

/** A measure over days: average, worst and best, rounded for the slides. */
function stat(days: Kpis[], pick: (kpis: Kpis) => number, digits = 1) {
  const { mean, min, max } = spread(days.map(pick));
  return { mean: round(mean, digits), min: round(min, digits), max: round(max, digits) };
}

function metrics(days: Kpis[]) {
  return {
    partsShipped: stat(days, (k) => k.completed),
    averageWip: stat(days, (k) => k.averageWip),
    boilersDownPct: stat(days, (k) => (k.stations.boilers?.down ?? 0) * 100),
    partsScrapped: stat(days, (k) => k.scrapped),
  };
}

// --- 1. simulator speed (measured, this machine) ---------------------------
console.log("1/6 timing the simulator…");
await simulateDays(applied.graph, config, 3); // warm up the JIT
let started = performance.now();
const standardDays = await simulateDays(applied.graph, config, DAYS);
const speedMs = ms(started);
const perShiftMs = speedMs / DAYS;
const simulator = {
  tag: "measured",
  days: DAYS,
  totalMs: speedMs,
  perShiftMs: round(perShiftMs, 2),
  timesFasterThanRealTime: Math.round(applied.horizon / (perShiftMs / 1000)),
};

// --- 2. one real agent shift on the live API (measured + simulated) -------
console.log("2/6 running one agent shift on the live API (Gemini)…");
started = performance.now();
const response = await fetch(`${API}/run`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    graph: DEMO_GRAPH,
    scenario: DEMO_SCENARIO,
    agents: DEMO_AGENTS,
    seed: SEED,
    tickMinutes: TICK_MINUTES,
    days: DAYS,
  }),
});
if (!response.ok || !response.body) {
  throw new Error(`/run answered HTTP ${response.status}`);
}
interface Line {
  type: string;
  days?: Kpis[];
  kpis?: Kpis;
  record?: { fallback?: string };
  playbook?: Playbook | null;
  problem?: string;
  message?: string;
}
const lines: Line[] = [];
const at: Record<string, number> = {};
const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
let pending = "";
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  const parts = (pending + value).split("\n");
  pending = parts.pop()!;
  for (const part of parts) {
    if (!part.trim()) continue;
    const line = JSON.parse(part) as Line;
    lines.push(line);
    at[line.type] ??= ms(started);
    if (line.type === "error") throw new Error(`/run failed: ${line.message}`);
  }
}
const start = lines.find((line) => line.type === "start")!;
const done = lines.find((line) => line.type === "done")!;
const playbookLine = lines.find((line) => line.type === "playbook");
const decisions = lines.filter((line) => line.type === "decision");
const fallbacks = decisions.filter((line) => line.record?.fallback).length;
const playbook = playbookLine?.playbook ?? null;
const agentRun = {
  tag: "measured",
  standardDaysOnServerMs: at.start,
  shiftDoneMs: at.done,
  playbookWrittenMs: at.playbook ?? null,
  decisions: decisions.length,
  fallbacks,
  answeredByAgentsPct: decisions.length
    ? round(((decisions.length - fallbacks) / decisions.length) * 100, 0)
    : null,
  realDay: {
    tag: "simulated",
    partsShipped: done.kpis!.completed,
    averageWip: round(done.kpis!.averageWip),
    boilersDownPct: round((done.kpis!.stations.boilers?.down ?? 0) * 100),
    partsScrapped: done.kpis!.scrapped,
  },
  playbook,
  playbookProblem: playbookLine?.problem ?? null,
};

// --- 3. the crew's playbook over the same 30 days (simulated) -------------
console.log("3/6 replaying the crew's playbook over 30 days…");
const serverDays = start.days ?? standardDays;
const crewDays = playbook
  ? await simulateDays(applied.graph, config, DAYS, playbookPolicy(playbook))
  : null;
const fidelityPct =
  crewDays && done.kpis
    ? round(
        (1 -
          Math.abs(crewDays[0]!.completed - done.kpis.completed) /
            Math.max(1, done.kpis.completed)) *
          100,
        0,
      )
    : null;

// --- 4. candidate fixes, paired day by day (simulated) --------------------
console.log("4/6 measuring candidate fixes…");
const average = averageKpis(serverDays);
const bottleneck = average.bottleneck ?? "boilers";
const name = (id: string) =>
  DEMO_GRAPH.nodes.find((node) => node.id === id)?.name ?? id;
const worstDown = Object.entries(average.stations).sort(
  (a, b) => b[1].down - a[1].down,
)[0]![0];
const worstNode = applied.graph.nodes.find((node) => node.id === worstDown);
const feeding = DEMO_GRAPH.edges.find((edge) => edge.to === bottleneck)?.from;
const feedingBuffer = DEMO_GRAPH.nodes.find(
  (node) => node.id === feeding && node.kind === "buffer",
);
interface Fix {
  id: string;
  title: string;
  detail: string;
  diffs: GraphDiff[];
  extraCrews: number;
  machine?: { id: string; name: string; type?: string; count?: number };
}
const fixes: Fix[] = [
  {
    id: "add-unit",
    title: `Add one more unit to ${name(bottleneck)}`,
    detail: `${name(bottleneck)} is the bottleneck on an average day.`,
    diffs: [{ type: "add-units", station: bottleneck, count: 1 }],
    extraCrews: 0,
    machine: { id: bottleneck, name: name(bottleneck), type: "industrial steam boiler" },
  },
  ...(worstNode?.kind === "station" && worstNode.mttr
    ? [
        {
          id: "halve-repair",
          title: `Halve repair time at ${worstNode.name}`,
          detail: `${worstNode.name} is down most; spares kept at the station halve repairs.`,
          diffs: [
            {
              type: "set-param" as const,
              node: worstNode.id,
              param: "mttr" as const,
              value: worstNode.mttr.value / 2,
            },
          ],
          extraCrews: 0,
          machine: { id: worstNode.id, name: worstNode.name },
        },
      ]
    : []),
  ...(feedingBuffer?.kind === "buffer"
    ? [
        {
          id: "bigger-buffer",
          title: `Double ${feedingBuffer.name} to ${feedingBuffer.capacity.value * 2} parts`,
          detail: `${feedingBuffer.name} feeds the bottleneck.`,
          diffs: [
            {
              type: "resize-buffer" as const,
              buffer: feedingBuffer.id,
              capacity: feedingBuffer.capacity.value * 2,
            },
          ],
          extraCrews: 0,
        },
      ]
    : []),
  {
    id: "second-crew",
    title: "Add a maintenance crew",
    detail: "A second crew for when breakdowns queue.",
    diffs: [],
    extraCrews: 1,
  },
];
const measureFix = async (chosen: Fix[], policyPlaybook: Playbook | null) =>
  simulateDays(
    applyDiffs(
      applied.graph,
      chosen.flatMap(({ diffs }) => diffs),
    ),
    {
      ...config,
      maintenanceCrews:
        config.maintenanceCrews +
        chosen.reduce((sum, { extraCrews }) => sum + extraCrews, 0),
    },
    DAYS,
    policyPlaybook ? playbookPolicy(policyPlaybook) : undefined,
  );
const measured = [];
for (const fix of fixes) {
  const days = await measureFix([fix], null);
  const gains = days.map(
    (kpis, day) => kpis.completed - serverDays[day]!.completed,
  );
  const { mean, min, max } = spread(gains);
  measured.push({
    ...fix,
    gain: { mean: round(mean), min: round(min), max: round(max) },
  });
}
measured.sort((a, b) => b.gain.mean - a.gain.mean);

// --- 5. prices from the live cost route (estimated) -----------------------
console.log("5/6 pricing the fixes on the web (live API)…");
let costs: unknown = null;
started = performance.now();
try {
  const priced = await fetch(`${API}/twin/costs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      currency: "USD",
      changes: measured.map(({ id, title, detail, machine }) => ({
        id,
        title,
        detail,
        machine,
      })),
    }),
  });
  costs = priced.ok ? ((await priced.json()) as { estimates: unknown }).estimates : null;
} catch {
  costs = null;
}
const costMs = ms(started);

// The step-up: standard rules -> crew -> crew + the two best fixes.
const topTwo = measured.filter((fix) => fix.gain.mean > 0).slice(0, 2);
const crewPlusFixes =
  playbook && topTwo.length > 0 ? await measureFix(topTwo, playbook) : null;

// --- 6. live API latency and the test suite (measured) --------------------
console.log("6/6 timing the live API and running the tests…");
async function timed(path: string, count: number) {
  const samples: number[] = [];
  for (let index = 0; index < count; index++) {
    const t = performance.now();
    await fetch(`${API}${path}`);
    samples.push(performance.now() - t);
  }
  samples.sort((a, b) => a - b);
  return {
    p50Ms: Math.round(samples[Math.floor(count / 2)]!),
    p90Ms: Math.round(samples[Math.floor(count * 0.9)]!),
  };
}
const latency = {
  tag: "measured",
  from: "the developer's machine to Cloud Run in africa-south1",
  healthCheck: await timed("/", 10),
  databaseRead: await timed("/projects?ids=00000000-0000-0000-0000-000000000000", 10),
};
// The test suite's own JSON report (vitest writes it to a file).
const testsDir = fileURLToPath(new URL("../../tests", import.meta.url));
spawnSync("npx", ["vitest", "run", "--reporter=json"], {
  cwd: testsDir,
  encoding: "utf8",
  shell: process.platform === "win32",
});
const report = (() => {
  try {
    const json = JSON.parse(
      readFileSync(`${testsDir}/.vitest/json/output.json`, "utf8"),
    );
    return { tag: "measured", passed: json.numPassedTests, total: json.numTotalTests };
  } catch {
    return { tag: "measured", passed: null, total: null };
  }
})();

const result = {
  generatedAt: new Date().toISOString(),
  scenario: {
    ...DEMO_SCENARIO,
    days: DAYS,
    seeds: `${SEED}-${SEED + DAYS - 1}`,
    plant: DEMO_GRAPH.nodes
      .filter((node) => node.kind === "station")
      .map((node) => node.name),
  },
  outcomes: {
    tag: "simulated",
    standardRules: metrics(serverDays),
    aiCrew: crewDays ? metrics(crewDays) : null,
    aiCrewPlusTopFixes: crewPlusFixes ? metrics(crewPlusFixes) : null,
    topFixes: topTwo.map(({ title }) => title),
    playbookFidelityPct: fidelityPct,
  },
  fixes: { tag: "simulated", items: measured.map(({ machine: _, ...fix }) => fix) },
  costs: { tag: "estimated", lookupMs: costMs, estimates: costs },
  simulator,
  agentRun: {
    ...agentRun,
    standardSameDay: serverDays[0]!.completed,
  },
  latency,
  tests: report,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}benchmark.json`, JSON.stringify(result, null, 2));
console.log(`\nwrote ${OUT}benchmark.json`);
console.log(
  JSON.stringify(
    {
      standard: result.outcomes.standardRules.partsShipped,
      crew: result.outcomes.aiCrew?.partsShipped,
      crewPlusFixes: result.outcomes.aiCrewPlusTopFixes?.partsShipped,
      fidelityPct,
      decisions: agentRun.decisions,
      fallbacks,
      simulator,
      latency,
      tests: report,
    },
    null,
    1,
  ),
);
