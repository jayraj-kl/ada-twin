import {
  type Adjustment,
  type FactoryGraph,
  type FactoryNode,
  type Kpis,
  type Param,
  type Playbook,
  type Scenario,
  type SimEvent,
  param,
} from "@repo/sim";
import { useCallback, useEffect, useState } from "react";
import {
  SERVER_KEYS,
  STATE_KEYS,
  setField,
  setState,
  useField,
  useLoadStatus,
  useStateValue,
} from "@/lib/project-store";
import { projectKey, useProjectId } from "@/lib/projects";
import { EXTRA_DEFAULTS, type Flow } from "./flow";

// A project's values, by the name each is stored under. The core of the
// project (SERVER_KEYS in lib/project-store.ts) is saved on the server; the
// rest still lives in this browser, under the project's own keys.
export const MACHINES_KEY = "twin-machines";
export const SCENARIO_KEY = "twin-scenario";
export const AGENTS_KEY = "twin-agents";
export const ACCEPTED_KEY = "twin-accepted";
// Cost estimates for recommended changes, by currency and change, so the web
// is not searched again each time the report opens.
export const COSTS_KEY = "twin-costs";
/** Each version of the redesign, oldest first. */
export const HISTORY_KEY = "twin-redesign-history";
export const DESIGN_CHAT_KEY = "twin-design-chat";
/** Each redesign applied to the twin, for the last step's report; newest last. */
export const APPLIED_KEY = "twin-applied";
/** The photo conversations of the last step, by applied redesign and view. */
export const PLANT_CHAT_KEY = "twin-plant-chat";
/** How many days every average on the results and plant steps is taken over. */
export const DAYS_KEY = "twin-days";
export const DEFAULT_DAYS = 10;
// The most the API averages standard rules over.
export const MAX_DAYS = 60;

// Written by `pnpm --filter @repo/scripts fetch-world <worldId>`.
export const WORLD_DIR = "/worlds/current";
export const CAMERA_HEIGHT_M = 1.65;

export type Point = [number, number, number];

/** A machine as the twin step saves it. */
export interface SavedMachine {
  id: string;
  name: string;
  count?: number;
  pins?: Point[];
  params?: Partial<Record<StationParamKey, Param>>;
  /**
   * Support equipment, such as a control cabinet: parts never pass through
   * it, but what needs it stops when it fails.
   */
  auxiliary?: boolean;
  /** Marked auxiliary by the AI draft, and not yet confirmed by the user. */
  auxiliarySuggested?: boolean;
  /** Its colour on the twin step's pins and flow. */
  color?: string;
  /** For auxiliary equipment: standby units among `count`. */
  spares?: number;
  /** New equipment an applied redesign added, still to be pinned. */
  added?: "redesign";
}

// `shown` is the unit the user edits in, and how many stored units make one.
export const STATION_PARAMS = [
  {
    key: "cycleTime",
    label: "Cycle time",
    unit: "s",
    fallback: 120,
    shown: { suffix: "s", per: 1 },
  },
  {
    key: "cycleTimeVariation",
    label: "Cycle time variation",
    unit: "share",
    fallback: 0.25,
    shown: { suffix: "%", per: 0.01 },
  },
  {
    key: "mtbf",
    label: "Time between failures",
    unit: "s",
    fallback: 4 * 3600,
    shown: { suffix: "h", per: 3600 },
  },
  {
    key: "mttr",
    label: "Time to repair",
    unit: "s",
    fallback: 20 * 60,
    shown: { suffix: "min", per: 60 },
  },
  {
    key: "scrapRate",
    label: "Scrap rate",
    unit: "share",
    fallback: 0.01,
    shown: { suffix: "%", per: 0.01 },
  },
] as const;

export type StationParamKey = (typeof STATION_PARAMS)[number]["key"];

/** The parameters a machine is simulated with: auxiliary ones only fail. */
export function paramsFor(machine: Pick<SavedMachine, "auxiliary">) {
  return machine.auxiliary
    ? STATION_PARAMS.filter(({ key }) => key === "mtbf" || key === "mttr")
    : STATION_PARAMS;
}

/** A station's number, or the assumed default while nobody has set one. */
export function stationParam(
  machine: SavedMachine,
  key: StationParamKey,
): Param {
  const spec = STATION_PARAMS.find((candidate) => candidate.key === key)!;
  return machine.params?.[key] ?? param(spec.fallback, spec.unit);
}

/** The twin as the simulation takes it. */
export function buildGraph(machines: SavedMachine[], flow: Flow): FactoryGraph {
  const nodes: FactoryNode[] = [
    ...machines.map((machine): FactoryNode => {
      const common = {
        id: machine.id,
        name: machine.name,
        units: param(machine.count ?? 1, "units", { kind: "user" }),
        mtbf: stationParam(machine, "mtbf"),
        mttr: stationParam(machine, "mttr"),
      };
      if (machine.auxiliary) {
        return {
          ...common,
          kind: "support",
          ...(machine.spares
            ? { spares: param(machine.spares, "units", { kind: "user" }) }
            : {}),
        };
      }
      return {
        ...common,
        kind: "station",
        cycleTime: stationParam(machine, "cycleTime"),
        cycleTimeVariation: stationParam(machine, "cycleTimeVariation"),
        scrapRate: stationParam(machine, "scrapRate"),
      };
    }),
    ...flow.extras.map(({ id, kind, name, value }): FactoryNode => {
      if (kind === "sink") return { id, kind, name };
      const amount = param(value ?? EXTRA_DEFAULTS[kind].value, "s");
      return kind === "source"
        ? { id, kind, name, interArrival: amount }
        : { id, kind, name, capacity: { ...amount, unit: "parts" } };
    }),
  ];
  return {
    nodes,
    edges: flow.links.map(({ from, to }) => ({ from, to })),
    dependencies: (flow.needs ?? []).map(({ from, to }) => ({
      support: from,
      neededBy: to,
    })),
  };
}

