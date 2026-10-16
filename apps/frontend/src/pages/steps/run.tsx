import type { Scenario, StationStatus } from "@repo/sim";
import { Link } from "react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Flyer } from "@/components/viewer/FlyerOverlay";
import { WorldView } from "@/components/viewer/WorldView";
import { streamRun } from "@/twin/api";
import { EMPTY_FLOW, FLOW_KEY, type Flow, flowProblems } from "@/twin/flow";
import {
  AGENTS_KEY,
  CAMERA_HEIGHT_M,
  type CrewSettings,
  DEFAULT_CREW,
  DEFAULT_SCENARIO,
  type DecisionRecord,
  MACHINES_KEY,
  type Point,
  ROLE_INFO,
  RUN_KEY,
  SCENARIO_KEY,
  type SavedMachine,
  type StoredRun,
  WORLD_DIR,
  buildGraph,
  clock,
  useStored,
} from "@/twin/project";
import { useProjectPath } from "@/lib/projects";
import { NumberField } from "@/components/ui/number-field";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

const NO_MACHINES: SavedMachine[] = [];
// Simulated seconds played per real second; the middle one plays an
// eight-hour shift in two minutes.
const SPEEDS = [120, 240, 480, 960];
// The world is Y-down, so flying above a pin means a smaller Y.
const FLY_HEIGHT = 0.45;
const CIRCLE_RADIUS = 0.3;

const STATUS_STYLE: Record<StationStatus, keyof typeof ui> = {
  idle: "idle",
  running: "running",
  blocked: "blocked",
  down: "down",
  repairing: "down",
  preventive: "blocked",
  stopped: "stopped",
};
const STATUS_WORD: Partial<Record<StationStatus, string>> = {
  blocked: "blocked",
  down: "down",
  repairing: "under repair",
  preventive: "being serviced",
  stopped: "stopped, needs auxiliary",
};

const above = ([x, y, z]: Point): Point => [x, y - FLY_HEIGHT, z];

/** A small loop over a station, for an agent that is working on it. */
function circle(centre: Point): Point[] {
  return Array.from({ length: 8 }, (_, step): Point => {
    const angle = (step / 8) * Math.PI * 2;
    return [
      centre[0] + Math.cos(angle) * CIRCLE_RADIUS,
      centre[1] - FLY_HEIGHT,
      centre[2] + Math.sin(angle) * CIRCLE_RADIUS,
    ];
  });
}

function centroid(pins: Point[]): Point {
  const sum = pins.reduce(
    (total, pin) => [total[0] + pin[0], total[1] + pin[1], total[2] + pin[2]],
    [0, 0, 0],
  );
  return [sum[0]! / pins.length, sum[1]! / pins.length, sum[2]! / pins.length];
}

function Decision({ record }: { record: DecisionRecord }) {
  return (
    <div
      className={ui.feedItem}
      style={{ borderLeftColor: ROLE_INFO[record.agent.role].colour }}
    >
      <div className={ui.spread}>
        <span className={ui.feedWho}>{record.agent.name}</span>
        <span className={ui.feedMeta}>
          {ROLE_INFO[record.agent.role].title} · {clock(record.time)}
        </span>
      </div>
      <div>{record.options[record.choice]}</div>
      <div className={ui.quote}>
        {record.fallback
          ? `Standard rule used: ${record.fallback}`
          : `“${record.reason}”`}
      </div>
    </div>
  );
}

