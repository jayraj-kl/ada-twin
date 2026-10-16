import { Link } from "react-router";
import { useEffect, useState } from "react";
import {
  ACCEPTED_KEY,
  RUN_KEY,
  type StoredRun,
  percent,
  useStored,
} from "@/twin/project";
import { type MeasuredChange, measureChanges } from "@/twin/recommend";
import { useProjectPath } from "@/lib/projects";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

const NOTHING_ACCEPTED: MeasuredChange[] = [];

const signed = (value: number, digits = 0) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}`;

function headline(run: StoredRun): string {
  const gained = run.kpis.completed - run.baseline.completed;
  const target = run.scenario.targets?.throughputPerShift;
  const crew =
    run.agents.length === 0
      ? "No agents ran this shift"
      : gained > 0
        ? `The crew shipped ${gained} more parts than standard rules`
        : gained < 0
          ? `The crew shipped ${-gained} fewer parts than standard rules`
          : "The crew matched standard rules";
  if (!target) return crew;
  return run.kpis.completed >= target
    ? `${crew}, and the target of ${target} was met`
    : `${crew}, but the plant is ${target - run.kpis.completed} short of ${target}`;
}

export default function ReportPage() {
  const path = useProjectPath();
  const [run, , loaded] = useStored<StoredRun | null>(RUN_KEY, null);
  const [accepted, setAccepted] = useStored(ACCEPTED_KEY, NOTHING_ACCEPTED);
  const [changes, setChanges] = useState<MeasuredChange[] | null>(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    setChanges(null);
    measureChanges(run).then(
      (measured) => !cancelled && setChanges(measured),
      (error: unknown) =>
        !cancelled &&
        setProblem(error instanceof Error ? error.message : String(error)),
    );
    return () => {
      cancelled = true;
    };
  }, [run]);

  if (!run) {
    return (
      <>
        <p className={ui.eyebrow}>Step 6 · Report</p>
        <h1 className={ui.title}>No shift has been run yet</h1>
        <p className={ui.lede}>
          {loaded ? "The report is written from a finished run." : "Loading…"}
        </p>
        <div className={ui.actions}>
          <Link
            to={path("run")}
            className={cn(ui.button, ui.primary)}
          >
            Run the shift
          </Link>
        </div>
      </>
    );
  }

  const names = new Map(run.graph.nodes.map(({ id, name }) => [id, name]));
  const stations = run.graph.nodes.filter(({ kind }) => kind === "station");
  const supports = run.graph.nodes.filter(({ kind }) => kind === "support");
  const hasSupport = supports.length > 0;
  const { kpis, baseline } = run;
  const target = run.scenario.targets?.throughputPerShift;
  // The station that was down most with the agents in charge.
  const worst = stations.reduce(
    (most, station) =>
      (kpis.stations[station.id]?.down ?? 0) >
      (kpis.stations[most.id]?.down ?? 0)
        ? station
        : most,
    stations[0]!,
  );
  const downNow = kpis.stations[worst.id]?.down ?? 0;
  const downBefore = baseline.stations[worst.id]?.down ?? 0;
  const cards = [
    {
      label: "Parts shipped",
      value: String(kpis.completed),
      before: String(baseline.completed),
      note: signed(kpis.completed - baseline.completed),
      good: kpis.completed >= baseline.completed,
    },
    {
      label: "Average work in progress",
      value: kpis.averageWip.toFixed(1),
      before: baseline.averageWip.toFixed(1),
      note: signed(kpis.averageWip - baseline.averageWip, 1),
      good: kpis.averageWip <= baseline.averageWip,
    },
    {
      label: `${worst.name} down`,
      value: percent(downNow),
      before: percent(downBefore),
      note: `${signed(Math.round((downNow - downBefore) * 100))} pts`,
      good: downNow <= downBefore,
    },
    {
      label: "Parts scrapped",
      value: String(kpis.scrapped),
      before: String(baseline.scrapped),
      note: signed(kpis.scrapped - baseline.scrapped),
      good: kpis.scrapped <= baseline.scrapped,
    },
    ...(target
      ? [
          {
            label: `Against target of ${target}`,
            value: percent(kpis.completed / target),
            before: percent(baseline.completed / target),
            note: kpis.completed >= target ? "met" : "still short",
            good: kpis.completed >= target,
          },
        ]
      : []),
  ];

  const isAccepted = (id: string) =>
    accepted.some((change) => change.id === id);
  const toggle = (change: MeasuredChange) =>
    setAccepted(
      isAccepted(change.id)
        ? accepted.filter(({ id }) => id !== change.id)
        : [...accepted, change],
    );
  // Accepted changes from an earlier run may no longer be proposed.
  const stillAccepted = accepted.filter((change) =>
    changes?.some(({ id }) => id === change.id),
  );

  return (
    <>
      <p className={ui.eyebrow}>Step 6 · Report</p>
      <h1 className={ui.title}>{headline(run)}</h1>
      <p className={ui.lede}>
        Same shift, same random events, run twice: once on standard rules and
        once with your agents. Each recommendation below was re-simulated, so
        its effect is measured, not estimated.
      </p>

      <div className={ui.grid3} style={{ marginBottom: 20 }}>
        {cards.map((card) => (
          <div key={card.label} className={ui.kpi}>
            <div className={ui.kpiLabel}>{card.label}</div>
            <div className={ui.kpiValue}>{card.value}</div>
            <div className={ui.delta}>
              standard rules {card.before} ·{" "}
              <span className={card.good ? ui.good : ui.poor}>
                {card.note}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className={ui.stack}>
        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            Recommendations
            <span className={ui.hint}>
              ranked by measured effect · measured on standard rules, same
              random events
            </span>
          </div>
          {problem ? (
            <p className={ui.poor}>{problem}</p>
          ) : !changes ? (
            <p className={ui.hint}>Re-simulating each change…</p>
          ) : (
            <table className={ui.table}>
              <tbody>
                {changes.map((change) => (
                  <tr key={change.id}>
                    <td>
                      <strong>{change.title}</strong>
                      <div className={ui.quote}>{change.detail}</div>
                    </td>
                    <td
                      className={cn(ui.num, change.gain > 0 ? ui.good : "")}
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {signed(change.gain)} parts per shift
                    </td>
                    <td>
                      <button
                        className={cn(ui.button, isAccepted(change.id) ? ui.primary : "")}
                        onClick={() => toggle(change)}
                      >
                        {isAccepted(change.id) ? "Accepted" : "Accept"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            Where each station&apos;s time went
            <span className={ui.hint}>
              with {run.agents.length === 0 ? "standard rules" : "agents"} ·
              bottleneck: {names.get(kpis.bottleneck ?? "") ?? "none"}
            </span>
          </div>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Station</th>
                <th className={ui.num}>Busy</th>
                <th className={ui.num}>Blocked</th>
                <th className={ui.num}>Down</th>
                {hasSupport && <th className={ui.num}>Stopped</th>}
                <th className={ui.num}>Idle</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {stations.map((station) => {
                const time = kpis.stations[station.id];
                if (!time) return null;
                // Runs saved before auxiliary equipment existed have none.
                const stopped = time.stopped ?? 0;
                const by = Object.entries(time.stoppedBy ?? {})
                  .filter(([, share]) => share > 0)
                  .map(
                    ([id, share]) => `${names.get(id) ?? id} ${percent(share)}`,
                  );
                return (
                  <tr key={station.id}>
                    <td>{station.name}</td>
                    <td className={ui.num}>{percent(time.utilisation)}</td>
                    <td className={ui.num}>{percent(time.blocked)}</td>
                    <td className={ui.num}>{percent(time.down)}</td>
                    {hasSupport && (
                      <td
                        className={ui.num}
                        title={
                          by.length > 0 ? `By ${by.join(", ")}` : undefined
                        }
                      >
                        {percent(stopped)}
                        {by.length > 0 && (
                          <div className={ui.hint}>by {by.join(", ")}</div>
                        )}
                      </td>
                    )}
                    <td className={ui.num}>{percent(time.idle)}</td>
                    <td>
                      <div className={ui.bar}>
                        <div
                          className={ui.running}
                          style={{ width: percent(time.utilisation) }}
                        />
                        <div
                          className={ui.blocked}
                          style={{ width: percent(time.blocked) }}
                        />
                        <div
                          className={ui.down}
                          style={{ width: percent(time.down) }}
                        />
                        <div
                          className={ui.stopped}
                          style={{ width: percent(stopped) }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {supports.length > 0 && (
          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              Auxiliary equipment
              <span className={ui.hint}>
                handles no parts; what needs it stops while it is down
              </span>
            </div>
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Needed by</th>
                  <th className={ui.num}>Down</th>
                  <th className={ui.num}>Before agents</th>
                </tr>
              </thead>
              <tbody>
                {supports.map((support) => (
                  <tr key={support.id}>
                    <td>{support.name}</td>
                    <td>
                      {(run.graph.dependencies ?? [])
                        .filter(({ support: id }) => id === support.id)
                        .map(({ neededBy }) => names.get(neededBy) ?? neededBy)
                        .join(", ") || "Nothing"}
                    </td>
                    <td className={ui.num}>
                      {percent(kpis.supports?.[support.id]?.down ?? 0)}
                    </td>
                    <td className={ui.num}>
                      {percent(baseline.supports?.[support.id]?.down ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            What the scenario changed
            <span className={ui.hint}>{run.scenario.name}</span>
          </div>
          <p className={ui.hint}>
            {run.scenario.shiftHours}-hour shift, seed {run.seed},{" "}
            {run.maintenanceCrews} maintenance{" "}
            {run.maintenanceCrews === 1 ? "crew" : "crews"},{" "}
            {run.decisions.length} agent decisions, {run.adjustments.length}{" "}
            adjustments to the twin.
          </p>
        </div>
      </div>

      <div className={ui.actions}>
        {stillAccepted.length > 0 ? (
          <Link
            to={path("redesign")}
            className={cn(ui.button, ui.primary)}
          >
            See the plant with the {stillAccepted.length} accepted{" "}
            {stillAccepted.length === 1 ? "change" : "changes"}
          </Link>
        ) : (
          <button className={cn(ui.button, ui.primary)} disabled>
            Accept a change to redesign
          </button>
        )}
        <Link to={path("run")} className={ui.button}>
          Back
        </Link>
      </div>
    </>
  );
}
