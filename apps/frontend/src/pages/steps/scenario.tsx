import { type Scenario, applyScenario } from "@repo/sim";
import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FLOW, FLOW_KEY, type Flow } from "@/twin/flow";
import {
  DEFAULT_SCENARIO,
  MACHINES_KEY,
  SCENARIO_KEY,
  type SavedMachine,
  buildGraph,
  useStored,
} from "@/twin/project";
import { useProjectId, useProjectPath } from "@/lib/projects";
import { getState, setState } from "@/lib/project-store";
import { applyAnswer, valueOf } from "@/scenario/fields";
import { ScenarioChat, type ScenarioChatMessage } from "@/scenario/ScenarioChat";
import { describeScenario } from "@/twin/api";
import { NumberField } from "@/components/ui/number-field";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

const NO_MACHINES: SavedMachine[] = [];
const CHAT_KEY = "twin-scenario-chat";
// Enough to follow the conversation; older turns drop off.
const CHAT_LIMIT = 40;

const PARAM_EFFECTS: Record<string, (factor: number) => string> = {
  interArrival: (factor) =>
    factor < 1
      ? `Releases ${Math.round((1 / factor - 1) * 100)}% faster`
      : `Releases ${Math.round((1 - 1 / factor) * 100)}% slower`,
  cycleTime: (factor) => `Cycle time +${Math.round((factor - 1) * 100)}%`,
  mtbf: (factor) => `Fails ${Math.round((1 / factor - 1) * 100)}% sooner`,
  maintenanceCrews: (factor) =>
    `${Math.round((1 - factor) * 100)}% fewer maintenance crews`,
};

/** A whole-number field; an empty box means "not set". */
function NumberSetting({
  id,
  label,
  suffix,
  value,
  scale = 1,
  min = 0,
  onChange,
}: {
  id: string;
  label: string;
  suffix: string;
  value: number | undefined;
  /** Stored units per shown unit, e.g. 0.01 for a share shown as a percentage. */
  scale?: number;
  min?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className={ui.field}>
      <label htmlFor={id}>
        {label} ({suffix})
      </label>
      <NumberField
        id={id}
        min={min}
        value={value === undefined ? undefined : Math.round(value / scale)}
        onValueChange={(shown) =>
          onChange(shown === undefined ? undefined : Math.max(min, shown) * scale)
        }
        className="w-full"
      />
    </div>
  );
}

