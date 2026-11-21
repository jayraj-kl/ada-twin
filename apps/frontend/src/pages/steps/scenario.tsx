import { type Scenario, applyScenario } from "@repo/sim";
import { Link } from "react-router";
import { useEffect, useMemo, useState } from "react";
import { EMPTY_FLOW, FLOW_KEY, type Flow, PROCESS_KEY } from "@/twin/flow";
import {
  MACHINES_KEY,
  type SavedMachine,
  buildGraph,
  useStored,
} from "@/twin/project";
import { useProjectId, useProjectPath } from "@/lib/projects";
import { getState, setState } from "@/lib/project-store";
import { applyAnswer, valueOf } from "@/scenario/fields";
import { usePlantScenario } from "@/scenario/plant";
import {
  ScenarioChat,
  type ScenarioChatMessage,
} from "@/scenario/ScenarioChat";
import { describeScenario, suggestScenarios } from "@/twin/api";
import { NumberField } from "@/components/ui/number-field";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

import { t } from "@/lib/i18n";
const NO_MACHINES: SavedMachine[] = [];
const CHAT_KEY = "twin-scenario-chat";
// The AI's suggestions, kept with what they were written for.
const SUGGESTIONS_KEY = "twin-scenario-suggestions";
interface StoredSuggestions {
  basis: string;
  suggestions: string[];
}
// Enough to follow the conversation; older turns drop off.
const CHAT_LIMIT = 40;

const PARAM_EFFECTS: Record<string, (factor: number) => string> = {
  interArrival: (factor) =>
    factor < 1
      ? t("Releases {0}% faster", { 0: Math.round((1 / factor - 1) * 100) })
      : t("Releases {0}% slower", { 0: Math.round((1 - 1 / factor) * 100) }),
  cycleTime: (factor) =>
    t("Cycle time +{0}%", { 0: Math.round((factor - 1) * 100) }),
  mtbf: (factor) =>
    t("Fails {0}% sooner", { 0: Math.round((1 / factor - 1) * 100) }),
  maintenanceCrews: (factor) =>
    t("{0}% fewer maintenance crews", { 0: Math.round((1 - factor) * 100) }),
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
          onChange(
            shown === undefined ? undefined : Math.max(min, shown) * scale,
          )
        }
        className="w-full"
      />
    </div>
  );
}