export const DEFAULT_SCENARIO: Scenario = {
  name: "Hot week, full order book",
  shiftHours: 8,
  demandPerShift: 340,
  ambientTempC: 34,
  supplyDisruption: 0,
  absenteeism: 0,
  maintenanceCrews: 1,
  targets: { throughputPerShift: 300, maxAverageWip: 15, maxDownShare: 0.1 },
};

// These mirror the shapes the API's /run route sends and accepts.
export type Role = "planner" | "maintenance" | "supervisor";
export type Persona = "cautious" | "aggressive" | "by-the-book";

export interface AgentSpec {
  id: string;
  name: string;
  role: Role;
  persona: Persona;
  trait?: string;
}

export const ROLE_INFO: Record<
  Role,
  { title: string; decides: string; colour: string }
> = {
  planner: {
    title: "Production planner",
    decides: "How fast new work is released into the line.",
    colour: "#f59e0b",
  },
  maintenance: {
    title: "Maintenance technician",
    decides: "Which station a free crew goes to next.",
    colour: "#22d3ee",
  },
  supervisor: {
    title: "Shift supervisor",
    decides: "Whether to service a station before it fails.",
    colour: "#c084fc",
  },
};

export const PERSONA_LABELS: Record<Persona, string> = {
  cautious: "Cautious",
  aggressive: "Aggressive",
  "by-the-book": "By the book",
};

export const DEFAULT_AGENTS: AgentSpec[] = [
  {
    id: "planner-1",
    name: "Priya",
    role: "planner",
    persona: "aggressive",
    trait: "You hate seeing the order book slip.",
  },
  {
    id: "maintenance-1",
    name: "Marek",
    role: "maintenance",
    persona: "by-the-book",
  },
  {
    id: "supervisor-1",
    name: "Sam",
    role: "supervisor",
    persona: "cautious",
    trait: "You have seen the boilers fail on hot days before.",
  },
];

export interface CrewSettings {
  agents: AgentSpec[];
  /** Minutes between planner and supervisor check-ins. */
  tickMinutes: number;
}

export const DEFAULT_CREW: CrewSettings = {
  agents: DEFAULT_AGENTS,
  tickMinutes: 30,
};

export interface DecisionRecord {
  agent: AgentSpec;
  kind: string;
  time: number;
  options: string[];
  choice: number;
  reason: string;
  fallback?: string;
}

/** One finished run of the shift, kept for the replay and the report. */
export interface StoredRun {
  seed: number;
  horizon: number;
  maintenanceCrews: number;
  tickMinutes: number;
  scenario: Scenario;
  /** The twin the run was made on, before the scenario's adjustments. */
  graph: FactoryGraph;
  agents: AgentSpec[];
  adjustments: Adjustment[];
  /** Standard rules on the run's own seed, the day the agents worked. */
  baseline: Kpis;
  /**
   * Standard rules on each day averaged, from the run's seed on; the first is
   * `baseline`. Missing from runs made before days were averaged.
   */
  days?: Kpis[];
  kpis: Kpis;
  events: SimEvent[];
  decisions: DecisionRecord[];
  /**
   * The crew's way of working as fixed rules, written after the shift; null if
   * it could not be written, missing with no agents or while it is written.
   */
  playbook?: Playbook | null;
}

/** The standard-rules days of a run; just its own seed for older runs. */
export const daysOf = (run: StoredRun) => run.days ?? [run.baseline];

/**
 * A value of the current project. The project's core and its page state are
 * saved on the server (loaded before any step shows, so they are ready at
 * once); a few browser-only settings stay in this browser. `loaded` turns
 * true once the saved value, if any, has been read; until then the value is
 * the fallback.
 */
export function useStored<T>(name: string, fallback: T) {
  const projectId = useProjectId();
  const field = SERVER_KEYS[name as keyof typeof SERVER_KEYS] ?? null;
  const stateKey = !field && STATE_KEYS.has(name) ? name : null;
  const onServer = field !== null || stateKey !== null;
  const local = useLocalStored(
    onServer ? null : projectKey(projectId, name),
    fallback,
  );
  const savedField = useField(projectId, field);
  const savedState = useStateValue(projectId, stateKey);
  const status = useLoadStatus(projectId);
  const storeServer = useCallback(
    (next: T) => {
      if (field) setField(projectId, field, next);
      else if (stateKey) setState(projectId, stateKey, next);
    },
    [projectId, field, stateKey],
  );
  if (!onServer) return local;
  const saved = field ? savedField : savedState;
  // A value the project never set reads as the fallback, as an unset key did.
  const value = saved === undefined || saved === null ? fallback : (saved as T);
  return [value, storeServer, status === "ready"] as const;
}

/** A value kept in this browser's storage under `key`; null keeps nothing. */
function useLocalStored<T>(key: string | null, fallback: T) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (key === null) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) setValue(JSON.parse(saved) as T);
    } catch {
      // A private window or corrupt entry just starts from the fallback.
    }
    setLoaded(true);
  }, [key]);

  const store = useCallback(
    (next: T) => {
      setValue(next);
      if (key === null) return;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not being able to save is not worth interrupting the user for.
      }
    },
    [key],
  );
  return [value, store, loaded] as const;
}

export function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

export const percent = (share: number) => `${Math.round(share * 100)}%`;
