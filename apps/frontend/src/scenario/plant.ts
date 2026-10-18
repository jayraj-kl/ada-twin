import { type Capacity, type FactoryGraph, type Scenario, shiftCapacity } from "@repo/sim";
import { useMemo } from "react";
import { useStateValue } from "@/lib/project-store";
import { useProjectId, useProjects } from "@/lib/projects";
import { DEFAULT_SCENARIO, SCENARIO_KEY, useStored } from "@/twin/project";
import { SAMPLE_WORLD_KEY, sampleOf } from "@/twin/sample";

/** What a plant makes, when nothing says otherwise. */
export const DEFAULT_UNIT = "parts";

/** What this project's plant makes, plural: "parts", "batches", "motors". */
export function usePlantUnit(): string {
  const projectId = useProjectId();
  const project = useProjects().find(({ id }) => id === projectId);
  const slug = useStateValue(projectId, SAMPLE_WORLD_KEY);
  return project?.sample ? sampleOf(slug).unit : DEFAULT_UNIT;
}

/** Rounds to a figure a person would pick: 7, 45, 210, 1 300. */
function nice(value: number) {
  const step = value < 20 ? 1 : value < 200 ? 5 : value < 2000 ? 10 : 100;
  return Math.max(1, Math.round(value / step) * step);
}

/**
 * The starting scenario, sized to the plant: a full order book of about 110%
 * of what its bottleneck can make in the shift, a target of about 90%, and
 * room for about three times the work in progress the line needs at that
 * pace. A plant with no flow yet gets the fixed default.
 */
export function plantScenario(graph: FactoryGraph, unit: string): Scenario {
  const base: Scenario = { ...DEFAULT_SCENARIO, unit };
  const capacity = shiftCapacity(graph, base.shiftHours);
  if (!capacity || !Number.isFinite(capacity.perShift)) return base;
  return {
    ...base,
    demandPerShift: nice(capacity.perShift * 1.1),
    targets: {
      ...base.targets,
      throughputPerShift: nice(capacity.perShift * 0.9),
      maxAverageWip: Math.max(3, Math.ceil(capacity.minimumWip * 3)),
    },
  };
}

/**
 * The project's scenario. Until someone sets it (on the scenario step, or by
 * running a shift on it), it is the plant-sized default and follows the twin
 * as it changes; from then on it is what was saved.
 */
export function usePlantScenario(graph: FactoryGraph) {
  const unit = usePlantUnit();
  const [stored, setScenario, loaded] = useStored<Scenario | null>(
    SCENARIO_KEY,
    null,
  );
  const fallback = useMemo(() => plantScenario(graph, unit), [graph, unit]);
  const capacity: Capacity | undefined = useMemo(
    () => shiftCapacity(graph, (stored ?? fallback).shiftHours),
    [graph, stored, fallback],
  );
  return {
    scenario: stored ?? fallback,
    setScenario,
    /** Whether the scenario has been set, rather than the default shown. */
    saved: stored !== null,
    loaded,
    /** What the plant makes in this scenario's shift, if it can be told. */
    capacity,
    /** The scenario's unit, or the plant's for one saved without it. */
    unit: stored?.unit ?? unit,
  };
}
