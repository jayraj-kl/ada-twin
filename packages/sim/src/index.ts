export { averageKpis, simulateDays, spread, type Spread } from "./days";

export { shiftCapacity, type Capacity } from "./capacity";

export { applyDiffs, type GraphDiff, type NewMachineParams } from "./diff";

export {
  param,
  validateGraph,
  type Anchor,
  type Baseline,
  type BufferNode,
  type Dependency,
  type DocumentKind,
  type Edge,
  type FactoryGraph,
  type FactoryNode,
  type Param,
  type Provenance,
  type SinkNode,
  type SourceNode,
  type StationNode,
  type SupportNode,
} from "./graph";

export {
  defaultPolicy,
  simulate,
  type CrewJob,
  type Decision,
  type DecisionRequest,
  type Policy,
  type Role,
  type RunResult,
  type SimConfig,
  type SimEvent,
  type Snapshot,
  type StationStatus,
  type TickAction,
} from "./kernel";

export {
  totalCrew,
  type CrewWork,
  type Kpis,
  type StationKpis,
  type SupportKpis,
} from "./kpi";

export {
  applyScenario,
  type Adjustment,
  type AppliedScenario,
  type Scenario,
} from "./scenario";

export {
  prepareShift,
  simulateShiftDays,
  type ChangeSet,
  type PreparedShift,
  type Shift,
} from "./shift";

export {
  givenNumbers,
  traceNumbers,
  type NumberSource,
  type TracedPiece,
} from "./trace";

export {
  EMPTY_PLAYBOOK,
  playbookPolicy,
  type Playbook,
} from "./playbook";

export {
  citationsOf,
  dutyOf,
  rangeStatus,
  type Citation,
  type RangeStatus,
} from "./citation";

export {
  COST_RATES,
  SHIFTS_PER_YEAR,
  USD_INR,
  agentsVsRules,
  inCurrency,
  machineMoney,
  shiftMoney,
  type AgentsVsRules,
  type CostRateKey,
  type CostRates,
  type Currency,
  type ShiftMoney,
} from "./cost";
