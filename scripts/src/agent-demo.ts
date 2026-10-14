/**
 * Runs the demo factory twice on the same seed, once with the no-agent
 * baseline and once operated by Gemini agents, and prints both.
 *
 *   pnpm --filter @repo/scripts agent-demo [--seed 1] [--tick 30]
 *
 * Reads the model key from apps/api/.env (see apps/api/.env.example).
 */
import { parseArgs } from "node:util";
import { type Kpis, applyScenario, simulate } from "@repo/sim";
import { ROLES, createAgentPolicy } from "@repo/agent";
import { main } from "./lib/cli";
import { DEMO_AGENTS, DEMO_GRAPH, DEMO_SCENARIO } from "./lib/demo-factory";

const { values } = parseArgs({
  options: {
    seed: { type: "string", default: "1" },
    // Minutes between planner and supervisor check-ins.
    tick: { type: "string", default: "30" },
  },
});

const percent = (share: number) => `${(share * 100).toFixed(0)}%`;

function report(title: string, kpis: Kpis) {
  console.log(`\n${title}`);
  console.log(
    `  shipped ${kpis.completed}, scrapped ${kpis.scrapped}, ` +
      `${kpis.throughputPerHour.toFixed(1)}/h, average in progress ${kpis.averageWip.toFixed(1)}, ` +
      `bottleneck ${kpis.bottleneck}`,
  );
  for (const [id, station] of Object.entries(kpis.stations)) {
    console.log(
      `  ${id.padEnd(8)} busy ${percent(station.utilisation)}, blocked ${percent(station.blocked)}, ` +
        `down ${percent(station.down)}, idle ${percent(station.idle)}`,
    );
  }
}

await main(async () => {
  const scenario = applyScenario(DEMO_GRAPH, DEMO_SCENARIO);
  const config = {
    seed: Number(values.seed),
    horizon: scenario.horizon,
    maintenanceCrews: scenario.maintenanceCrews,
    tickInterval: Number(values.tick) * 60,
  };
  console.log(`Scenario: ${DEMO_SCENARIO.name}`);
  for (const adjustment of scenario.adjustments) {
    console.log(
      `  ${adjustment.node ?? "factory"} ${adjustment.param} x${adjustment.factor.toFixed(2)} (${adjustment.reason})`,
    );
  }

  const baseline = await simulate(scenario.graph, config);
  report("Baseline (no agents)", baseline.kpis);

  const targets = DEMO_SCENARIO.targets;
  const policy = createAgentPolicy({
    agents: DEMO_AGENTS,
    goal: `Ship at least ${targets?.throughputPerShift} parts in the ${DEMO_SCENARIO.shiftHours}-hour shift while keeping every station down less than ${percent(targets?.maxDownShare ?? 0)} of the time.`,
    onDecision: (record) => {
      const minutes = Math.round(record.time / 60);
      console.log(
        `  [${minutes} min] ${record.agent.name} (${ROLES[record.agent.role].title}): ` +
          `${record.options[record.choice]} — ${record.reason}`,
      );
    },
  });
  console.log("\nAgent decisions");
  const operated = await simulate(scenario.graph, config, policy);
  report(`With agents (${operated.decisions} decisions)`, operated.kpis);
});