export default function ScenarioPage() {
  const path = useProjectPath();
  const [machines] = useStored(MACHINES_KEY, NO_MACHINES);
  const [flow] = useStored<Flow>(FLOW_KEY, EMPTY_FLOW);
  const graph = useMemo(() => buildGraph(machines, flow), [machines, flow]);
  // Sized to the plant until it is set here.
  const { scenario, setScenario, saved, capacity, unit } =
    usePlantScenario(graph);
  const capacityPerShift = capacity && Math.round(capacity.perShift);

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
      (getState(projectId, CHAT_KEY) as ScenarioChatMessage[] | undefined) ??
        [],
    );
    setChatLoaded(true);
  }, [projectId]);
  useEffect(() => {
    if (chatLoaded) setState(projectId, CHAT_KEY, chat.slice(-CHAT_LIMIT));
  }, [chat, chatLoaded, projectId]);

  // Starting points written for this plant, asked for again only when its
  // machines or process change. Null while they are being written.
  const [process] = useStored(PROCESS_KEY, "");
  const basis = useMemo(
    () =>
      JSON.stringify({
        machines: machines.map(({ name, count }) => ({ name, count })),
        process: process.trim(),
        capacityPerShift,
        unit,
      }),
    [machines, process, capacityPerShift, unit],
  );
  const [suggestions, setSuggestions] = useState<string[] | null>();
  const wantsSuggestions = chatLoaded && chat.length === 0;
  useEffect(() => {
    if (!wantsSuggestions) return;
    const saved = getState(projectId, SUGGESTIONS_KEY) as
      StoredSuggestions | undefined;
    if (saved?.basis === basis) {
      setSuggestions(saved.suggestions);
      return;
    }
    let cancelled = false;
    setSuggestions(null);
    const {
      machines: named,
      process: text,
      ...plant
    } = JSON.parse(basis) as {
      machines: { name: string; count?: number }[];
      process: string;
      capacityPerShift?: number;
      unit: string;
    };
    suggestScenarios({ machines: named, process: text || undefined, ...plant })
      .then((written) => {
        if (cancelled) return;
        setSuggestions(written);
        if (written.length > 0) {
          setState(projectId, SUGGESTIONS_KEY, { basis, suggestions: written });
        }
      })
      // The chat falls back to its own examples.
      .catch(() => !cancelled && setSuggestions([]));
    return () => {
      cancelled = true;
    };
  }, [wantsSuggestions, basis, projectId]);

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
        text: proposal && decided ? `${text} (proposal ${decided})` : text,
      }));
    setChat((current) => [...current, request]);
    setAsking(true);
    try {
      const answer = await describeScenario(
        scenario,
        machines.map(({ id, name }) => ({ id, name })),
        conversation,
        { capacityPerShift, unit },
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
          text: answer.reply || t("Here is what I would set."),
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
    const names = new Map(graph.nodes.map(({ id, name }) => [id, name]));
    try {
      const { adjustments } = applyScenario(graph, scenario);
      // The same heat effect on every station reads better as one line.
      const lines = new Map<string, { where: string[]; reason: string }>();
      for (const { node, param, factor, reason } of adjustments) {
        const effect = PARAM_EFFECTS[param]?.(factor) ?? `${param} ×${factor}`;
        const line = lines.get(effect + reason) ?? { where: [], reason };
        line.where.push(node ? (names.get(node) ?? node) : t("Whole plant"));
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
  }, [graph, scenario]);

  return (
    <>
      <p className={ui.eyebrow}>{t("Step 3 · Scenario")}</p>
      <h1 className={ui.title}>
        {t("What should the plant be tested against?")}
      </h1>
      <p className={ui.lede}>
        {t(
          "Set the conditions outside your control and the results you need. We show exactly how each condition changes the simulation before anything runs.",
        )}
      </p>

      <div
        data-tour="scenario-chat"
        className={ui.panel}
        style={{ marginBottom: 20 }}
      >
        <ScenarioChat
          messages={chat}
          unit={unit}
          suggestions={suggestions}
          busy={asking}
          onSend={ask}
          onAccept={(id) => decide(id, "accepted")}
          onDismiss={(id) => decide(id, "dismissed")}
          onClear={() => setChat([])}
        />
      </div>

      <div className={ui.grid2}>
        <div className={ui.stack}>
          <div data-tour="conditions" className={ui.panel}>
            <div className={ui.panelTitle}>
              {t("Conditions")}
              {saved ? (
                <button
                  type="button"
                  onClick={() => setScenario(null)}
                  title={t(
                    "Demand and targets go back to what this plant can make",
                  )}
                  className="text-xs font-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("Size to this plant")}
                </button>
              ) : (
                <span className={ui.hint}>{t("sized to this plant")}</span>
              )}
            </div>
            {capacityPerShift !== undefined && (
              <p className={ui.hint} style={{ marginBottom: 12 }}>
                {t("At its current figures this plant can make about")}{" "}
                {capacityPerShift} {unit} {t("in one")} {scenario.shiftHours}
                {t("-hour shift, held back by")}{" "}
                {graph.nodes.find(({ id }) => id === capacity?.bottleneck)
                  ?.name ?? t("its slowest station")}
                .
              </p>
            )}
            <div className={ui.field} style={{ marginBottom: 12 }}>
              <label htmlFor="name">{t("Name of this scenario")}</label>
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
                label={t("Shift length")}
                suffix="hours"
                min={1}
                value={scenario.shiftHours}
                onChange={(value) =>
                  set({ shiftHours: Math.min(24, value ?? 8) })
                }
              />
              <NumberSetting
                id="demand"
                label={t("Demand")}
                suffix={t("{0} per shift", { 0: unit })}
                value={scenario.demandPerShift}
                onChange={(value) => set({ demandPerShift: value })}
              />
              <NumberSetting
                id="temperature"
                label={t("Ambient temperature")}
                suffix="°C"
                min={-20}
                value={scenario.ambientTempC}
                onChange={(value) => set({ ambientTempC: value })}
              />
              <NumberSetting
                id="supply"
                label={t("Supply disrupted")}
                suffix="%"
                scale={0.01}
                value={scenario.supplyDisruption}
                onChange={(value) =>
                  set({ supplyDisruption: Math.min(0.9, value ?? 0) })
                }
              />
              <NumberSetting
                id="absent"
                label={t("Maintenance staff absent")}
                suffix="%"
                scale={0.01}
                value={scenario.absenteeism}
                onChange={(value) =>
                  set({ absenteeism: Math.min(1, value ?? 0) })
                }
              />
              <NumberSetting
                id="crews"
                label={t("Maintenance crews")}
                suffix="crews"
                min={1}
                value={scenario.maintenanceCrews}
                onChange={(value) => set({ maintenanceCrews: value ?? 1 })}
              />
            </div>
          </div>

          <div data-tour="requirements" className={ui.panel}>
            <div className={ui.panelTitle}>
              {t("Requirements")}
              <span className={ui.hint}>
                {t("leave one empty if it does not matter")}
              </span>
            </div>
            <div className={ui.fields}>
              <NumberSetting
                id="ship"
                label={t("Ship at least")}
                suffix={t("{0} per shift", { 0: unit })}
                value={scenario.targets?.throughputPerShift}
                onChange={(value) => setTarget({ throughputPerShift: value })}
              />
              <NumberSetting
                id="wip"
                label={t("Work in progress under")}
                suffix={unit}
                value={scenario.targets?.maxAverageWip}
                onChange={(value) => setTarget({ maxAverageWip: value })}
              />
              <NumberSetting
                id="down"
                label={t("Any station down less than")}
                suffix={t("% of the shift")}
                scale={0.01}
                value={scenario.targets?.maxDownShare}
                onChange={(value) => setTarget({ maxDownShare: value })}
              />
            </div>
          </div>

          <div data-tour="briefing" className={ui.panel}>
            <div className={ui.panelTitle}>
              {t("Crew briefing")}
              <span className={ui.hint}>
                {t("what your agents are told, beyond the targets")}
              </span>
            </div>
            <label htmlFor="briefing" className="sr-only">
              {t("Crew briefing")}
            </label>
            <textarea
              id="briefing"
              rows={3}
              className={cn(ui.input, "h-auto w-full py-2")}
              placeholder={t(
                "For example: the {0} has been playing up, so keep an eye on it. Missing {1} {2} is the one thing management will not accept.",
                {
                  0: (
                    machines.find(({ auxiliary }) => !auxiliary)?.name ??
                    "slowest machine"
                  ).toLowerCase(),
                  1: scenario.targets?.throughputPerShift ?? "the target of",
                  2: unit,
                },
              )}
              value={scenario.briefing ?? ""}
              onChange={(event) =>
                set({ briefing: event.target.value || undefined })
              }
            />
            <p className={ui.hint} style={{ marginTop: 6 }}>
              {t("It changes how the agents decide, not the plant itself.")}
            </p>
          </div>
        </div>

        <div data-tour="effects" className={ui.panel}>
          <div className={ui.panelTitle}>
            {t("What this changes")}
            <span className={ui.hint}>
              {t("your baseline twin is untouched")}
            </span>
          </div>
          {"problem" in effects ? (
            <p className={ui.poor}>{effects.problem}</p>
          ) : effects.rows.length === 0 ? (
            <p className={ui.hint}>
              {t("Nothing: these conditions match the twin as you built it.")}
            </p>
          ) : (
            <table className={ui.table}>
              <thead>
                <tr>
                  <th>{t("Where")}</th>
                  <th>{t("Effect")}</th>
                  <th>{t("Because")}</th>
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
            {t(
              "Heat effects are modelling assumptions, not measurements of your plant.",
            )}
          </p>
        </div>
      </div>

      <div data-tour="scenario-next" className={ui.actions}>
        <Link to={path("agents")} className={cn(ui.button, ui.primary)}>
          {t("Choose who runs it")}
        </Link>
        <Link to={path("twin")} className={ui.button}>
          {t("Back")}
        </Link>
      </div>
    </>
  );
}
