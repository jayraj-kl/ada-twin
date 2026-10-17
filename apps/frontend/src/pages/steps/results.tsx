import { type Kpis, type Scenario, type SimEvent, applyDiffs } from "@repo/sim";
import {
  ArrowRightIcon,
  BoxesIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ListIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { NumberField } from "@/components/ui/number-field";
import { WorldView } from "@/components/viewer/WorldView";
import { springs } from "@/lib/motion";
import { projectKey, useProjectId, useProjectPath } from "@/lib/projects";
import { readJson, writeJson } from "@/lib/storage";
import { ui } from "@/lib/ui";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { type AppliedRedesign, KEPT_APPLIED } from "@/plant/rank";
import { DesignChat, type DesignChatMessage } from "@/results/DesignChat";
import {
  STATUS_STYLE,
  STATUS_WORD,
  centroid,
  floorAt,
  flyersFor,
} from "@/results/floor";
import { costKey, signed } from "@/results/format";
import { ChangesTab, type RedesignVersion, ResultsTab } from "@/results/tabs";
import {
  type CostEstimate,
  designChanges,
  estimateCosts,
  streamRun,
} from "@/twin/api";
import { EMPTY_FLOW, FLOW_KEY, type Flow, flowProblems } from "@/twin/flow";
import {
  ACCEPTED_KEY,
  AGENTS_KEY,
  APPLIED_KEY,
  CAMERA_HEIGHT_M,
  COSTS_KEY,
  type CrewSettings,
  DEFAULT_CREW,
  DEFAULT_SCENARIO,
  DESIGN_CHAT_KEY,
  type DecisionRecord,
  HISTORY_KEY,
  MACHINES_KEY,
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
import {
  type Change,
  type MeasuredChange,
  applyToTwin,
  costRequests,
  measure,
  measureChanges,
} from "@/twin/recommend";

const NO_MACHINES: SavedMachine[] = [];
const NO_CHANGES: Change[] = [];
const NO_HISTORY: RedesignVersion[] = [];
const NO_COSTS: Record<string, CostEstimate> = {};
// Simulated seconds played per real second; the second plays an eight-hour
// shift in two minutes.
const SPEEDS = [120, 240, 480, 960];
// Enough to follow the conversation; older turns drop off.
const CHAT_LIMIT = 40;
const PANE_PX = 440;

type View = "baseline" | "redesign";
type Tab = "results" | "changes";

interface Live {
  horizon: number;
  decisions: DecisionRecord[];
  events: SimEvent[];
}

const PARAM_NOTE: Record<string, string> = {
  cycleTime: "new cycle time",
  cycleTimeVariation: "steadier",
  mtbf: "fails less often",
  mttr: "faster repairs",
  scrapRate: "less scrap",
  interArrival: "new arrival rate",
};

/** What each changed machine's pin says about the redesign. */
function pinNotes(changes: Change[], edges: Flow["links"]) {
  const notes = new Map<string, string[]>();
  const add = (id: string, note: string) =>
    notes.set(id, [...(notes.get(id) ?? []), note]);
  for (const diff of changes.flatMap(({ diffs }) => diffs)) {
    if (diff.type === "add-units") {
      add(
        diff.station,
        `+${diff.count} ${diff.count === 1 ? "unit" : "units"}`,
      );
    } else if (diff.type === "add-spare") {
      add(
        diff.support,
        `+${diff.count} ${diff.count === 1 ? "spare" : "spares"}`,
      );
    } else if (diff.type === "insert-buffer") {
      add(diff.to, `${diff.name} (${diff.capacity}) before`);
    } else if (diff.type === "resize-buffer") {
      // A buffer has no pin; the machine it feeds carries the note.
      const fed = edges.find(({ from }) => from === diff.buffer)?.to;
      if (fed) add(fed, `buffer before → ${diff.capacity}`);
    } else {
      add(diff.node, PARAM_NOTE[diff.param] ?? "changed");
    }
  }
  return notes;
}

function Decision({ record }: { record: DecisionRecord }) {
  return (
    <li
      className="border-l-2 pl-2.5 text-xs"
      style={{ borderLeftColor: ROLE_INFO[record.agent.role].colour }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{record.agent.name}</span>
        <span className="font-mono text-[11px] text-white/60">
          {clock(record.time)}
        </span>
      </div>
      <div>{record.options[record.choice]}</div>
      <div className="text-white/60 italic">
        {record.fallback
          ? `Standard rule used: ${record.fallback}`
          : `“${record.reason}”`}
      </div>
    </li>
  );
}

export default function ResultsPage() {
  const path = useProjectPath();
  const projectId = useProjectId();
  const desktop = useMediaQuery("(min-width: 1024px)");
  const navigate = useNavigate();

  const [machines, setMachines, machinesLoaded] = useStored(
    MACHINES_KEY,
    NO_MACHINES,
  );
  const [flow, setFlow] = useStored<Flow>(FLOW_KEY, EMPTY_FLOW);
  const [scenario, setScenario] = useStored<Scenario>(
    SCENARIO_KEY,
    DEFAULT_SCENARIO,
  );
  const [crew] = useStored<CrewSettings>(AGENTS_KEY, DEFAULT_CREW);
  const [run, setRun, runLoaded] = useStored<StoredRun | null>(RUN_KEY, null);
  const [kept, setKept] = useStored<Change[]>(ACCEPTED_KEY, NO_CHANGES);
  const [history, setHistory] = useStored<RedesignVersion[]>(
    HISTORY_KEY,
    NO_HISTORY,
  );
  const [costs, setCosts, costsLoaded] = useStored(COSTS_KEY, NO_COSTS);
  const [currency, setCurrency] = useStored("twin-cost-currency", "USD");
  const [applied] = useStored<AppliedRedesign[]>(APPLIED_KEY, []);

  const [view, setView] = useState<View>("baseline");
  const [tab, setTab] = useState<Tab>("results");
  const [sheet, setSheet] = useState(false);
  const [showDecisions, setShowDecisions] = useState(false);

  // --- the shift -------------------------------------------------------------
  const [seed, setSeed] = useState(1);
  const [live, setLive] = useState<Live | null>(null);
  const [runProblem, setRunProblem] = useState("");
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
  // The twin or scenario changed since the run, e.g. by applying a redesign.
  const stale =
    run !== null &&
    machinesLoaded &&
    (JSON.stringify(run.graph) !== JSON.stringify(graph) ||
      JSON.stringify(run.scenario) !== JSON.stringify(scenario));

  useEffect(() => {
    if (run) setSeed(run.seed);
    // Only the saved run's seed, once it has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runLoaded]);

  async function start() {
    setRunProblem("");
    setPlaying(false);
    setView("baseline");
    setShowDecisions(true);
    const opening = { horizon: scenario.shiftHours * 3600 };
    const state: Live = { horizon: opening.horizon, decisions: [], events: [] };
    setLive({ ...state });
    const controller = new AbortController();
    cancel.current = controller;
    let started: Pick<
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
            started = line;
            state.horizon = line.horizon;
          } else if (line.type === "decision") {
            state.decisions = [...state.decisions, line.record];
          } else if (line.type === "events") {
            state.events = [...state.events, ...line.events];
          } else if (line.type === "error") {
            throw new Error(line.message);
          } else if (started) {
            setRun({
              ...started,
              seed,
              tickMinutes: crew.tickMinutes,
              scenario,
              graph,
              agents: crew.agents,
              kpis: line.kpis,
              events: line.events,
              decisions: state.decisions,
            });
            setTime(0);
            setPlaying(true);
            return;
          }
          setLive({ ...state });
        },
        controller.signal,
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setRunProblem(error instanceof Error ? error.message : String(error));
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
    const began = performance.now();
    const from = time;
    const timer = setInterval(() => {
      const next = from + ((performance.now() - began) / 1000) * speed;
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

  const liveTime = live
    ? Math.max(live.events.at(-1)?.time ?? 0, live.decisions.at(-1)?.time ?? 0)
    : 0;
  const floor = useMemo(
    () =>
      live ? floorAt(live.events, Infinity) : floorAt(run?.events ?? [], time),
    [live, run, time],
  );

  // --- the redesign ----------------------------------------------------------
  const [suggestions, setSuggestions] = useState<MeasuredChange[] | null>(null);
  const [redesign, setRedesign] = useState<Kpis | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [designProblem, setDesignProblem] = useState("");
  const [alone, setAlone] = useState<Record<string, number | "failed">>({});
  const [previews, setPreviews] = useState<Record<string, number | "failed">>(
    {},
  );
  const [chat, setChat] = useState<DesignChatMessage[]>([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [asking, setAsking] = useState(false);
  const chatKey = projectKey(projectId, DESIGN_CHAT_KEY);

  useEffect(() => {
    setChat(readJson<DesignChatMessage[]>(chatKey) ?? []);
    setChatLoaded(true);
  }, [chatKey]);
  useEffect(() => {
    if (chatLoaded) writeJson(chatKey, chat.slice(-CHAT_LIMIT));
  }, [chat, chatLoaded, chatKey]);

  // Each measurement is the same shift on standard rules, so a set of
  // changes always measures the same: keep the answers for this run.
  const measured = useRef(new Map<string, Promise<Kpis>>());
  useEffect(() => {
    measured.current = new Map();
  }, [run]);
  const measureOnce = useCallback(
    (changes: Change[]) => {
      if (!run) return Promise.reject(new Error("No run"));
      const key = JSON.stringify(
        changes.map(({ diffs, extraCrews }) => [diffs, extraCrews]),
      );
      let kpis = measured.current.get(key);
      if (!kpis) {
        kpis = measure(run, changes);
        measured.current.set(key, kpis);
      }
      return kpis;
    },
    [run],
  );

  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    setSuggestions(null);
    measureChanges(run).then(
      (changes) => !cancelled && setSuggestions(changes),
      () => !cancelled && setSuggestions([]),
    );
    return () => {
      cancelled = true;
    };
  }, [run]);

  useEffect(() => {
    if (!run || kept.length === 0) {
      setRedesign(null);
      setDesignProblem("");
      return;
    }
    let cancelled = false;
    setMeasuring(true);
    setDesignProblem("");
    measureOnce(kept)
      .then(
        (kpis) => !cancelled && setRedesign(kpis),
        (error: unknown) => {
          if (cancelled) return;
          setRedesign(null);
          setDesignProblem(
            `The redesign cannot be simulated: ${error instanceof Error ? error.message : String(error)}. Drop the change that no longer fits.`,
          );
        },
      )
      .finally(() => !cancelled && setMeasuring(false));
    return () => {
      cancelled = true;
    };
  }, [run, kept, measureOnce]);

  // What each kept change gains on its own.
  useEffect(() => {
    if (!run) return;
    let cancelled = false;
    for (const change of kept) {
      measureOnce([change]).then(
        (kpis) =>
          !cancelled &&
          setAlone((current) => ({
            ...current,
            [change.id]: kpis.completed - run.baseline.completed,
          })),
        () =>
          !cancelled &&
          setAlone((current) => ({ ...current, [change.id]: "failed" })),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [run, kept, measureOnce]);

  // What each change the assistant proposed would add to the redesign.
  const pending = useMemo(
    () =>
      chat.flatMap((message) =>
        (message.proposed ?? []).filter(({ id }) => !message.decided?.[id]),
      ),
    [chat],
  );
  useEffect(() => {
    if (!run || pending.length === 0) return;
    let cancelled = false;
    const base =
      kept.length > 0 ? measureOnce(kept) : Promise.resolve(run.baseline);
    for (const change of pending) {
      Promise.all([base, measureOnce([...kept, change])]).then(
        ([before, after]) =>
          !cancelled &&
          setPreviews((current) => ({
            ...current,
            [change.id]: after.completed - before.completed,
          })),
        () =>
          !cancelled &&
          setPreviews((current) => ({ ...current, [change.id]: "failed" })),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [run, kept, pending, measureOnce]);

  /** Saves the redesign as a new version. */
  function commit(next: Change[], label: string) {
    const versions =
      history.length > 0
        ? history
        : [
            {
              at: Date.now() - 1,
              label: kept.length > 0 ? "Accepted earlier" : "No changes",
              changes: kept,
            },
          ];
    setKept(next);
    setHistory(
      [...versions, { at: Date.now(), label, changes: next }].slice(-30),
    );
    if (next.length > 0) setView("redesign");
  }

  function keep(messageId: string, changes: Change[]) {
    const fresh = changes.filter(
      ({ id }) => !kept.some((change) => change.id === id),
    );
    if (fresh.length > 0) {
      commit(
        [...kept, ...fresh],
        fresh.length === 1
          ? `Kept: ${fresh[0]!.title}`
          : `Kept ${fresh.length} changes`,
      );
    }
    setChat((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              decided: {
                ...message.decided,
                ...Object.fromEntries(
                  changes.map(({ id }) => [id, "kept" as const]),
                ),
              },
            }
          : message,
      ),
    );
  }

  function dropProposal(messageId: string, changeId: string) {
    setChat((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              decided: { ...message.decided, [changeId]: "dropped" },
            }
          : message,
      ),
    );
  }

  function addSuggestion(change: MeasuredChange) {
    if (kept.some(({ id }) => id === change.id)) return;
    commit(
      [...kept, { ...change, origin: "suggested" }],
      `Added: ${change.title}`,
    );
  }

  function dropKept(id: string) {
    const change = kept.find((candidate) => candidate.id === id);
    commit(
      kept.filter((candidate) => candidate.id !== id),
      `Dropped: ${change?.title ?? id}`,
    );
  }

  async function askDesign(text: string) {
    if (!run) return;
    const request: DesignChatMessage = {
      id: `d${Date.now().toString(36)}`,
      role: "user",
      text,
    };
    // Earlier answers go back with what came of their proposals.
    const conversation = [...chat.filter(({ failed }) => !failed), request].map(
      ({ role, text, proposed, decided }) => ({
        role,
        text:
          proposed && proposed.length > 0
            ? `${text} (Proposed: ${proposed
                .map(
                  ({ id, title }) =>
                    `${title}, ${decided?.[id] ?? "not decided yet"}`,
                )
                .join("; ")})`
            : text,
      }),
    );
    setChat((current) => [...current, request]);
    setAsking(true);
    try {
      const plant = applyDiffs(
        run.graph,
        kept.flatMap(({ diffs }) => diffs),
      );
      const answer = await designChanges(
        plant,
        redesign ?? run.baseline,
        run.scenario,
        conversation,
      );
      setChat((current) => [
        ...current,
        {
          id: `d${Date.now().toString(36)}a`,
          role: "assistant",
          text: answer.reply,
          proposed: answer.changes.map((change) => ({
            ...change,
            origin: "asked",
          })),
        },
      ]);
    } catch (error) {
      setChat((current) => [
        ...current,
        {
          id: `d${Date.now().toString(36)}e`,
          role: "assistant",
          text: error instanceof Error ? error.message : String(error),
          failed: true,
        },
      ]);
    } finally {
      setAsking(false);
    }
  }

  function applyRedesign() {
    // The last step reports on what was applied, so it is kept before the
    // redesign is cleared.
    if (run) {
      const record: AppliedRedesign = {
        id: `a${Date.now().toString(36)}`,
        at: Date.now(),
        changes: kept,
        run: {
          seed: run.seed,
          tickMinutes: run.tickMinutes,
          scenario: run.scenario,
          graph: run.graph,
          baseline: run.baseline,
        },
        machines: machines.map(
          ({ id, name, pins, count, auxiliary, spares }) => ({
            id,
            name,
            pins,
            count,
            auxiliary,
            spares,
          }),
        ),
        costs: Object.fromEntries(
          kept.flatMap((change) => {
            const estimate = costs[costKey(currency, change)];
            return estimate ? [[change.id, estimate]] : [];
          }),
        ),
        currency,
      };
      const key = projectKey(projectId, APPLIED_KEY);
      writeJson(
        key,
        [...(readJson<AppliedRedesign[]>(key) ?? []), record].slice(
          -KEPT_APPLIED,
        ),
      );
    }
    const next = applyToTwin({ machines, flow, scenario }, kept);
    setMachines(next.machines);
    setFlow(next.flow);
    setScenario(next.scenario);
    setKept([]);
    setHistory([]);
    setView("baseline");
    navigate(path("plant"));
  }

  // --- costs, looked up once the changes tab is opened ----------------------
  const [pricing, setPricing] = useState(false);
  const [costProblem, setCostProblem] = useState("");
  const [repricing, setRepricing] = useState(0);
  useEffect(() => {
    if (tab !== "changes" || !costsLoaded || !machinesLoaded) return;
    const unpriced = kept
      .filter((change) => !costs[costKey(currency, change)])
      .slice(0, 10);
    if (unpriced.length === 0) return;
    let cancelled = false;
    setPricing(true);
    setCostProblem("");
    estimateCosts(costRequests(unpriced, machines), currency)
      .then((estimates) => {
        if (cancelled) return;
        const next = { ...costs };
        for (const estimate of estimates) {
          const change = unpriced.find(({ id }) => id === estimate.id);
          if (change) next[costKey(currency, change)] = estimate;
        }
        setCosts(next);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setCostProblem(
            error instanceof Error ? error.message : String(error),
          );
      })
      .finally(() => !cancelled && setPricing(false));
    return () => {
      cancelled = true;
    };
    // `costs` is what this writes; re-running when it changes would only
    // find nothing left to price.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, kept, costsLoaded, machinesLoaded, currency, repricing]);

  // --- the world -------------------------------------------------------------
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
  const agents = live ? crew.agents : (run?.agents ?? crew.agents);
  const jobsKey = floor.jobs.join("\n");
  const flyers = useMemo(
    () => flyersFor(stops, agents, jobsKey ? jobsKey.split("\n") : []),
    [stops, agents, jobsKey],
  );
  const showRedesign = view === "redesign" && !live;
  const notes = useMemo(
    () => pinNotes(kept, run ? run.graph.edges : flow.links),
    [kept, run, flow.links],
  );
  const items = stops.map((stop) => {
    if (showRedesign) {
      const note = notes.get(stop.id);
      return {
        id: stop.id,
        position: stop.point,
        content: (
          <div
            className={cn(
              ui.pin,
              note ? "border-ink bg-primary text-[#14140f]" : "opacity-70",
            )}
          >
            {stop.name}
            {note && <strong> · {note.join(", ")}</strong>}
          </div>
        ),
      };
    }
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
  const gain =
    redesign && run ? redesign.completed - run.baseline.completed : null;
  const suggestionRows = suggestions?.map((change) => ({
    ...change,
    added: kept.some(({ id }) => id === change.id),
  }));
  const unusedSuggestions = (suggestions ?? []).filter(
    (change) => change.gain > 0 && !kept.some(({ id }) => id === change.id),
  );

  // Esc closes what is open over the world.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (showDecisions) setShowDecisions(false);
      else if (sheet) setSheet(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showDecisions, sheet]);

  const runLabel = live ? "Running…" : run ? "Run again" : "Run the shift";
  const runDisabled = !ready || Boolean(live);
  const chatDisabled = !run
    ? "Run the shift first, then redesign it here"
    : live
      ? "Wait for the shift to finish"
      : undefined;

  const tabs = (
    <div
      role="tablist"
      aria-label="Results"
      className="flex gap-1 rounded-full bg-muted p-1"
    >
      {(
        [
          ["results", "Results"],
          ["changes", `Changes · ${kept.length}`],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={tab === key}
          onClick={() => {
            setTab(key);
            if (!desktop) setSheet(true);
          }}
          className={cn(
            "relative flex-1 rounded-full px-3 py-1.5 text-[13px] font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            tab === key
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab === key && (
            <motion.span
              layoutId="results-tab"
              transition={springs.snappy}
              className="absolute inset-0 rounded-full border border-border bg-card shadow-sm"
            />
          )}
          <span className="relative">{label}</span>
        </button>
      ))}
    </div>
  );

  const paneBody = run ? (
    tab === "results" ? (
      <ResultsTab
        run={run}
        redesign={redesign}
        measuring={measuring}
        showRedesign={view === "redesign"}
        suggestions={suggestionRows ?? null}
        problem={designProblem}
        onAdd={addSuggestion}
      />
    ) : (
      <ChangesTab
        changes={kept}
        alone={alone}
        together={kept.length === 0 ? 0 : gain}
        costs={costs}
        currency={currency}
        pricing={pricing}
        costProblem={costProblem}
        history={history}
        onCurrency={setCurrency}
        onReprice={() => {
          setCosts(
            Object.fromEntries(
              Object.entries(costs).filter(
                ([key]) => !key.startsWith(`${currency}:`),
              ),
            ),
          );
          setRepricing(repricing + 1);
        }}
        onDrop={dropKept}
        onRestore={(index) =>
          commit(history[index]!.changes, `Restored v${index + 1}`)
        }
      />
    )
  ) : (
    <div className="flex flex-col gap-2 py-6 text-center">
      <BoxesIcon className="mx-auto size-8 text-muted-foreground" />
      <h2 className="font-semibold">
        {runLoaded ? "No shift has run yet" : "Loading…"}
      </h2>
      <p className="text-sm text-muted-foreground">
        Run the shift to see where time goes, what to change, and to redesign
        the plant with the assistant.
      </p>
    </div>
  );

  const chatBox = (
    <DesignChat
      messages={chat}
      busy={asking}
      disabled={chatDisabled}
      suggestions={unusedSuggestions}
      previews={previews}
      compact={!desktop && !sheet}
      onSend={(text) => void askDesign(text)}
      onKeep={keep}
      onDrop={dropProposal}
      onSuggest={addSuggestion}
      onClear={() => setChat([])}
    />
  );

  return (
    <div className="flex h-full">
      {/* The world, with the shift played over it. */}
      <div className="relative min-w-0 flex-1 overflow-hidden bg-[#14140f]">
        <div className="absolute inset-0">
          <WorldView
            worldDir={WORLD_DIR}
            cameraHeightMetres={CAMERA_HEIGHT_M}
            items={items}
            flyers={showRedesign ? [] : flyers}
            flyersMoving={Boolean(live) || playing}
            style={{ width: "100%", height: "100%", cursor: "grab" }}
          />
        </div>

        {/* Top: which plant is shown, and what to do with it. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-3 sm:p-4">
          <div
            role="tablist"
            aria-label="Plant"
            className="pointer-events-auto flex rounded-full border border-ink bg-card p-1 shadow-hard-sm"
          >
            {(
              [
                ["baseline", "Your plant"],
                ["redesign", `Redesign · ${kept.length}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={view === key}
                disabled={Boolean(live)}
                onClick={() => setView(key)}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-[13px] font-semibold whitespace-nowrap outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-50",
                  view === key
                    ? "text-[#14140f]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view === key && (
                  <motion.span
                    layoutId="results-view"
                    transition={springs.snappy}
                    className="absolute inset-0 rounded-full bg-primary"
                  />
                )}
                <span className="relative">{label}</span>
              </button>
            ))}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {applied.length > 0 && kept.length === 0 && !live && (
              <Link
                to={path("plant")}
                className={cn(ui.button, "h-9 bg-card")}
                title="The changes you applied, ranked, and drawn into your photos"
              >
                New plant <ArrowRightIcon />
              </Link>
            )}
            {kept.length > 0 && !live && (
              <button
                className={cn(ui.button, "h-9 bg-card")}
                onClick={applyRedesign}
                title="Make the redesign your twin, then see the changes ranked and drawn into your photos"
              >
                <CheckCheckIcon /> Apply to my twin
              </button>
            )}
            <span
              title={
                !ready ? "Finish the twin's material flow first" : undefined
              }
            >
              <button
                className={cn(
                  ui.button,
                  "h-9",
                  run && !stale ? "bg-card" : ui.primary,
                )}
                disabled={runDisabled}
                onClick={start}
              >
                {run ? <RotateCcwIcon /> : <PlayIcon />} {runLabel}
              </button>
            </span>
          </div>
        </div>

        {/* What the floor looks like at the playhead, or what the redesign does. */}
        {run && !live && (
          <div className="pointer-events-none absolute top-16 left-3 flex flex-col items-start gap-1.5 sm:left-4">
            {showRedesign ? (
              <span className="rounded-full border border-white/15 bg-[#14140f]/80 px-3 py-1 text-xs text-white backdrop-blur-md">
                {kept.length === 0
                  ? "No changes yet: add one on the right"
                  : gain === null
                    ? measuring
                      ? "Measuring the redesign…"
                      : "The redesign cannot be simulated"
                    : `${signed(gain)} parts per shift on standard rules`}
              </span>
            ) : (
              <span className="rounded-full border border-white/15 bg-[#14140f]/80 px-3 py-1 font-mono text-xs text-white backdrop-blur-md">
                shipped {floor.shipped} · in progress {floor.wip} · scrapped{" "}
                {floor.scrapped}
                {stopped.length > 0 && (
                  <span className="text-[#ff8c42]">
                    {" "}
                    · stopped: {stopped.join(", ")}
                  </span>
                )}
              </span>
            )}
          </div>
        )}

        {/* Bottom: the shift's clock, its decisions, and running it. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex flex-col items-start gap-2 p-3 sm:p-4",
            desktop ? "bottom-0" : "bottom-[136px]",
          )}
        >
          <AnimatePresence>
            {showDecisions && (live || run) && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={springs.snappy}
                className="pointer-events-auto w-full max-w-[460px] rounded-2xl border border-white/15 bg-[#14140f]/85 p-3 text-white backdrop-blur-md"
              >
                <div className="mb-2 flex items-center justify-between text-xs font-semibold">
                  Decisions · {decisions.length}
                  <button
                    type="button"
                    onClick={() => setShowDecisions(false)}
                    aria-label="Hide the decisions"
                    className="grid size-6 place-items-center rounded-full text-white/70 outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50"
                  >
                    <ChevronDownIcon className="size-4" />
                  </button>
                </div>
                {decisions.length === 0 ? (
                  <p className="text-xs text-white/60">
                    {agents.length === 0
                      ? "There are no agents, so every role follows standard rules."
                      : "Decisions appear here as the agents make them."}
                  </p>
                ) : (
                  <ol className="flex max-h-[min(32svh,280px)] flex-col gap-2.5 overflow-y-auto pr-1">
                    {decisions.map((record, index) => (
                      <Decision
                        key={`${record.time}-${record.agent.id}-${index}`}
                        record={record}
                      />
                    ))}
                  </ol>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pointer-events-auto w-full max-w-[460px] rounded-2xl border border-white/15 bg-[#14140f]/85 p-3 text-white backdrop-blur-md">
            {live ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <strong className="font-mono text-sm">
                    Simulating… {clock(liveTime)} / {clock(live.horizon)}
                  </strong>
                  <button
                    className={darkPill}
                    onClick={() => cancel.current?.abort()}
                  >
                    Cancel
                  </button>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-500"
                    style={{
                      width: `${Math.min(100, (liveTime / live.horizon) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-white/60">
                  {agents.length > 0
                    ? "The agents are deciding now; each decision is a question to Gemini. The replay starts when the shift is over."
                    : "Simulating on standard rules."}
                </p>
              </>
            ) : run ? (
              <>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!playing && time >= horizon) setTime(0);
                      setPlaying(!playing);
                    }}
                    aria-label={
                      playing ? "Pause" : time >= horizon ? "Replay" : "Play"
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-full border border-ink bg-primary text-[#14140f] outline-none focus-visible:ring-[3px] focus-visible:ring-primary/50"
                  >
                    {playing ? (
                      <PauseIcon className="size-4" />
                    ) : time >= horizon ? (
                      <RotateCcwIcon className="size-4" />
                    ) : (
                      <PlayIcon className="size-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    aria-label="Time into the shift"
                    className="min-w-0 flex-1 accent-[var(--primary)]"
                    min={0}
                    max={horizon}
                    step={60}
                    value={time}
                    onChange={(event) => {
                      setPlaying(false);
                      setTime(Number(event.target.value));
                    }}
                  />
                  <span className="shrink-0 font-mono text-xs">
                    {clock(time)} / {clock(horizon)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <label htmlFor="speed" className="sr-only">
                    Speed
                  </label>
                  <select
                    id="speed"
                    className="h-7 rounded-full border border-white/25 bg-transparent px-2 text-xs text-white outline-none [&>option]:text-black"
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
                  <button
                    className={darkPill}
                    onClick={() => setShowDecisions((open) => !open)}
                  >
                    <ListIcon className="mr-1 inline size-3.5 align-[-3px]" />
                    Decisions · {run.decisions.length}
                    {showDecisions ? (
                      <ChevronDownIcon className="ml-0.5 inline size-3.5 align-[-3px]" />
                    ) : (
                      <ChevronUpIcon className="ml-0.5 inline size-3.5 align-[-3px]" />
                    )}
                  </button>
                  <span className="ml-auto flex items-center gap-1.5 text-white/70">
                    Seed
                    <NumberField
                      id="seed"
                      size="sm"
                      className="w-24 border-white/25 bg-transparent text-white"
                      min={1}
                      value={seed}
                      onValueChange={(next) => setSeed(next || 1)}
                    />
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <strong className="text-sm">Ready to run the shift</strong>
                <p className="text-xs text-white/70">
                  {crew.agents.length > 0
                    ? `${crew.agents.length} agents run the floor. Each planning check-in and breakdown is a question to Gemini, so a run takes a few minutes.`
                    : "No agents: the shift runs on standard rules in seconds."}
                </p>
              </div>
            )}
            {(stale || runProblem || (machinesLoaded && !ready)) && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-[#ffd23f]">
                <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
                <span>
                  {runProblem ? (
                    `The run failed: ${runProblem}`
                  ) : !ready ? (
                    <>
                      The twin cannot be simulated yet: finish its material flow
                      in the{" "}
                      <Link to={path("twin")} className="underline">
                        twin step
                      </Link>
                      .
                    </>
                  ) : (
                    "Your twin has changed since this run. Run the shift again to see it with your agents."
                  )}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Results, the redesign's changes, and the assistant. */}
      {desktop ? (
        <aside
          aria-label="Results and redesign"
          className="flex shrink-0 flex-col border-l border-border bg-card text-card-foreground"
          style={{ width: PANE_PX }}
        >
          <div className="border-b border-border p-3">{tabs}</div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {paneBody}
          </div>
          <div className="border-t border-border p-3">{chatBox}</div>
        </aside>
      ) : (
        <motion.aside
          aria-label="Results and redesign"
          layout
          transition={springs.snappy}
          className={cn(
            "absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[var(--radius-card)] border-t border-ink bg-card text-card-foreground shadow-[0_-12px_40px_rgb(0_0_0/0.25)]",
            sheet ? "h-[82%]" : "",
          )}
        >
          <button
            type="button"
            onClick={() => setSheet((open) => !open)}
            aria-expanded={sheet}
            aria-label={sheet ? "Lower the panel" : "Raise the panel"}
            className="flex justify-center pt-2.5 pb-1 outline-none"
          >
            <span className="h-1.5 w-10 rounded-full bg-border" />
          </button>
          <div className="px-3 pb-2">{tabs}</div>
          {sheet && (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-4 py-4">
              {paneBody}
            </div>
          )}
          <div className="border-t border-border p-3">{chatBox}</div>
        </motion.aside>
      )}
    </div>
  );
}

const darkPill =
  "rounded-full border border-white/25 px-3 py-1 text-xs font-semibold text-white outline-none hover:border-primary hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50";