export default function ScenarioPage() {
  const path = useProjectPath();
  const [scenario, setScenario] = useStored<Scenario>(
    SCENARIO_KEY,
    DEFAULT_SCENARIO,
  );
  const [machines] = useStored(MACHINES_KEY, NO_MACHINES);
  const [flow] = useStored<Flow>(FLOW_KEY, EMPTY_FLOW);

  const set = (change: Partial<Scenario>) =>
    setScenario({ ...scenario, ...change });
  const setTarget = (change: Scenario["targets"]) =>
    setScenario({ ...scenario, targets: { ...scenario.targets, ...change } });

  // --- describing the scenario in words --------------------------------------
  const projectId = useProjectId();
  const [chat, setChat] = useState<ScenarioChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [asking, setAsking] = useState(false);
  // Saved with the project; it has loaded before this step shows.
  useEffect(() => {
    setChat(
      (getState(projectId, CHAT_KEY) as ScenarioChatMessage[] | undefined) ?? [],
    );
    setChatLoaded(true);
  }, [projectId]);
  useEffect(() => {
    if (chatLoaded) setState(projectId, CHAT_KEY, chat.slice(-CHAT_LIMIT));
  }, [chat, chatLoaded, projectId]);

  async function ask(text: string) {
    const request: ScenarioChatMessage = {
      id: `s${Date.now().toString(36)}u`,
      role: "user",
      text,
    };
    // What each earlier answer proposed, and whether it was taken, is part
    // of the conversation; failed requests are not.
    const conversation = [...chat, request]
      .filter(({ failed }) => !failed)
      .map(({ role, text, proposal, decided }) => ({
        role,
        text:
          proposal && decided
            ? `${text} (proposal ${decided})`
            : text,
      }));
    setChat((current) => [...current, request]);
    setAsking(true);
    try {
      const answer = await describeScenario(
        scenario,
        machines.map(({ id, name }) => ({ id, name })),
        conversation,
      );
      const proposes =
        answer.changes.length > 0 ||
        answer.briefing !== null ||
        answer.notModelled.length > 0;
      setChat((current) => [
        ...current,
        {
          id: `s${Date.now().toString(36)}a`,
          role: "assistant",
          text: answer.reply || "Here is what I would set.",
          proposal: proposes
            ? {
                changes: answer.changes.map((change) => ({
                  ...change,
                  from: valueOf(scenario, change.field),
                })),
                briefing: answer.briefing,
                notModelled: answer.notModelled,
              }
            : undefined,
        },
      ]);
    } catch (error) {
      setChat((current) => [
        ...current,
        {
          id: `s${Date.now().toString(36)}e`,
          role: "assistant",
          text: error instanceof Error ? error.message : String(error),
          failed: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function decide(id: string, decided: "accepted" | "dismissed") {
    const message = chat.find((entry) => entry.id === id);
    if (decided === "accepted" && message?.proposal) {
      setScenario(applyAnswer(scenario, message.proposal));
    }
    setChat((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, decided } : entry)),
    );
  }

  const effects = useMemo(() => {
    const graph = buildGraph(machines, flow);
    const names = new Map(graph.nodes.map(({ id, name }) => [id, name]));
    try {
      const { adjustments } = applyScenario(graph, scenario);
      // The same heat effect on every station reads better as one line.
      const lines = new Map<string, { where: string[]; reason: string }>();
      for (const { node, param, factor, reason } of adjustments) {
        const effect = PARAM_EFFECTS[param]?.(factor) ?? `${param} ×${factor}`;
        const line = lines.get(effect + reason) ?? { where: [], reason };
        line.where.push(node ? (names.get(node) ?? node) : "Whole plant");
        lines.set(effect + reason, line);
      }
      return {
        rows: [...lines].map(([key, { where, reason }]) => ({
          where: where.join(", "),
          effect: key.slice(0, key.length - reason.length),
          reason,
        })),
      };
    } catch (error) {
      return {
        problem: error instanceof Error ? error.message : String(error),
      };
    }
  }, [machines, flow, scenario]);

  return (
    <>
      <p className={ui.eyebrow}>Step 3 · Scenario</p>
      <h1 className={ui.title}>What should the plant be tested against?</h1>
      <p className={ui.lede}>
        Set the conditions outside your control and the results you need. We
        show exactly how each condition changes the simulation before anything
        runs.
      </p>

      <div className={ui.panel} style={{ marginBottom: 20 }}>
        <ScenarioChat
          messages={chat}
          busy={asking}
          onSend={ask}
          onAccept={(id) => decide(id, "accepted")}
          onDismiss={(id) => decide(id, "dismissed")}
          onClear={() => setChat([])}
        />
      </div>

      <div className={ui.grid2}>
        <div className={ui.stack}>
          <div className={ui.panel}>
            <div className={ui.panelTitle}>Conditions</div>
            <div className={ui.field} style={{ marginBottom: 12 }}>
              <label htmlFor="name">Name of this scenario</label>
              <input
                id="name"
                className={ui.input}
                value={scenario.name}
                onChange={(event) => set({ name: event.target.value })}
              />
            </div>
            <div className={ui.fields}>
              <NumberSetting
                id="shift"
                label="Shift length"
                suffix="hours"
                min={1}
                value={scenario.shiftHours}
                onChange={(value) =>
                  set({ shiftHours: Math.min(24, value ?? 8) })
                }
              />
              <NumberSetting
                id="demand"
                label="Demand"
                suffix="parts per shift"
                value={scenario.demandPerShift}
                onChange={(value) => set({ demandPerShift: value })}
              />
              <NumberSetting
                id="temperature"
                label="Ambient temperature"
                suffix="°C"
                min={-20}
                value={scenario.ambientTempC}
                onChange={(value) => set({ ambientTempC: value })}
              />
              <NumberSetting
                id="supply"
                label="Supply disrupted"
                suffix="%"
                scale={0.01}
                value={scenario.supplyDisruption}
                onChange={(value) =>
                  set({ supplyDisruption: Math.min(0.9, value ?? 0) })
                }
              />
              <NumberSetting
                id="absent"
                label="Maintenance staff absent"
                suffix="%"
                scale={0.01}
                value={scenario.absenteeism}
                onChange={(value) =>
                  set({ absenteeism: Math.min(1, value ?? 0) })
                }
              />
              <NumberSetting
                id="crews"
                label="Maintenance crews"
                suffix="crews"
                min={1}
                value={scenario.maintenanceCrews}
                onChange={(value) => set({ maintenanceCrews: value ?? 1 })}
              />
            </div>
          </div>

          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              Requirements
              <span className={ui.hint}>
                leave one empty if it does not matter
              </span>
            </div>
            <div className={ui.fields}>
              <NumberSetting
                id="ship"
                label="Ship at least"
                suffix="parts per shift"
                value={scenario.targets?.throughputPerShift}
                onChange={(value) => setTarget({ throughputPerShift: value })}
              />
              <NumberSetting
                id="wip"
                label="Work in progress under"
                suffix="parts"
                value={scenario.targets?.maxAverageWip}
                onChange={(value) => setTarget({ maxAverageWip: value })}
              />
              <NumberSetting
                id="down"
                label="Any station down less than"
                suffix="% of the shift"
                scale={0.01}
                value={scenario.targets?.maxDownShare}
                onChange={(value) => setTarget({ maxDownShare: value })}
              />
            </div>
          </div>

          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              Crew briefing
              <span className={ui.hint}>
                what your agents are told, beyond the targets
              </span>
            </div>
            <label htmlFor="briefing" className="sr-only">
              Crew briefing
            </label>
            <textarea
              id="briefing"
              rows={3}
              className={cn(ui.input, "h-auto w-full py-2")}
              placeholder="For example: the cabinet has been tripping, so keep an eye on it. Missing 300 parts is the one thing management will not accept."
              value={scenario.briefing ?? ""}
              onChange={(event) =>
                set({ briefing: event.target.value || undefined })
              }
            />
            <p className={ui.hint} style={{ marginTop: 6 }}>
              It changes how the agents decide, not the plant itself.
            </p>
          </div>
        </div>

        <div className={ui.panel}>
          <div className={ui.panelTitle}>
            What this changes
            <span className={ui.hint}>your baseline twin is untouched</span>
          </div>
          {"problem" in effects ? (
            <p className={ui.poor}>{effects.problem}</p>
          ) : effects.rows.length === 0 ? (
            <p className={ui.hint}>
              Nothing: these conditions match the twin as you built it.
            </p>
          ) : (
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>Where</th>
                  <th>Effect</th>
                  <th>Because</th>
                </tr>
              </thead>
              <tbody>
                {effects.rows.map((row) => (
                  <tr key={row.effect + row.reason}>
                    <td>{row.where}</td>
                    <td>{row.effect}</td>
                    <td className={ui.quote}>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className={ui.hint} style={{ marginTop: 12 }}>
            Heat effects are modelling assumptions, not measurements of your
            plant.
          </p>
        </div>
      </div>

      <div className={ui.actions}>
        <Link
          to={path("agents")}
          className={cn(ui.button, ui.primary)}
        >
          Choose who runs it
        </Link>
        <Link to={path("twin")} className={ui.button}>
          Back
        </Link>
      </div>
    </>
  );
}