export default function RunPage() {
  const path = useProjectPath();
  const [machines, , machinesLoaded] = useStored(MACHINES_KEY, NO_MACHINES);
  const [flow] = useStored<Flow>(FLOW_KEY, EMPTY_FLOW);
  const [scenario] = useStored<Scenario>(SCENARIO_KEY, DEFAULT_SCENARIO);
  const [crew] = useStored<CrewSettings>(AGENTS_KEY, DEFAULT_CREW);
  const [run, setRun] = useStored<StoredRun | null>(RUN_KEY, null);

  const [seed, setSeed] = useState(1);
  const [live, setLive] = useState<{
    decisions: DecisionRecord[];
    horizon: number;
  } | null>(null);
  const [problem, setProblem] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(SPEEDS[1]!);
  const cancel = useRef<AbortController | null>(null);

  const graph = useMemo(() => buildGraph(machines, flow), [machines, flow]);
  const problems = useMemo(
    () =>
      flowProblems(
        graph.nodes.map(({ id, kind, name }) => ({ id, kind, name })),
        flow.links,
        flow.needs,
      ),
    [graph, flow.links, flow.needs],
  );
  const ready = machines.length > 0 && problems.length === 0;

  async function start() {
    setProblem("");
    setPlaying(false);
    setLive({ decisions: [], horizon: scenario.shiftHours * 3600 });
    const controller = new AbortController();
    cancel.current = controller;
    const decisions: DecisionRecord[] = [];
    let opening: Pick<
      StoredRun,
      "horizon" | "maintenanceCrews" | "adjustments" | "baseline"
    > | null = null;
    try {
      await streamRun(
        {
          graph,
          scenario,
          agents: crew.agents,
          seed,
          tickMinutes: crew.tickMinutes,
        },
        (line) => {
          if (line.type === "start") {
            opening = line;
          } else if (line.type === "decision") {
            decisions.push(line.record);
            setLive({
              decisions: [...decisions],
              horizon: opening?.horizon ?? scenario.shiftHours * 3600,
            });
          } else if (line.type === "error") {
            throw new Error(line.message);
          } else if (opening) {
            setRun({
              ...opening,
              seed,
              tickMinutes: crew.tickMinutes,
              scenario,
              graph,
              agents: crew.agents,
              kpis: line.kpis,
              events: line.events,
              decisions,
            });
            setTime(0);
            setPlaying(true);
          }
        },
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setProblem(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setLive(null);
    }
  }

  // Stops a run in flight when the page is left.
  useEffect(() => () => cancel.current?.abort(), []);

  const horizon = run?.horizon ?? scenario.shiftHours * 3600;
  useEffect(() => {
    if (!playing) return;
    const started = performance.now();
    const from = time;
    const timer = setInterval(() => {
      const next = from + ((performance.now() - started) / 1000) * speed;
      if (next >= horizon) {
        setTime(horizon);
        setPlaying(false);
      } else {
        setTime(next);
      }
    }, 100);
    return () => clearInterval(timer);
    // `time` is only the starting point; re-running on every tick would
    // restart the clock ten times a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, horizon]);

  // The state of the floor at the playhead.
  const floor = useMemo(() => {
    const statuses = new Map<string, StationStatus>();
    // Keyed by node and unit: crews can work on two units of one auxiliary.
    const jobs = new Map<string, string>();
    let created = 0;
    let shipped = 0;
    let scrapped = 0;
    for (const event of run?.events ?? []) {
      if (event.time > time) break;
      if (event.type === "status") statuses.set(event.node, event.status);
      else if (event.type === "created") created += 1;
      else if (event.type === "completed") shipped += 1;
      else if (event.type === "scrap") scrapped += 1;
      else if (
        event.type === "repair-start" ||
        event.type === "preventive-start"
      ) {
        jobs.set(`${event.node}#${event.unit ?? 0}`, event.node);
      } else if (
        event.type === "repair-end" ||
        event.type === "preventive-end"
      ) {
        jobs.delete(`${event.node}#${event.unit ?? 0}`);
      }
    }
    return {
      statuses,
      jobs: [...jobs.values()],
      shipped,
      scrapped,
      wip: created - shipped - scrapped,
    };
  }, [run, time]);

  // Pinned machines in the order material reaches them.
  const stops = useMemo(
    () =>
      machines
        .filter((machine) => (machine.pins?.length ?? 0) > 0)
        .map((machine) => ({
          id: machine.id,
          name: machine.name,
          point: centroid(machine.pins!),
          row: flow.positions[machine.id]?.y ?? 0,
          auxiliary: machine.auxiliary ?? false,
        }))
        .sort((a, b) => a.row - b.row),
    [machines, flow.positions],
  );

  const jobsKey = floor.jobs.join("\n");
  const flyers = useMemo((): Flyer[] => {
    if (stops.length === 0) return [];
    const jobs = jobsKey ? jobsKey.split("\n") : [];
    // Parts never pass auxiliary machines, so nobody walks the line past
    // them; a technician still flies out to repair one.
    const line = stops.filter(({ auxiliary }) => !auxiliary);
    const rounds = (line.length > 0 ? line : stops).map((stop) =>
      above(stop.point),
    );
    const technicians = crew.agents.filter(
      (agent) => agent.role === "maintenance",
    );
    return crew.agents.map((agent, index) => {
      const colour = ROLE_INFO[agent.role].colour;
      // A technician flies to the station their crew is working on and
      // circles it; everyone else walks the line.
      const job =
        agent.role === "maintenance"
          ? stops.find(({ id }) => id === jobs[technicians.indexOf(agent)])
          : undefined;
      if (job) return { id: agent.id, colour, waypoints: circle(job.point) };
      if (rounds.length === 1) {
        const [x, y, z] = rounds[0]!;
        return {
          id: agent.id,
          colour,
          waypoints: circle([x, y + FLY_HEIGHT, z]),
        };
      }
      // Planners walk the line against the flow, and each agent starts at a
      // different station, so the planes spread out.
      const route = agent.role === "planner" ? [...rounds].reverse() : rounds;
      const offset = index % route.length;
      return {
        id: agent.id,
        colour,
        waypoints: [...route.slice(offset), ...route.slice(0, offset)],
      };
    });
  }, [stops, crew.agents, jobsKey]);

  const items = stops.map((stop) => {
    const status = floor.statuses.get(stop.id);
    return {
      id: stop.id,
      position: stop.point,
      content: (
        <div className={ui.pin}>
          <span
            className={cn(ui.dot, status ? ui[STATUS_STYLE[status]] : "")}
          />
          {stop.name}
          {status && STATUS_WORD[status] && ` · ${STATUS_WORD[status]}`}
        </div>
      ),
    };
  });

  const decisions = live
    ? [...live.decisions].reverse()
    : (run?.decisions ?? []).filter((record) => record.time <= time).reverse();
  const stopped = [...floor.statuses]
    .filter(
      ([, status]) =>
        status === "down" || status === "repairing" || status === "stopped",
    )
    .map(([id]) => machines.find((machine) => machine.id === id)?.name ?? id);
  const liveTime = live?.decisions.at(-1)?.time ?? 0;
  const targets = scenario.targets;
  const checkIns = Math.floor((scenario.shiftHours * 60) / crew.tickMinutes);
  const askers = new Set(
    crew.agents
      .map(({ role }) => role)
      .filter((role) => role !== "maintenance"),
  ).size;

  return (
    <>
      <p className={ui.eyebrow}>Step 5 · Run</p>
      <h1 className={ui.title}>The shift, as it happens</h1>
      <p className={ui.lede}>
        Each paper plane is one of your agents moving around the floor; a
        maintenance technician flies to the station their crew is working on.
        Pins show each station&apos;s state, and every decision appears on the
        right with its reasoning. Scrub the timeline to replay any moment.
      </p>

      <div className={ui.grid3} style={{ marginBottom: 20 }}>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>Shipped so far</div>
          <div className={ui.kpiValue}>
            {run && !live ? floor.shipped : "–"}
          </div>
          <div className={ui.delta}>
            {targets?.throughputPerShift
              ? `target ${targets.throughputPerShift} by end of shift`
              : "no target set"}
          </div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>Work in progress</div>
          <div className={ui.kpiValue}>
            {run && !live ? floor.wip : "–"}
          </div>
          <div className={ui.delta}>
            {targets?.maxAverageWip
              ? `limit ${targets.maxAverageWip}`
              : "no limit set"}
          </div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>Stopped right now</div>
          <div className={ui.kpiValue}>
            {run && !live ? stopped.join(", ") || "Nothing" : "–"}
          </div>
          <div
            className={cn(ui.delta, stopped.length > 0 ? ui.poor : "")}
          >
            {run && !live
              ? `${floor.scrapped} parts scrapped so far`
              : "run the shift to see"}
          </div>
        </div>
      </div>

      <div className={ui.grid2}>
        <div className={ui.stack}>
          <WorldView
            worldDir={WORLD_DIR}
            cameraHeightMetres={CAMERA_HEIGHT_M}
            items={items}
            flyers={flyers}
            flyersMoving={Boolean(live) || playing}
            style={{
              aspectRatio: "16 / 10",
              borderRadius: 10,
              overflow: "hidden",
              cursor: "grab",
            }}
          />
          <div className={ui.row} style={{ flexWrap: "wrap" }}>
            {crew.agents.map((agent) => (
              <span key={agent.id} className={ui.hint}>
                <span
                  className={ui.dot}
                  style={{ background: ROLE_INFO[agent.role].colour }}
                />{" "}
                {agent.name}, {ROLE_INFO[agent.role].title.toLowerCase()}
              </span>
            ))}
            {machinesLoaded && stops.length === 0 && (
              <span className={ui.poor}>
                No machine is pinned in the 3D world, so there is nowhere for
                the agents to fly. Pin them in the twin step.
              </span>
            )}
          </div>

          <div className={ui.panel}>
            {live ? (
              <>
                <div className={ui.spread} style={{ marginBottom: 10 }}>
                  <strong>
                    Simulating… {clock(liveTime)} / {clock(live.horizon)}
                  </strong>
                  <button
                    className={ui.button}
                    onClick={() => cancel.current?.abort()}
                  >
                    Cancel
                  </button>
                </div>
                <div className={ui.timeline}>
                  <div
                    style={{ width: `${(liveTime / live.horizon) * 100}%` }}
                  />
                </div>
                <p className={ui.hint} style={{ marginTop: 8 }}>
                  The agents are deciding now; each decision is a question to
                  Gemini. The replay starts when the shift is over.
                </p>
              </>
            ) : run ? (
              <>
                <div className={ui.spread} style={{ marginBottom: 10 }}>
                  <strong>
                    {clock(time)} / {clock(horizon)}
                  </strong>
                  <span className={ui.hint}>
                    <span className={cn(ui.dot, ui.running)} />{" "}
                    running{" "}
                    <span className={cn(ui.dot, ui.blocked)} />{" "}
                    blocked or serviced{" "}
                    <span className={cn(ui.dot, ui.down)} /> down{" "}
                    <span className={cn(ui.dot, ui.stopped)} />{" "}
                    stopped by auxiliary{" "}
                    <span className={cn(ui.dot, ui.idle)} /> idle
                  </span>
                </div>
                <input
                  type="range"
                  aria-label="Time into the shift"
                  style={{ width: "100%" }}
                  min={0}
                  max={horizon}
                  step={60}
                  value={time}
                  onChange={(event) => {
                    setPlaying(false);
                    setTime(Number(event.target.value));
                  }}
                />
                <div className={ui.row} style={{ marginTop: 10 }}>
                  <button
                    className={ui.button}
                    onClick={() => {
                      if (!playing && time >= horizon) setTime(0);
                      setPlaying(!playing);
                    }}
                  >
                    {playing ? "Pause" : time >= horizon ? "Replay" : "Play"}
                  </button>
                  <label htmlFor="speed" className={ui.hint}>
                    Speed
                  </label>
                  <select
                    id="speed"
                    className={ui.input}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                  >
                    {SPEEDS.map((option) => (
                      <option key={option} value={option}>
                        {Math.round(horizon / option / 60) || 1} min for the
                        shift
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <p className={ui.hint}>
                Nothing has run yet. A run asks Gemini about {checkIns * askers}{" "}
                planning questions plus one per breakdown, which takes a few
                minutes.
              </p>
            )}
          </div>
        </div>

        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            Decisions
            <span className={ui.hint}>{decisions.length} so far</span>
          </div>
          {decisions.length === 0 ? (
            <p className={ui.hint}>
              {crew.agents.length === 0
                ? "There are no agents, so every role follows standard rules."
                : "Decisions appear here as the agents make them."}
            </p>
          ) : (
            <div className={ui.feed}>
              {decisions.map((record, index) => (
                <Decision
                  key={`${record.time}-${record.agent.id}-${index}`}
                  record={record}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {problem && (
        <p className={ui.poor} style={{ marginTop: 16 }}>
          The run failed: {problem}
        </p>
      )}
      {machinesLoaded && !ready && (
        <p className={ui.poor} style={{ marginTop: 16 }}>
          The twin cannot be simulated yet: finish its material flow in the{" "}
          <Link to={path("twin")}>twin step</Link>.
        </p>
      )}

      <div className={ui.actions}>
        <button
          className={cn(ui.button, run ? "" : ui.primary)}
          disabled={!ready || Boolean(live)}
          onClick={start}
        >
          {live ? "Running…" : run ? "Run the shift again" : "Run the shift"}
        </button>
        {run && !live && (
          <Link
            to={path("report")}
            className={cn(ui.button, ui.primary)}
          >
            See the report
          </Link>
        )}
        <Link to={path("agents")} className={ui.button}>
          Back
        </Link>
        <span className={ui.row} style={{ marginLeft: "auto" }}>
          <label htmlFor="seed" className={ui.hint}>
            Random seed
          </label>
          <NumberField
            id="seed"
            size="sm"
            className="w-28"
            min={1}
            value={seed}
            onValueChange={(next) => setSeed(next || 1)}
          />
        </span>
      </div>
    </>
  );
}
