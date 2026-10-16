import type { Kpis, Scenario } from "@repo/sim";
import { Link } from "react-router";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";
import { WorldView } from "@/components/viewer/WorldView";
import { EMPTY_FLOW, FLOW_KEY, type Flow } from "@/twin/flow";
import {
  ACCEPTED_KEY,
  CAMERA_HEIGHT_M,
  DEFAULT_SCENARIO,
  MACHINES_KEY,
  type Point,
  RUN_KEY,
  SCENARIO_KEY,
  type SavedMachine,
  type StoredRun,
  WORLD_DIR,
  percent,
  useStored,
} from "@/twin/project";
import {
  type MeasuredChange,
  applyToTwin,
  measure,
} from "@/twin/recommend";
import { useProjectPath } from "@/lib/projects";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

const NOTHING_ACCEPTED: MeasuredChange[] = [];
const NO_MACHINES: SavedMachine[] = [];

export default function RedesignPage() {
  const path = useProjectPath();
  const navigate = useNavigate();
  const [run, , loaded] = useStored<StoredRun | null>(RUN_KEY, null);
  const [accepted, setAccepted] = useStored(ACCEPTED_KEY, NOTHING_ACCEPTED);
  const [machines, setMachines] = useStored(MACHINES_KEY, NO_MACHINES);
  const [flow, setFlow] = useStored<Flow>(FLOW_KEY, EMPTY_FLOW);
  const [scenario, setScenario] = useStored<Scenario>(
    SCENARIO_KEY,
    DEFAULT_SCENARIO,
  );
  const [expected, setExpected] = useState<Kpis | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!run || accepted.length === 0) return;
    let cancelled = false;
    setExpected(null);
    measure(run, accepted).then(
      (kpis) => !cancelled && setExpected(kpis),
      (error: unknown) =>
        !cancelled &&
        setProblem(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [run, accepted]);

  if (!run || accepted.length === 0) {
    return (
      <>
        <p className={ui.eyebrow}>Step 7 · Redesign</p>
        <h1 className={ui.title}>No changes have been accepted yet</h1>
        <p className={ui.lede}>
          {loaded
            ? "Accept one or more recommendations in the report to see the plant with them in it."
            : "Loading…"}
        </p>
        <div className={ui.actions}>
          <Link
            to={path(run ? "report" : "run")}
            className={cn(ui.button, ui.primary)}
          >
            {run ? "Back to the report" : "Run the shift"}
          </Link>
        </div>
      </>
    );
  }

  const { baseline } = run;
  const target = run.scenario.targets?.throughputPerShift;
  const names = new Map(run.graph.nodes.map(({ id, name }) => [id, name]));
  // What each changed machine's pin says about it.
  const notes = new Map<string, string>();
  for (const diff of accepted.flatMap(({ diffs }) => diffs)) {
    if (diff.type === "add-units") notes.set(diff.station, "+1 unit");
    else if (diff.type === "set-param") notes.set(diff.node, "faster repairs");
  }
  const items = machines
    .filter((machine) => (machine.pins?.length ?? 0) > 0)
    .map((machine) => {
      const note = notes.get(machine.id);
      return {
        id: machine.id,
        position: machine.pins![0] as Point,
        content: (
          <div className={ui.pin}>
            <span
              className={cn(ui.dot, note ? ui.blocked : ui.running)}
            />
            {machine.name}
            {note && ` · ${note}`}
          </div>
        ),
      };
    });

  const sum = accepted.reduce((total, change) => total + change.gain, 0);
  const gain = expected ? expected.completed - baseline.completed : null;
  const bottleneck = baseline.bottleneck ?? "";

  function apply() {
    const next = applyToTwin({ machines, flow, scenario }, accepted);
    setMachines(next.machines);
    setFlow(next.flow);
    setScenario(next.scenario);
    setAccepted([]);
    navigate(path("run"));
  }

  return (
    <>
      <p className={ui.eyebrow}>Step 7 · Redesign</p>
      <h1 className={ui.title}>The plant with your changes in it</h1>
      <p className={ui.lede}>
        The accepted changes are made to a copy of your twin and the same shift
        is simulated again, so you see what they do together before anything is
        bought or moved.
      </p>

      <div className={ui.grid3} style={{ marginBottom: 20 }}>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>Parts per shift</div>
          <div className={ui.kpiValue}>
            {expected ? expected.completed : "…"}
          </div>
          <div className={ui.delta}>
            was {baseline.completed}
            {gain !== null && (
              <>
                {" "}
                ·{" "}
                <span className={gain > 0 ? ui.good : ui.poor}>
                  {gain > 0 ? "+" : ""}
                  {gain}
                </span>
              </>
            )}
          </div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>Bottleneck</div>
          <div className={ui.kpiValue}>
            {expected ? (names.get(expected.bottleneck ?? "") ?? "None") : "…"}
          </div>
          <div className={ui.delta}>
            was {names.get(bottleneck) ?? "none"}
          </div>
        </div>
        <div className={ui.kpi}>
          <div className={ui.kpiLabel}>
            {target
              ? `Against target of ${target}`
              : "Average work in progress"}
          </div>
          <div className={ui.kpiValue}>
            {!expected
              ? "…"
              : target
                ? percent(expected.completed / target)
                : expected.averageWip.toFixed(1)}
          </div>
          <div className={ui.delta}>
            {expected && target ? (
              <span
                className={
                  expected.completed >= target ? ui.good : ui.poor
                }
              >
                {expected.completed >= target
                  ? "met"
                  : `${target - expected.completed} short`}
              </span>
            ) : (
              "on standard rules"
            )}
          </div>
        </div>
      </div>
      {problem && <p className={ui.poor}>{problem}</p>}

      <div className={ui.grid2}>
        <div className={ui.stack}>
          <WorldView
            worldDir={WORLD_DIR}
            cameraHeightMetres={CAMERA_HEIGHT_M}
            items={items}
            style={{
              aspectRatio: "16 / 10",
              borderRadius: 10,
              overflow: "hidden",
              cursor: "grab",
            }}
          />
          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              A new 3D world with the equipment in it
              <span className={ui.hint}>not connected yet</span>
            </div>
            <p className={ui.hint}>
              The view above is your current world with the changed machines
              marked. Drawing the new equipment into your photo and generating a
              fresh world from it needs an image model and about 3,000 World
              Labs credits per world, and is not built.
            </p>
          </div>
        </div>

        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            Accepted changes
            <span className={ui.hint}>
              {gain !== null &&
                `together ${gain > 0 ? "+" : ""}${gain}, one by one they add up to ${sum > 0 ? "+" : ""}${sum}`}
            </span>
          </div>
          <table className={ui.table}>
            <tbody>
              {accepted.map((change) => (
                <tr key={change.id}>
                  <td>
                    <strong>{change.title}</strong>
                    <div className={ui.quote}>{change.detail}</div>
                  </td>
                  <td className={ui.num} style={{ whiteSpace: "nowrap" }}>
                    {change.gain > 0 ? "+" : ""}
                    {change.gain} alone
                  </td>
                  <td>
                    <button
                      className={ui.button}
                      onClick={() =>
                        setAccepted(
                          accepted.filter(({ id }) => id !== change.id),
                        )
                      }
                    >
                      Drop
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={ui.hint} style={{ marginTop: 12 }}>
            Measured on standard rules with the same random events as your run.
            Apply the changes to your twin to run the shift again with your
            agents in charge.
          </p>
        </div>
      </div>

      <div className={ui.actions}>
        <button
          className={cn(ui.button, ui.primary)}
          onClick={apply}
        >
          Apply to my twin and run again
        </button>
        <Link to={path("report")} className={ui.button}>
          Back
        </Link>
      </div>
    </>
  );
}
